
import { supabase } from '../supabaseClient';
import { SlabRecord, OpnameRecord, Location, OpnameBackup, SupplierSlabRecord } from '../types';

export const StockTables = {
  SAP: 'sap_stock',
  MOTHER: 'mother_slab_stock',
  CUT: 'cut_slab_stock',
  SUPPLIER: 'supplier_slab_import'
};

const BUCKET_NAME = 'Slab_Opname';

// --- Global Cache for Opname Records ---
let recordsCache: OpnameRecord[] | null = null;
const CACHE_LIMIT = 10000; // Safety limit if needed, but we rely on fetching all

/**
 * Fetches ALL opname records from the database using pagination.
 * Stores result in memory cache to avoid repeated large fetches.
 * @param forceReload If true, ignores cache and re-fetches from DB.
 */
export const fetchAllOpnameRecords = async (forceReload = false) => {
  if (recordsCache && !forceReload) {
    return recordsCache;
  }

  let allRecords: any[] = [];
  let from = 0;
  const step = 1000;
  let more = true;

  while (more) {
    const { data, error } = await supabase
      .from('opname_records')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + step - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      from += step;
      if (data.length < step) {
        more = false;
      }
    } else {
      more = false;
    }
  }

  recordsCache = allRecords;
  return allRecords;
};

/**
 * Updates the local cache based on Realtime payload events (INSERT, UPDATE, DELETE).
 * Call this from subscription callbacks to keep cache fresh without re-fetching all.
 */
export const updateOpnameCacheFromPayload = (eventType: string, oldRecord: any, newRecord: any) => {
  if (!recordsCache) return; // If no cache, next fetch will get everything

  if (eventType === 'INSERT' && newRecord) {
    recordsCache = [newRecord, ...recordsCache];
  } else if (eventType === 'UPDATE' && newRecord) {
    recordsCache = recordsCache.map(r => r.id === newRecord.id ? newRecord : r);
  } else if (eventType === 'DELETE') {
    if (oldRecord?.id) {
      recordsCache = recordsCache.filter(r => r.id !== oldRecord.id);
    } else if (oldRecord?.user_name) {
      recordsCache = recordsCache.filter(r => r.user_name?.toLowerCase() !== oldRecord.user_name?.toLowerCase());
    } else {
      recordsCache = null;
    }
  }
};


export const fetchLatestStock = async (table: string, limit = 10) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
};

export const getCount = async (table: string) => {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

export const getStockCounts = async () => {
  const [sap, mother, cut] = await Promise.all([
    getCount(StockTables.SAP),
    getCount(StockTables.MOTHER),
    getCount(StockTables.CUT)
  ]);
  return { sap, mother, cut };
};

export const getUnopnamedCounts = async () => {
  // 1. Get total counts from stock tables
  const [sapTotal, motherTotal, cutTotal] = await Promise.all([
    getCount(StockTables.SAP),
    getCount(StockTables.MOTHER),
    getCount(StockTables.CUT)
  ]);

  // 2. Get opname records for detailed calculation
  // CHANGED: Use fetchAllOpnameRecords to ensure we calculate against ALL data
  const opnameRecords = await fetchAllOpnameRecords();

  // Helper to calculate stats per category
  const calculateStats = (total: number, sourceKey: 'grade_sap' | 'grade_mother' | 'grade_cut') => {
    // Only count if the field has a value (not null/empty/-)
    const matchedRecords = opnameRecords?.filter((r: any) => r[sourceKey] && r[sourceKey] !== '' && r[sourceKey] !== '-') || [];

    // Unique Opnamed Count
    const uniqueOpnamed = new Set(matchedRecords.map((r: any) => r.batch_id)).size;

    // Unique Breakdown by Status (within matched records)
    const uniqueSync = new Set(matchedRecords.filter((r: any) => r.status === 'Synchronized').map((r: any) => r.batch_id)).size;
    const uniqueMissing = new Set(matchedRecords.filter((r: any) => r.status === 'Missing Data').map((r: any) => r.batch_id)).size;

    return {
      total,
      opnamed: uniqueOpnamed,
      remaining: Math.max(0, total - uniqueOpnamed),
      synchronized: uniqueSync,
      missing: uniqueMissing
    };
  };

  return {
    sap: calculateStats(sapTotal, 'grade_sap'),
    mother: calculateStats(motherTotal, 'grade_mother'),
    cut: calculateStats(cutTotal, 'grade_cut')
  };
};

export const getSystemNotification = async () => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('notification_text')
    .eq('id', 1)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // Ignore no rows error (default handles it)
  return data?.notification_text || '';
};

