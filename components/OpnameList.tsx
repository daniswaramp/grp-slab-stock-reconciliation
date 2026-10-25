import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { OpnameRecord, UserRole, OpnameBackup } from '../types';
import { getBackups, saveBackup, loadBackup, fetchAllOpnameRecords, updateOpnameCacheFromPayload, clearDataset } from '../services/dataService';
import { Download, Trash2, Filter, FileSpreadsheet, Save, RotateCcw, Upload, ChevronDown, Database, Link, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Calendar, Clock } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  role: UserRole;
  userName: string;
  isLocked?: boolean;
}

const OpnameList: React.FC<Props> = ({ role, userName, isLocked = false }) => {
  const [records, setRecords] = useState<OpnameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [backups, setBackups] = useState<OpnameBackup[]>([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllInput, setDeleteAllInput] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const { t } = useI18n();
  const [itemsPerPage, setItemsPerPage] = useState(100);

  // Sorting State
  const [sortField, setSortField] = useState<'date' | 'time'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'date' | 'time') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    inspector: '',
    batchId: '',
    location: '',
    status: '',
    verification: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRecords();
    const sub = supabase
      .channel('records-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opname_records' }, (payload) => {
        updateOpnameCacheFromPayload(payload.eventType, payload.old, payload.new);

        setRecords(prev => {
          let updated = [...prev];
          if (payload.eventType === 'INSERT') {
            updated = [payload.new as OpnameRecord, ...updated];
          } else if (payload.eventType === 'UPDATE') {
            updated = updated.map(r => r.id === payload.new.id ? payload.new as OpnameRecord : r);
          } else if (payload.eventType === 'DELETE') {
            if (payload.old?.id) {
              updated = updated.filter(r => r.id !== payload.old.id);
            } else if (payload.old?.user_name) {
              updated = updated.filter(r => r.user_name?.toLowerCase() !== payload.old.user_name?.toLowerCase());
            } else {
              updated = [];
            }
          }
          return updated.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
        const data = await fetchAllOpnameRecords();
        setRecords(data || []);
    } catch (e) {
        console.error("Failed to fetch records", e);
    } finally {
        setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
        const data = await getBackups();
        setBackups(data as any[]);
    } catch (e) {
        console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      await supabase.from('opname_records').delete().eq('id', id);
    }
  };

  const handleDeleteAllConfirm = async () => {
    if (deleteAllInput.trim().toLowerCase() !== 'yes i want to delete all list') return;
    setDeletingAll(true);
    try {
      await clearDataset();
      setRecords([]);
      setShowDeleteAllModal(false);
      setDeleteAllInput('');
      alert(t.opnameList.deleteAllSuccess);
    } catch (err: any) {
      console.error('Failed to delete all list:', err);
      alert('Error deleting records: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleBackupAction = async (action: 'save' | 'load' | 'upload' | 'download') => {
    setShowBackupMenu(false);
    if (action === 'save') {
        const name = prompt("Enter backup name (e.g. Shift 1 Complete):", `Backup ${new Date().toLocaleString()}`);
        if (name) {
            try {
                await saveBackup(name);
                alert("Backup saved successfully!");
            } catch (e: any) {
                alert("Error saving backup: " + e.message);
            }
        }
    } else if (action === 'load') {
        await fetchBackups();
        setShowLoadModal(true);
    } else if (action === 'download') {
        const jsonContent = JSON.stringify(records, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `opname_backup_${new Date().toISOString()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else if (action === 'upload') {
        fileInputRef.current?.click();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const content = evt.target?.result as string;
            let data: OpnameRecord[] = [];
            const isCsv = file.name.toLowerCase().endsWith('.csv');

            if (isCsv) {
                const lines = content.split('\n').map(l => l.trim()).filter(l => l);
                data = lines.slice(1).map(line => {
                    const cols = line.split(',').map(c => c.trim());
                    const num = (v: string) => (v && v !== '-' ? Number(v) : undefined);
                    const str = (v: string) => (v && v !== '-' ? v : '');

                    const date = str(cols[0]);
                    const user_name = str(cols[1]);
                    const time = str(cols[2]);
                    const batch_id = str(cols[3]);
                    const grade_sap = str(cols[4]);
                    const grade_mother = str(cols[5]);
                    const grade_cut = str(cols[6]);
                    const database_t = num(cols[7]);
                    const database_w = num(cols[8]);
                    const database_l = num(cols[9]);
                    const location = str(cols[10]);
                    const gang_baris = str(cols[11]);
                    const status = str(cols[12]) as any;
                    const dimMatchStr = str(cols[13]);
                    const dimension_match = dimMatchStr === 'YES';
                    const actual_thick = num(cols[14]);
                    const actual_width = num(cols[15]);
                    const actual_length = num(cols[16]);
                    const gradeMatchStr = str(cols[17]);
                    const grade_match = gradeMatchStr === 'YES';
                    const actual_grade = str(cols[18]);
                    const remarks = str(cols[19]);
                    const image_url = str(cols[20]);
                    const grade = actual_grade || grade_sap || grade_mother || grade_cut || 'N/A';

                    return {
                        user_name, batch_id, grade, location, status, dimension_match, grade_match,
                        batch_match: true, remarks, time, date, grade_sap, grade_mother, grade_cut,
                        database_t, database_w, database_l, actual_thick, actual_width, actual_length,
                        actual_grade, actual_batch_id: batch_id, gang_baris, image_url
                    } as OpnameRecord;
                });
            } else {
                data = JSON.parse(content);
                if (!Array.isArray(data)) throw new Error("Invalid backup format");
            }

            const name = file.name.replace(/\.(json|csv)$/i, '') + ' (Uploaded)';
            const { error } = await supabase.from('opname_backups').insert([{ name, data }]);
            if (error) throw error;
            alert("Backup uploaded successfully! You can now Load it.");
        } catch (err: any) {
            console.error(err);
            alert("Error uploading backup: " + err.message);
        }
    };
    reader.readAsText(file);
  };

  const handleRestore = async (id: string) => {
    if (confirm("WARNING: This will OVERWRITE current active data with the selected backup. Continue?")) {
        try {
            await loadBackup(id);
            alert("Data loaded successfully!");
            setShowLoadModal(false);
            fetchRecords();
        } catch (e: any) {
            alert("Error loading data: " + e.message);
        }
    }
  };

  const exportCSV = () => {
    if (records.length === 0) return;
    const headers = [
        'Date', 'User', 'Time', 'Batch ID',
        'Grade SAP', 'Grade Mother', 'Grade Cut',
        'Database Thick', 'Database Width', 'Database Length',
        'Location', 'Gang/Baris', 'Status',
        'Dimensi Match dengan Data', 'Actual Thick', 'Actual Width', 'Actual Length',
        'Grade Match dengan Data', 'Actual Grade', 'Remarks',
        'Evidence'
    ];

    const rows = records.map(r => {
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
            (r.remarks || '').replace(/,/g, ' '),
            r.image_url || '-'
        ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `opname_list_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uniqueInspectors = Array.from(new Set(records.map(r => r.user_name))).sort();
  const uniqueStatus = Array.from(new Set(records.map(r => r.status))).sort();

  const filteredRecords = records.filter(r => {
    if (filters.startDate && r.date && r.date < filters.startDate) return false;
    if (filters.endDate && r.date && r.date > filters.endDate) return false;
    if (filters.inspector && r.user_name !== filters.inspector) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.batchId && !r.batch_id.toLowerCase().includes(filters.batchId.toLowerCase())) return false;
    if (filters.location && !r.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.verification) {
        const dimMatch = (!r.database_t && !r.database_w && !r.database_l) ? 'NO REFERENCE' : (r.dimension_match ? 'YES' : 'NO');
        const gradeMatch = (!r.grade_sap && !r.grade_mother && !r.grade_cut) ? 'NO REFERENCE' : (r.grade_match ? 'YES' : 'NO');
        if (dimMatch !== filters.verification && gradeMatch !== filters.verification) return false;
    }
    return true;
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (sortField === 'date') {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }
      const timeA = a.time || '';
      const timeB = b.time || '';
      return sortOrder === 'asc' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
    } else if (sortField === 'time') {
      const timeA = a.time || '';
      const timeB = b.time || '';
      if (timeA !== timeB) {
        return sortOrder === 'asc' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
      }
      const dateA = a.date || '';
      const dateB = b.date || '';
      return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedRecords.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fadeIn pb-10">
      <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">{t.opnameList.title}</h2>
          <p className="text-xs sm:text-sm text-gray-400">{t.opnameList.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            {/* Quick Sort Buttons */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 shadow-sm">
              <button
                onClick={() => handleSort('date')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                  sortField === 'date'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                title="Sort by Date (Asc/Desc)"
              >
                <Calendar size={13} />
                <span className="hidden sm:inline">{t.opnameList.sortByDate}</span>
                <span className="sm:hidden">Date</span>
                {sortField === 'date' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                ) : (
                  <ArrowUpDown size={12} className="text-gray-400" />
                )}
              </button>

              <button
                onClick={() => handleSort('time')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                  sortField === 'time'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                title="Sort by Time (Asc/Desc)"
              >
                <Clock size={13} />
                <span className="hidden sm:inline">{t.opnameList.sortByTime}</span>
                <span className="sm:hidden">Time</span>
                {sortField === 'time' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />
                ) : (
                  <ArrowUpDown size={12} className="text-gray-400" />
                )}
              </button>
            </div>

            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowFilters(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border ${
                showFilters || Object.values(filters).filter(Boolean).length > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                  : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
              }`}
              title="Toggle Filters"
            >
              <Filter size={13} />
              <span>Filters</span>
              {Object.values(filters).filter(Boolean).length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              )}
            </button>

            {role === UserRole.ADMIN && !isLocked && (
              <div className="relative">
                  <button
                      onClick={() => setShowBackupMenu(!showBackupMenu)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all text-xs"
                  >
                      <Database size={15} /> <span className="hidden sm:inline">{t.opnameList.backup}</span> <ChevronDown size={13}/>
                  </button>
                  {showBackupMenu && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20">
                          <button onClick={() => handleBackupAction('load')} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"><RotateCcw size={14}/> {t.opnameList.loadBackup}</button>
                          <button onClick={() => handleBackupAction('save')} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"><Save size={14}/> {t.opnameList.saveBackup}</button>
                          <button onClick={() => handleBackupAction('upload')} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"><Upload size={14}/> Upload CSV / JSON</button>
                          <button onClick={() => handleBackupAction('download')} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"><Download size={14}/> Download JSON</button>
                      </div>
                  )}
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".json,.csv" />
              </div>
            )}

            {role === UserRole.ADMIN && !isLocked && (
              <button
                onClick={() => {
                  setDeleteAllInput('');
                  setShowDeleteAllModal(true);
                }}
                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg font-bold flex items-center gap-1.5 transition-all active:scale-95 text-xs shadow-sm"
                title={t.opnameList.deleteAll}
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">{t.opnameList.deleteAll}</span>
                <span className="sm:hidden">Delete</span>
              </button>
            )}

            <button
              onClick={exportCSV}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg font-bold flex items-center gap-1.5 sm:gap-2 transition-all shadow-md active:scale-95 text-xs"
            >
              <FileSpreadsheet size={15} /> <span className="hidden sm:inline">{t.opnameList.exportCsv}</span><span className="sm:hidden">CSV</span>
            </button>
        </div>
      </div>

      {/* Collapsible Filter Bar on Mobile */}
      <div className={`bg-gray-50 p-3 sm:p-4 border-b border-gray-100 ${showFilters ? 'grid' : 'hidden md:grid'} grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3 animate-fadeIn`}>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">From Date</span>
             <input type="date" className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, startDate: e.target.value}); setCurrentPage(1);}} />
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">To Date</span>
             <input type="date" className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, endDate: e.target.value}); setCurrentPage(1);}} />
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">Inspector</span>
             <select className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, inspector: e.target.value}); setCurrentPage(1);}}>
                 <option value="">All</option>
                 {uniqueInspectors.map(u => <option key={u} value={u}>{u}</option>)}
             </select>
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">Batch ID</span>
             <input type="text" placeholder="Search..." className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, batchId: e.target.value}); setCurrentPage(1);}} />
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">Location</span>
             <input type="text" placeholder="Search..." className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, location: e.target.value}); setCurrentPage(1);}} />
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">Status</span>
             <select className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, status: e.target.value}); setCurrentPage(1);}}>
                 <option value="">All</option>
                 {uniqueStatus.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
         </div>
         <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase">Verification</span>
             <select className="border rounded-lg px-2 py-1 text-xs" onChange={e => {setFilters({...filters, verification: e.target.value}); setCurrentPage(1);}}>
                 <option value="">All</option>
                 <option value="YES">YES</option>
                 <option value="NO">NO</option>
                 <option value="NO REFERENCE">NO REFERENCE</option>
             </select>
         </div>
      </div>

      <div className="overflow-x-auto touch-pan-x">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-gray-100 text-gray-500 uppercase font-bold tracking-wider">
            <tr>
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors select-none group"
                title="Click to sort by Date (Asc/Desc)"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t.opnameList.date}</span>
                  {sortField === 'date' ? (
                    sortOrder === 'asc' ? <ArrowUp size={13} className="text-blue-600" /> : <ArrowDown size={13} className="text-blue-600" />
                  ) : (
                    <ArrowUpDown size={12} className="text-gray-400 group-hover:text-gray-600" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3">{t.opnameList.user}</th>
              <th
                onClick={() => handleSort('time')}
                className="px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors select-none group"
                title="Click to sort by Time (Asc/Desc)"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t.opnameList.time}</span>
                  {sortField === 'time' ? (
                    sortOrder === 'asc' ? <ArrowUp size={13} className="text-blue-600" /> : <ArrowDown size={13} className="text-blue-600" />
                  ) : (
                    <ArrowUpDown size={12} className="text-gray-400 group-hover:text-gray-600" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3">{t.opnameList.batchId}</th>
              <th className="px-4 py-3 bg-blue-50 text-blue-800">Grade SAP</th>
              <th className="px-4 py-3 bg-purple-50 text-purple-800">Grade Mother</th>
              <th className="px-4 py-3 bg-orange-50 text-orange-800">Grade Cut</th>
              <th className="px-4 py-3">Database Thick</th>
              <th className="px-4 py-3">Database Width</th>
              <th className="px-4 py-3">Database Length</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Gang/Baris</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dim Match</th>
              <th className="px-4 py-3 bg-red-50 text-red-800">Act. Thick</th>
              <th className="px-4 py-3 bg-red-50 text-red-800">Act. Width</th>
              <th className="px-4 py-3 bg-red-50 text-red-800">Act. Length</th>
              <th className="px-4 py-3">Grd Match</th>
              <th className="px-4 py-3 bg-red-50 text-red-800">Act. Grade</th>
              <th className="px-4 py-3">Remarks</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentItems.map((r) => {
                const dimMatch = (!r.database_t && !r.database_w && !r.database_l) ? 'NO REFERENCE' : (r.dimension_match ? 'YES' : 'NO');
                const gradeMatch = (!r.grade_sap && !r.grade_mother && !r.grade_cut) ? 'NO REFERENCE' : (r.grade_match ? 'YES' : 'NO');

                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{r.date}</td>
                    <td className="px-4 py-3">{r.user_name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.time}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{r.batch_id}</td>

                    <td className="px-4 py-3 bg-blue-50/30 text-xs">{r.grade_sap || '-'}</td>
                    <td className="px-4 py-3 bg-purple-50/30 text-xs">{r.grade_mother || '-'}</td>
                    <td className="px-4 py-3 bg-orange-50/30 text-xs">{r.grade_cut || '-'}</td>

                    <td className="px-4 py-3">{r.database_t || '-'}</td>
                    <td className="px-4 py-3">{r.database_w || '-'}</td>
                    <td className="px-4 py-3">{r.database_l || '-'}</td>

                    <td className="px-4 py-3 font-bold">{r.location}</td>
                    <td className="px-4 py-3">{r.gang_baris || '-'}</td>

                    <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            r.status === 'Synchronized' ? 'bg-green-100 text-green-700' :
                            r.status === 'Missing Data' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                        }`}>{r.status}</span>
                    </td>

                    <td className="px-4 py-3 font-bold text-[10px]">{dimMatch}</td>

                    <td className="px-4 py-3 bg-red-50/30 font-bold">{r.actual_thick || '-'}</td>
                    <td className="px-4 py-3 bg-red-50/30 font-bold">{r.actual_width || '-'}</td>
                    <td className="px-4 py-3 bg-red-50/30 font-bold">{r.actual_length || '-'}</td>

                    <td className="px-4 py-3 font-bold text-[10px]">{gradeMatch}</td>
                    <td className="px-4 py-3 bg-red-50/30 font-bold">{r.actual_grade || '-'}</td>

                    <td className="px-4 py-3 max-w-[200px] truncate" title={r.remarks}>{r.remarks || '-'}</td>

                    <td className="px-4 py-3">
                        {r.image_url ? (
                            <a href={r.image_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                <Link size={14}/> View
                            </a>
                        ) : '-'}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {(role === UserRole.ADMIN || r.user_name === userName) && !isLocked && (
                        <button
                          onClick={() => handleDelete(r.id!)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
            })}
            {loading && <tr><td colSpan={22} className="p-10 text-center text-gray-400">Loading records...</td></tr>}
            {!loading && filteredRecords.length === 0 && <tr><td colSpan={22} className="p-10 text-center text-gray-400">No records found matching filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {!loading && filteredRecords.length > 0 && (
         <div className="flex flex-col md:flex-row items-center justify-between p-4 border-t border-gray-100 bg-gray-50 gap-4">
             <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                 <span>Rows per page:</span>
                 <select
                   value={itemsPerPage}
                   onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                   className="border rounded px-2 py-1 bg-white"
                 >
                     <option value={20}>20</option>
                     <option value={50}>50</option>
                     <option value={100}>100</option>
                     <option value={200}>200</option>
                     <option value={500}>500</option>
                 </select>
                 <span className="ml-2">Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredRecords.length)} of {filteredRecords.length} records</span>
             </div>

             <div className="flex items-center gap-2">
                 <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                     <ChevronLeft size={16}/>
                 </button>
                 <span className="text-xs font-bold text-gray-700">Page {currentPage} of {totalPages}</span>
                 <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                 >
                     <ChevronRight size={16}/>
                 </button>
             </div>
         </div>
      )}

      {showLoadModal && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                 <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                     <h3 className="font-bold text-gray-800">Load Backup</h3>
                     <button onClick={() => setShowLoadModal(false)}><RotateCcw size={18} className="text-gray-400 hover:text-red-500"/></button>
                 </div>
                 <div className="max-h-96 overflow-y-auto p-2">
                     {backups.length === 0 && <p className="p-4 text-center text-gray-400">No backups found.</p>}
                     {backups.map(b => (
                         <div key={b.id} className="flex items-center justify-between p-4 hover:bg-blue-50 rounded-xl cursor-pointer border-b border-gray-100 last:border-0" onClick={() => handleRestore(b.id)}>
                             <div>
                                 <p className="font-bold text-gray-800">{b.name}</p>
                                 <p className="text-xs text-gray-500">{new Date(b.created_at).toLocaleString()}</p>
                             </div>
                             <button className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">LOAD</button>
                         </div>
                     ))}
                 </div>
             </div>
         </div>
      )}

      {/* Delete All List Modal with Confirmation Phrase */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slideUp border border-red-200">
            <div className="p-5 border-b border-red-100 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-sm">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-red-950 text-sm md:text-base">{t.opnameList.deleteAllModalTitle}</h3>
                  <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Irreversible Action</p>
                </div>
              </div>
              <button
                onClick={() => { setShowDeleteAllModal(false); setDeleteAllInput(''); }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-red-700 leading-relaxed bg-red-50/70 p-3.5 rounded-xl border border-red-100 font-medium">
                {t.opnameList.deleteAllModalDesc}
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  {t.opnameList.deleteAllPrompt}
                </label>
                <div className="p-2.5 bg-gray-100 rounded-lg text-xs font-mono font-bold text-gray-800 select-all mb-2 border border-gray-200">
                  yes i want to delete all list
                </div>
                <input
                  type="text"
                  value={deleteAllInput}
                  onChange={(e) => setDeleteAllInput(e.target.value)}
                  placeholder="yes i want to delete all list"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-xs font-medium focus:ring-4 focus:ring-red-50 focus:border-red-500 outline-none transition-all text-gray-900 bg-white"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowDeleteAllModal(false); setDeleteAllInput(''); }}
                  disabled={deletingAll}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all"
                >
                  {t.opnameSlab.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllConfirm}
                  disabled={deleteAllInput.trim().toLowerCase() !== 'yes i want to delete all list' || deletingAll}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {deletingAll ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>{t.opnameList.deleteAllConfirmBtn}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpnameList;