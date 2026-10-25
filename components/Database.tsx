
import React, { useState, useEffect } from 'react';
import { fetchLatestStock, getCount, uploadStockCSV, deleteStockCSV, createComprehensiveBackup, clearDataset } from '../services/dataService';
import { SlabRecord, UserRole } from '../types';
import { Database as DbIcon, RefreshCcw, FileUp, AlertCircle, Trash2, Save, FolderOpen, Loader2 } from 'lucide-react';
import BackupModal from './BackupModal';
import BackupList from './BackupList';
import { useI18n } from '../i18n';

interface Props {
  role: UserRole;
  isLocked?: boolean;
  userName?: string;
}

const Database: React.FC<Props> = ({ role, isLocked = false, userName = '' }) => {
  const { t } = useI18n();
  const [data, setData] = useState<{ sap: any[], mother: any[], cut: any[] }>({ sap: [], mother: [], cut: [] });
  const [counts, setCounts] = useState({ sap: 0, mother: 0, cut: 0 });
  const [loading, setLoading] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [activeSection, setActiveSection] = useState<'stock' | 'backup'>('stock');

  useEffect(() => { loadSummary(); }, []);

  const loadSummary = async () => {
    setLoading(true);
    const [sap, mother, cut, cSap, cMother, cCut] = await Promise.all([
      fetchLatestStock('sap_stock'), fetchLatestStock('mother_slab_stock'), fetchLatestStock('cut_slab_stock'),
      getCount('sap_stock'), getCount('mother_slab_stock'), getCount('cut_slab_stock')
    ]);
    setData({ sap, mother, cut });
    setCounts({ sap: cSap, mother: cMother, cut: cCut });
    setLoading(false);
  };

  const handleFileUpload = async (type: 'sap' | 'mother' | 'cut', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      let text = e.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
      const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(1);
      if (rows.length === 0) { setLoading(false); return; }
      const firstRow = rows.find(r => r.trim().length > 0) || rows[0];
      const delimiters = [',', ';', '\t', '|'];
      let delimiter = ',';
      let maxCols = 0;
      delimiters.forEach(d => { const cols = firstRow.split(d).length; if (cols > maxCols) { maxCols = cols; delimiter = d; } });
      const records: SlabRecord[] = rows.map(row => {
        if (!row.trim()) return null;
        const columns = row.split(delimiter);
        const parseFloatSafe = (val: string) => { if (!val) return 0; let cleanVal = val.replace(/['"]/g, '').trim(); if (delimiter !== ',' && cleanVal.includes(',')) { cleanVal = cleanVal.replace(',', '.'); } return parseFloat(cleanVal) || 0; };
        return { batch_id: columns[0]?.trim(), grade: columns[1]?.trim() || 'N/A', thickness: parseFloatSafe(columns[2]), width: parseFloatSafe(columns[3]), length: parseFloatSafe(columns[4]), slab_weight: parseFloatSafe(columns[5]) };
      }).filter((r): r is SlabRecord => r !== null && !!r.batch_id);
      try {
        await uploadStockCSV(type, records, file);
        await loadSummary();
        alert(`${type.toUpperCase()} dataset updated. Processed ${records.length} records.`);
      } catch (err) { console.error(err); alert(`Error processing ${type.toUpperCase()} CSV.`); }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleDeleteDataset = async (type: 'sap' | 'mother' | 'cut') => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete the ${type.toUpperCase()} dataset?`)) return;
    setLoading(true);
    try { await deleteStockCSV(type); await loadSummary(); alert(`${type.toUpperCase()} dataset cleared.`); } catch (err) { alert("Error clearing dataset."); }
    setLoading(false);
  };

  const handleCreateBackup = async (name: string) => {
    await createComprehensiveBackup(name, userName);
    alert('Backup created successfully!');
  };

  const handleClearDataset = async () => {
    const confirmation = prompt('DANGER: This action will permanently clear ALL opname records from the database.\n\nPlease type "yes i want to delete all list" to confirm:');
    if (!confirmation || confirmation.trim().toLowerCase() !== 'yes i want to delete all list') {
      if (confirmation !== null) {
        alert('Action cancelled: Confirmation phrase did not match "yes i want to delete all list".');
      }
      return;
    }
    setClearingData(true);
    try { 
      await clearDataset(); 
      alert('All opname records have been cleared successfully.'); 
    } catch (err) { 
      alert("Error clearing dataset."); 
    } finally { 
      setClearingData(false); 
    }
  };

  const StockSection = ({ title, type, items, count }: { title: string, type: 'sap' | 'mother' | 'cut', items: any[], count: number }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50 bg-opacity-30">
        <div><h3 className="font-bold text-gray-900 text-sm md:text-base">{title}</h3><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{count} Total Records</p></div>
        {role === UserRole.ADMIN && (
          <div className="flex gap-2">
            <button onClick={() => handleDeleteDataset(type)} className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-white border border-gray-200 rounded-lg" title="Delete Dataset"><Trash2 size={16} /></button>
            <label className="cursor-pointer bg-white border border-gray-200 p-2 rounded-lg hover:border-blue-500 hover:text-blue-500 transition-all shadow-sm">
              <FileUp size={16} className="text-gray-700" /><input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(type, e)} />
            </label>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-[11px] whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-600 uppercase text-[9px] font-bold sticky top-0"><tr><th className="px-4 py-3">Batch ID</th><th className="px-4 py-3">Weight (MT)</th><th className="px-4 py-3">Dimensions</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item, idx) => (<tr key={idx} className="hover:bg-blue-50 transition-colors"><td className="px-4 py-3 font-bold text-gray-900">{item.batch_id}</td><td className="px-4 py-3 text-gray-800 font-mono">{(Number(item.slab_weight) || 0).toFixed(3)}</td><td className="px-4 py-3 text-gray-700">{item.thickness}x{item.width}x{item.length}</td></tr>))}
            {items.length === 0 && (<tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400 italic">No records in this dataset</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );

  const isAdmin = role === UserRole.ADMIN && !isLocked;

  return (
    <div className="space-y-6 animate-fadeIn h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><DbIcon className="text-blue-600" size={24} /> {t.database.title}</h2><p className="text-sm text-gray-500">{t.database.subtitle}</p></div>
        <div className="flex gap-2">
          <button onClick={() => setActiveSection('stock')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSection === 'stock' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Stock Data</button>
          {role === UserRole.ADMIN && (<button onClick={() => setActiveSection('backup')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSection === 'backup' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Backup & Clear</button>)}
        </div>
      </div>

      {activeSection === 'stock' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
            <StockSection title="SAP Stock" type="sap" items={data.sap} count={counts.sap} />
            <StockSection title="Mother Slab Stock" type="mother" items={data.mother} count={counts.mother} />
            <StockSection title="Cut Stock" type="cut" items={data.cut} count={counts.cut} />
          </div>
          {role === UserRole.ADMIN && (<div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3"><AlertCircle className="text-amber-600 shrink-0" size={20} /><div className="text-xs text-amber-900"><p className="font-bold uppercase mb-1">Administrator Note</p><p>You can manage (Upload/Delete) datasets. Weights are displayed in <strong>MT (Metric Tons)</strong>.</p></div></div>)}
        </>
      )}

      {activeSection === 'backup' && role === UserRole.ADMIN && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div><h3 className="font-bold text-gray-900 flex items-center gap-2"><FolderOpen size={20} className="text-blue-600" /> Backup & Restore</h3><p className="text-xs text-gray-500 mt-1">Create, load, or delete backups</p></div>
            <button onClick={() => setShowBackupModal(true)} disabled={isLocked} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"><Save size={16} /> Create Backup</button>
          </div>
          <div className="mb-6"><h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Available Backups</h4><BackupList onClose={() => setActiveSection('stock')} /></div>
          <div className="border-t border-gray-100 pt-6">
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
              <h4 className="font-bold text-red-700 text-sm mb-2">Danger Zone</h4><p className="text-xs text-red-600 mb-3">Clear all opname records for a fresh start.</p>
              <button onClick={handleClearDataset} disabled={isLocked || clearingData} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">{clearingData ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Clear All Opname Records</button>
            </div>
          </div>
        </div>
      )}

      <BackupModal isOpen={showBackupModal} onClose={() => setShowBackupModal(false)} onConfirm={handleCreateBackup} />
    </div>
  );
};

export default Database;