export const updateSystemNotification = async (text: string) => {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 1, notification_text: text, updated_at: new Date().toISOString() });
  if (error) throw error;
};

export const searchSlab = async (code: string): Promise<{
  sap: SlabRecord[];
  mother: SlabRecord[];
  cut: SlabRecord[];
  opname: OpnameRecord[];
  supplierMap: Record<string, SupplierSlabRecord>;
  decodedDirectMatch: SupplierSlabRecord | null;
}> => {
  if (!code || !code.trim()) {
    return { sap: [], mother: [], cut: [], opname: [], supplierMap: {}, decodedDirectMatch: null };
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('slab_opname_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'search_slabs_with_supplier', code })
    });

    if (res.ok) {
      const json = await res.json();
      return {
        sap: json.sap || [],
        mother: json.mother || [],
        cut: json.cut || [],
        opname: json.opname || [],
        supplierMap: json.supplierMap || {},
        decodedDirectMatch: json.decodedDirectMatch || null
      };
    }
  } catch (err) {
    console.error('searchSlab error:', err);
  }

  return { sap: [], mother: [], cut: [], opname: [], supplierMap: {}, decodedDirectMatch: null };
};

export const uploadEvidenceImage = async (file: File, filename: string) => {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const path = `images/${dateStr}/${filename}`;

  const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
    upsert: true,
    contentType: 'image/jpeg' // or auto-detect
  });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return urlData.publicUrl;
};

export const saveOpnameRecord = async (record: OpnameRecord) => {
  const cleanRecord = {
    ...record,
    actual_thick: record.actual_thick ? Number(record.actual_thick) : null,
    actual_width: record.actual_width ? Number(record.actual_width) : null,
    actual_length: record.actual_length ? Number(record.actual_length) : null,
    database_t: record.database_t ? Number(record.database_t) : null,
    database_w: record.database_w ? Number(record.database_w) : null,
    database_l: record.database_l ? Number(record.database_l) : null,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())
  };

  const { data, error } = await supabase
    .from('opname_records')
    .insert([cleanRecord]);
  
  if (error) throw error;

  // Immediate local cache update for smooth UI without expensive O(N) CSV write
  if (data && data.length > 0) {
    updateOpnameCacheFromPayload('INSERT', null, data[0]);
  }

  return data;
};

export const syncOpnameListToStorage = async () => {
  // CHANGED: Use fetchAllOpnameRecords(true) to ensure we have the very latest state before writing CSV
  // Force reload here to be safe for the CSV file integrity
  const records = await fetchAllOpnameRecords(true);

  if (!records || records.length === 0) return;

  const headers = [
    'Date', 'User', 'Time', 'Batch ID',
    'Grade_SAP', 'Grade_MotherSlab', 'Grade_CutSlab',
    'Database_T', 'Database_W', 'Database_L',
    'Location', 'Gang/Baris', 'Status',
    'Dimensi Match dengan Data', 'Actual Thick', 'Actual Width', 'Actual Length',
    'Grade Match dengan Data', 'Actual Grade', 'Remarks'
  ];

  const rows = records.map((r: any) => {
    // Logic for match columns derivation
    const dimMatch = (!r.database_t && !r.database_w && !r.database_l) ? 'NO REFERENCE' : (r.dimension_match ? 'YES' : 'NO');
    const gradeMatch = (!r.grade_sap && !r.grade_mother && !r.grade_cut) ? 'NO REFERENCE' : (r.grade_match ? 'YES' : 'NO');

    return [
      r.date, r.user_name, r.time, r.batch_id,
      r.grade_sap || '-', r.grade_mother || '-', r.grade_cut || '-',
      r.database_t || '-', r.database_w || '-', r.database_l || '-',
      r.location, r.gang_baris || '-', r.status,
      dimMatch,
      r.actual_thick || '-', r.actual_width || '-', r.actual_length || '-',
      gradeMatch,
      r.actual_grade || '-',
      (r.remarks || '').replace(/,/g, ' ')
    ];
  });
  
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  
  await supabase.storage.from(BUCKET_NAME).upload('Opname_List.csv', blob, {
    contentType: 'text/csv',
    upsert: true
  });
};

export const deleteOpnameRecord = async (id: string) => {
  const { error } = await supabase
    .from('opname_records')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const getBackups = async () => {
    const { data, error } = await supabase.from('opname_backups').select('id, created_at, name').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
};

export const saveBackup = async (name: string) => {
    // CHANGED: Use fetchAllOpnameRecords(true) to ensure backup is complete
    const records = await fetchAllOpnameRecords(true);

    const { error: saveError } = await supabase.from('opname_backups').insert([{
        name,
        data: records
    }]);
    if (saveError) throw saveError;
};

export const loadBackup = async (backupId: string) => {
    const { data: backup, error: fetchError } = await supabase.from('opname_backups').select('*').eq('id', backupId).single();
    if (fetchError) throw fetchError;

    if (!backup || !backup.data) throw new Error("Backup not found or empty");

    // Clear all existing records
    const { error: deleteError } = await supabase.from('opname_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) throw deleteError;

    // Restore from backup
    const recordsToInsert = (backup.data as any[]).map(r => r);

    // Safe batch replacement into database
    if (recordsToInsert.length > 0) {
      const { error: insertError } = await (supabase.from('opname_records') as any).replaceRows(recordsToInsert);
      if (insertError) throw insertError;
    }

    // Force refresh cache after restore
    await fetchAllOpnameRecords(true);
    await syncOpnameListToStorage();
};

export const deleteStockCSV = async (type: 'sap' | 'mother' | 'cut') => {
  const table = type === 'sap' ? StockTables.SAP : type === 'mother' ? StockTables.MOTHER : StockTables.CUT;
  const fileName = type === 'sap' ? 'SAP_Stock.csv' : type === 'mother' ? 'MotherSlab_Stock.csv' : 'CutSlab_Stock.csv';

  const { error: dbError } = await supabase.from(table).delete().neq('batch_id', '___FORCE_CLEAR___');
  if (dbError) throw dbError;

  const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([fileName]);
};

export const uploadStockCSV = async (type: 'sap' | 'mother' | 'cut', records: SlabRecord[], rawFile: File) => {
  const table = type === 'sap' ? StockTables.SAP : type === 'mother' ? StockTables.MOTHER : StockTables.CUT;
  const fileName = type === 'sap' ? 'SAP_Stock.csv' : type === 'mother' ? 'MotherSlab_Stock.csv' : 'CutSlab_Stock.csv';

  await supabase.storage.from(BUCKET_NAME).upload(fileName, rawFile, {
    contentType: 'text/csv',
    upsert: true
  });
  
  const dbRecords = records.map(r => ({
    batch_id: r.batch_id,
    grade: r.grade,
    thickness: r.thickness,
    width: r.width,
    length: r.length,
    slab_weight: r.slab_weight
  }));

  const { error } = await (supabase.from(table) as any).replaceRows(dbRecords);
  if (error) throw error;
};

export const fetchLocations = async () => {
  const { data, error } = await supabase.from('locations').select('*');
  if (error) throw error;
  return data as Location[];
};

export const addLocation = async (name: string) => {
  const { error } = await supabase.from('locations').insert([{ name }]);
  if (error) throw error;
};

export const deleteLocation = async (id: string) => {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw error;
};

export const kickAndRemoveUser = async (targetName: string) => {
  const { error } = await supabase.from('users_online').delete().eq('name', targetName);
  if (error) throw error;

  const channel = supabase.channel('system-signals');
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: 'KICK_USER',
        payload: { name: targetName }
      }).then(() => {
        setTimeout(() => supabase.removeChannel(channel), 1000);
      });
    }
  });
};

export const deleteUser = async (name: string) => {
  const { error } = await supabase.from('users_online').delete().eq('name', name);
  if (error) throw error;
};

export interface LockStatus {
  lock_mode: boolean;
  locked_at: string | null;
  locked_by: string | null;
}

export const getLockStatus = async (): Promise<LockStatus> => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('lock_mode, locked_at, locked_by')
    .eq('id', 1)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  
  return {
    lock_mode: data?.lock_mode ?? false,
    locked_at: data?.locked_at ?? null,
    locked_by: data?.locked_by ?? null
  };
};

export const setLockMode = async (locked: boolean, adminName: string): Promise<void> => {
  const { error } = await supabase
    .from('system_settings')
    .update({
      lock_mode: locked,
      locked_at: locked ? new Date().toISOString() : null,
      locked_by: locked ? adminName : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);
  
  if (error) throw error;
};

export interface ComprehensiveBackup {
  id: string;
  created_at: string;
  name: string;
  created_by: string;
  record_count: number;
}

export const getComprehensiveBackups = async (): Promise<ComprehensiveBackup[]> => {
  const { data, error } = await supabase
    .from('opname_backups')
    .select('id, created_at, name, data')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return (data || []).map(b => ({
    id: b.id,
    created_at: b.created_at,
    name: b.name,
    created_by: (b.data as any)?._meta?.created_by || 'Unknown',
    record_count: Array.isArray(b.data) ? b.data.length : 0
  }));
};

export const createComprehensiveBackup = async (name: string, adminName: string): Promise<void> => {
  const [opnameRecords, usersOnline, locations, sapStock, motherStock, cutStock, settings] = await Promise.all([
    supabase.from('opname_records').select('*'),
    supabase.from('users_online').select('*'),
    supabase.from('locations').select('*'),
    supabase.from('sap_stock').select('*'),
    supabase.from('mother_slab_stock').select('*'),
    supabase.from('cut_slab_stock').select('*'),
    supabase.from('system_settings').select('*').eq('id', 1).single()
  ]);

  const backupData = {
    opname_records: opnameRecords.data || [],
    users_online: usersOnline.data || [],
    locations: locations.data || [],
    sap_stock: sapStock.data || [],
    mother_stock: motherStock.data || [],
    cut_stock: cutStock.data || [],
    system_settings: settings.data,
    _meta: {
      created_by: adminName,
      created_at: new Date().toISOString(),
      version: '2.0'
    }
  };

  const { error } = await supabase.from('opname_backups').insert([{
    name,
    data: backupData
  }]);

  if (error) throw error;
};

export const loadComprehensiveBackup = async (backupId: string): Promise<void> => {
  const { data: backup, error: fetchError } = await supabase
    .from('opname_backups')
    .select('data')
    .eq('id', backupId)
    .single();
  
  if (fetchError) throw fetchError;
  if (!backup?.data) throw new Error('Backup not found or empty');

  const bd = backup.data as any;

  await supabase.from('opname_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (bd.opname_records?.length > 0) {
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < bd.opname_records.length; i += CHUNK_SIZE) {
      const chunk = bd.opname_records.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('opname_records').insert(chunk);
      if (error) throw error;
    }
  }

  if (bd.locations?.length > 0) {
    await supabase.from('locations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabase.from('locations').insert(bd.locations);
    if (error) throw error;
  }

  if (bd.sap_stock?.length > 0) {
    await supabase.from('sap_stock').delete().neq('batch_id', '___FORCE_CLEAR___');
    const { error } = await supabase.from('sap_stock').insert(bd.sap_stock);
    if (error) throw error;
  }

  if (bd.mother_stock?.length > 0) {
    await supabase.from('mother_slab_stock').delete().neq('batch_id', '___FORCE_CLEAR___');
    const { error } = await supabase.from('mother_slab_stock').insert(bd.mother_stock);
    if (error) throw error;
  }

  if (bd.cut_stock?.length > 0) {
    await supabase.from('cut_slab_stock').delete().neq('batch_id', '___FORCE_CLEAR___');
    const { error } = await supabase.from('cut_slab_stock').insert(bd.cut_stock);
    if (error) throw error;
  }

  await fetchAllOpnameRecords(true);
  await syncOpnameListToStorage();
};

export const deleteBackup = async (backupId: string): Promise<void> => {
  const { error } = await supabase.from('opname_backups').delete().eq('id', backupId);
  if (error) throw error;
};

export const clearDataset = async (): Promise<void> => {
  const { error } = await supabase.from('opname_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;

  await supabase.storage.from(BUCKET_NAME).remove(['Opname_List.csv']);
  
  await fetchAllOpnameRecords(true);
};
