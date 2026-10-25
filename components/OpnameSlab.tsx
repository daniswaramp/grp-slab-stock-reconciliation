
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { searchSlab, saveOpnameRecord, uploadEvidenceImage } from '../services/dataService';
import { SlabRecord, OpnameRecord, Location } from '../types';
import { Check, Search, Save, X, ClipboardCheck, MousePointer2, Filter, Camera, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  userName: string;
  locations: Location[];
  searchInput: string;
  setSearchInput: (val: string) => void;
  selectedBatchId: string | null;
  setSelectedBatchId: (id: string | null) => void;
  lastManualInput: string;
  setLastManualInput: (val: string) => void;
  isLocked?: boolean;
}

const OpnameSlab: React.FC<Props> = ({ 
  userName, 
  locations, 
  searchInput, 
  setSearchInput, 
  selectedBatchId, 
  setSelectedBatchId,
  lastManualInput,
  setLastManualInput,
  isLocked = false
}) => {
  const { t } = useI18n();
  const [results, setResults] = useState<{ sap: SlabRecord[], mother: SlabRecord[], cut: SlabRecord[], opname: any[] }>({ sap: [], mother: [], cut: [], opname: [] });
  const [showPopup, setShowPopup] = useState<'Synchronized' | 'Missing Data' | 'Not Available' | null>(null);
  const [hideZero, setHideZero] = useState({ sap: false, mother: false, cut: false });
  const [location, setLocation] = useState('');
  const [gangBaris, setGangBaris] = useState('');
  const [remarks, setRemarks] = useState('');
  const [checks, setChecks] = useState({ dimension: false, grade: false });
  const [manualInput, setManualInput] = useState({ thickness: '', width: '', length: '', grade: '', batch: '' });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedBatchId, setLastSubmittedBatchId] = useState<string | null>(null);

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      const searchStr = selectedBatchId ? lastManualInput : searchInput;
      if (searchStr) {
        const data = await searchSlab(searchStr);
        setResults(data);
      } else {
        setResults({ sap: [], mother: [], cut: [], opname: [] });
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchInput, selectedBatchId, lastManualInput]);

  const filterZero = (records: SlabRecord[], source: 'sap' | 'mother' | 'cut') => {
    if (!hideZero[source]) return records;
    return records.filter(r => r.slab_weight > 0);
  };

  const currentSap = filterZero(results.sap, 'sap');
  const currentMother = filterZero(results.mother, 'mother');
  const currentCut = filterZero(results.cut, 'cut');

  const sapExists = currentSap.some(r => r.batch_id === selectedBatchId);
  const motherExists = currentMother.some(r => r.batch_id === selectedBatchId);
  const cutExists = currentCut.some(r => r.batch_id === selectedBatchId);

  const hasRecommendations = (currentSap.length > 0 || currentMother.length > 0 || currentCut.length > 0);
  const canNotAvailable = !hasRecommendations;
  const canSync = selectedBatchId && ((sapExists && cutExists) || (sapExists && motherExists));
  const canMissing = selectedBatchId && (sapExists || motherExists || cutExists) && !canSync;

  const currentSearchTerm = selectedBatchId || searchInput;
  const showDuplicateWarning = currentSearchTerm && currentSearchTerm.length >= 5;
  const duplicateMatch = showDuplicateWarning ? results.opname.find(r => r.batch_id === currentSearchTerm) : null;

  const allBatchIds = Array.from(new Set([
    ...currentSap.map(r => r.batch_id),
    ...currentMother.map(r => r.batch_id),
    ...currentCut.map(r => r.batch_id)
  ])).slice(0, 15);

  const handleAction = (type: 'Synchronized' | 'Missing Data' | 'Not Available') => {
    if (type !== 'Not Available' && !selectedBatchId) {
      alert("Please select a Target Batch ID from the matrix first.");
      return;
    }
    setShowPopup(type);
    setRemarks('');
    setGangBaris('');
    setEvidenceFile(null);
    setEvidencePreview(null);
    setManualInput({ thickness: '', width: '', length: '', grade: '', batch: '' });
    if (type === 'Not Available') {
      setChecks({ dimension: false, grade: false });
    } else {
      setChecks({ dimension: true, grade: true });
    }
  };

  const handleInputChange = (val: string) => {
    const upperVal = val.toUpperCase();
    setSearchInput(upperVal);
    if (!selectedBatchId) {
      setLastManualInput(upperVal);
    }
  };

  const handleSelectBatch = (id: string) => {
    if (selectedBatchId === id) {
      setSelectedBatchId(null);
      setSearchInput(lastManualInput);
    } else {
      setSelectedBatchId(id);
      setSearchInput(id);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEvidenceFile(file);
      setEvidencePreview(URL.createObjectURL(file));
    }
  };

  const submitOpname = async () => {
    if (!location) {
      alert('Please select a location');
      return;
    }
    if (!checks.dimension) {
      if (!manualInput.thickness || !manualInput.width || !manualInput.length) {
        alert("Please fill in Actual Dimensions (Thick, Width, Length)");
        return;
      }
    }
    if (!checks.grade) {
      if (!manualInput.grade) {
        alert("Please fill in Actual Grade");
        return;
      }
    }

    const batchIdToSubmit = selectedBatchId || searchInput;
    if (batchIdToSubmit === lastSubmittedBatchId) {
      if (!confirm("You just submitted this Batch ID. Are you sure you want to submit a duplicate?")) return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl = '';
      if (showPopup === 'Not Available' && evidenceFile) {
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        const safeBatch = batchIdToSubmit.replace(/[^a-zA-Z0-9]/g, '_');
        const safeLoc = location.replace(/[^a-zA-Z0-9]/g, '_');
        const safeGang = (gangBaris || 'NA').replace(/[\/\\]/g, '-');
        const filename = `${userName}_${dateStr}_${timeStr}_${safeBatch}_${safeLoc}_${safeGang}.jpg`;
        imageUrl = await uploadEvidenceImage(evidenceFile, filename);
      }

      const sap = currentSap.find(r => r.batch_id === batchIdToSubmit);
      const mother = currentMother.find(r => r.batch_id === batchIdToSubmit);
      const cut = currentCut.find(r => r.batch_id === batchIdToSubmit);
      const ref = mother || cut || sap;

      const record: OpnameRecord = {
        user_name: userName,
        batch_id: batchIdToSubmit,
        grade: (!checks.grade ? manualInput.grade : (ref?.grade || 'N/A')),
        location,
        status: showPopup!,
        dimension_match: checks.dimension,
        grade_match: checks.grade,
        batch_match: true,
        remarks,
        grade_sap: sap?.grade || '',
        grade_mother: mother?.grade || '',
        grade_cut: cut?.grade || '',
        database_t: ref?.thickness || 0,
        database_w: ref?.width || 0,
        database_l: ref?.length || 0,
        actual_thick: !checks.dimension ? Number(manualInput.thickness) : undefined,
        actual_width: !checks.dimension ? Number(manualInput.width) : undefined,
        actual_length: !checks.dimension ? Number(manualInput.length) : undefined,
        actual_grade: !checks.grade ? manualInput.grade : undefined,
        actual_batch_id: batchIdToSubmit,
        gang_baris: gangBaris,
        image_url: imageUrl
      };

      await saveOpnameRecord(record);
      setLastSubmittedBatchId(batchIdToSubmit);
      setShowPopup(null);
      setSearchInput('');
      setLastManualInput('');
      setSelectedBatchId(null);
      setEvidenceFile(null);
      setEvidencePreview(null);
      alert('Opname record saved successfully.');
    } catch (e: any) {
      console.error(e);
      alert('Error saving record: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDbDimensions = () => {
    const r = currentSap.find(x => x.batch_id === selectedBatchId) ||
              currentMother.find(x => x.batch_id === selectedBatchId) ||
              currentCut.find(x => x.batch_id === selectedBatchId);
    if (!r) return "NO REFERENCE";
    return `${r.thickness} x ${r.width} x ${r.length}`;
  };

  const getDbGrade = () => {
    const r = currentSap.find(x => x.batch_id === selectedBatchId) ||
              currentMother.find(x => x.batch_id === selectedBatchId) ||
              currentCut.find(x => x.batch_id === selectedBatchId);
    if (!r) return "NO REFERENCE";
    return r.grade;
  };

  const dbRefExists = !!(currentSap.find(x => x.batch_id === selectedBatchId) ||
                         currentMother.find(x => x.batch_id === selectedBatchId) ||
                         currentCut.find(x => x.batch_id === selectedBatchId));

  const getDimensionLines = () => {
    const sap = currentSap.find(x => x.batch_id === selectedBatchId);
    const mother = currentMother.find(x => x.batch_id === selectedBatchId);
    const cut = currentCut.find(x => x.batch_id === selectedBatchId);
    const lines = [];
    if (sap) { lines.push(`[SAP: ${sap.thickness}x${sap.width}x${sap.length}]`); } 
    else { lines.push(`[SAP: -]`); }
    if (mother) { lines.push(`[MS: ${mother.thickness}x${mother.width}x${mother.length}]`); } 
    else if (cut) { lines.push(`[CS: ${cut.thickness}x${cut.width}x${cut.length}]`); } 
    else { lines.push(`[MS/CS: -]`); }
    return lines;
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn pb-8">
      <div className="bg-white p-3.5 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm">
        <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2.5 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg text-white"><Search size={18} /></div>
          <span>{t.opnameSlab.title}</span>
        </h2>
        
        {/* Search input container */}
        <div className="relative mb-3 group">
          <div className="absolute left-3.5 sm:left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
            <Search size={20} />
          </div>
          <input 
            type="text" 
            value={searchInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t.opnameSlab.searchPlaceholder}
            className="w-full text-base sm:text-lg md:text-xl border border-gray-200 rounded-xl pl-11 sm:pl-14 pr-10 py-3 sm:py-3.5 outline-none transition-all placeholder:text-gray-400 text-black bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setLastManualInput(''); setSelectedBatchId(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full"
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Active Selection Chip (Separate on Mobile & Desktop to prevent text collision) */}
        {selectedBatchId && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-900 px-3 py-2 rounded-xl flex items-center justify-between shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
              <span className="text-[10px] sm:text-xs text-blue-700 uppercase font-bold tracking-wider shrink-0">{t.opnameSlab.activeSelection}:</span>
              <span className="font-mono font-black text-xs sm:text-sm text-blue-950 truncate">{selectedBatchId}</span>
            </div>
            <button 
              onClick={() => handleSelectBatch(selectedBatchId)} 
              className="text-xs font-bold text-red-500 hover:text-red-700 bg-white border border-red-200 px-2 py-0.5 rounded-lg flex items-center gap-1 active:scale-95 shrink-0 ml-2"
              title="Deselect"
            >
              <X size={12} /> Deselect
            </button>
          </div>
        )}

        {duplicateMatch && (
          <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-3.5 sm:p-4 rounded-r-xl animate-fadeIn shadow-sm">
            <div className="flex items-start gap-2.5 sm:gap-3 text-amber-900 text-xs sm:text-sm">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950">
                  {t.opnameSlab.duplicateWarning} (Batch: <span className="font-mono underline">{duplicateMatch.batch_id}</span>)
                </p>
                <p className="text-[11px] sm:text-xs text-amber-800 mt-1 font-medium">
                  {t.opnameSlab.duplicateDetails(
                    duplicateMatch.user_name || 'Inspector',
                    duplicateMatch.date || '-',
                    duplicateMatch.time || '-',
                    duplicateMatch.status || '-',
                    duplicateMatch.location || '-'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3 Reference Availability Cards */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-4 mb-4 sm:mb-6">
          {[{ label: t.opnameSlab.sapRecord, exists: sapExists }, { label: t.opnameSlab.motherSlab, exists: motherExists }, { label: t.opnameSlab.cutStock, exists: cutExists }].map(item => (
            <div key={item.label} className={`p-2 sm:p-3.5 rounded-xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-2 transition-all ${item.exists ? 'bg-green-50 border-green-300 text-green-900 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-center leading-tight line-clamp-1">{item.label}</span>
              {item.exists ? <Check size={20} className="text-green-600" strokeWidth={3} /> : <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-dashed border-gray-200"></div>}
            </div>
          ))}
        </div>

        {/* 3 Big Action Buttons: Stack on mobile phone, 3 columns on tablet/desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <button 
            disabled={!canSync || isLocked} 
            onClick={() => handleAction('Synchronized')} 
            className={`py-3 sm:py-5 px-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${canSync && !isLocked ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}
          >
            <Check size={16} strokeWidth={3} />
            <span>{t.opnameSlab.synchronize}</span>
          </button>
          <button 
            disabled={!canMissing || isLocked} 
            onClick={() => handleAction('Missing Data')} 
            className={`py-3 sm:py-5 px-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${canMissing && !isLocked ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}
          >
            <AlertTriangle size={16} />
            <span>{t.opnameSlab.missingData}</span>
          </button>
          <button 
            disabled={!canNotAvailable || isLocked} 
            onClick={() => handleAction('Not Available')} 
            className={`py-3 sm:py-5 px-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${canNotAvailable && !isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}
          >
            <X size={16} strokeWidth={2.5} />
            <span>{t.opnameSlab.notAvailable}</span>
          </button>
        </div>
      </div>

      {(searchInput || lastManualInput) && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-lg overflow-hidden animate-slideUp">
          <div className="p-3.5 sm:p-5 bg-white border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center text-gray-900 gap-3">
            <h3 className="font-bold flex items-center gap-2 text-sm sm:text-base"><Filter size={18} className="text-blue-600"/> {t.opnameSlab.matrixTitle}</h3>
            <div className="flex flex-wrap gap-3 sm:gap-6 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.sap} onChange={e => setHideZero({...hideZero, sap: e.target.checked})} className="w-3.5 h-3.5 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 SAP</label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.mother} onChange={e => setHideZero({...hideZero, mother: e.target.checked})} className="w-3.5 h-3.5 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 MOTHER</label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.cut} onChange={e => setHideZero({...hideZero, cut: e.target.checked})} className="w-3.5 h-3.5 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 CUT</label>
            </div>
          </div>
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse bg-white">
              <thead className="text-gray-800 font-bold text-[10px] sm:text-[11px] uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 border-r border-gray-100 min-w-[130px] bg-gray-50 text-gray-900 sticky left-0 z-10">Target Batch ID</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 border-r border-gray-100 bg-blue-50/30 text-blue-900 min-w-[130px]">SAP Records (MT)</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 border-r border-gray-100 bg-purple-50/30 text-purple-900 min-w-[130px]">Mother Slab (MT)</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 bg-orange-50/30 text-orange-900 min-w-[130px]">Cut Stock (MT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {allBatchIds.map((batchId) => {
                  const sap = currentSap.find(r => r.batch_id === batchId);
                  const mother = currentMother.find(r => r.batch_id === batchId);
                  const cut = currentCut.find(r => r.batch_id === batchId);
                  const isSelected = selectedBatchId === batchId;
                  return (
                    <tr key={batchId} onClick={() => handleSelectBatch(batchId)} className={`cursor-pointer transition-all duration-200 group ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-600/20' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 font-bold border-r border-gray-100 sticky left-0 bg-white group-hover:bg-gray-50 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-gray-900 font-mono text-xs sm:text-sm">{batchId}</span>
                          {isSelected ? <Check size={16} className="text-blue-600 shrink-0" strokeWidth={3} /> : <MousePointer2 size={13} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity shrink-0" />}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 border-r border-gray-100">
                        {sap ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-blue-700 text-xs">{sap.grade}</p>
                            <p className="text-[10px] text-gray-500 font-normal">{sap.thickness}x{sap.width}x{sap.length}</p>
                            <p className="font-bold text-gray-900 text-xs">{(Number(sap.slab_weight) || 0).toFixed(3)} MT</p>
                          </div>
                        ) : <span className="text-gray-300 italic font-normal text-xs">-</span>}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 border-r border-gray-100">
                        {mother ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-purple-700 text-xs">{mother.grade}</p>
                            <p className="text-[10px] text-gray-500 font-normal">{mother.thickness}x{mother.width}x{mother.length}</p>
                            <p className="font-bold text-gray-900 text-xs">{(Number(mother.slab_weight) || 0).toFixed(3)} MT</p>
                          </div>
                        ) : <span className="text-gray-300 italic font-normal text-xs">-</span>}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        {cut ? (
                          <div className="space-y-0.5">
                            <p className="font-bold text-orange-700 text-xs">{cut.grade}</p>
                            <p className="text-[10px] text-gray-500 font-normal">{cut.thickness}x{cut.width}x{cut.length}</p>
                            <p className="font-bold text-gray-900 text-xs">{(Number(cut.slab_weight) || 0).toFixed(3)} MT</p>
                          </div>
                        ) : <span className="text-gray-300 italic font-normal text-xs">-</span>}
                      </td>
                    </tr>
                  )
                })}
                {allBatchIds.length === 0 && (<tr className="bg-white"><td colSpan={4} className="px-4 py-12 text-center text-gray-400 font-bold italic uppercase tracking-widest text-[11px]">No matching records found</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Mobile full-width with safe scrolling */}
      {showPopup && createPortal(
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto border border-gray-100 animate-slideUp my-auto">
            <div className={`p-3.5 sm:p-5 text-white flex justify-between items-center sticky top-0 z-10 shadow-sm ${showPopup === 'Synchronized' ? 'bg-green-600' : showPopup === 'Missing Data' ? 'bg-yellow-500' : 'bg-red-600'}`}>
              <h2 className="text-base sm:text-lg font-black flex items-center gap-2"><ClipboardCheck size={18} /> {showPopup}</h2>
              <button onClick={() => setShowPopup(null)} className="hover:bg-black/10 rounded-full p-1.5 transition-all"><X size={20} /></button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-white text-black">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Reconciliation Batch</label>
                <p className="text-xl sm:text-2xl font-black text-gray-900 font-mono tracking-tight break-all">{selectedBatchId || searchInput}</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gang / Baris</label>
                <input 
                  type="text" 
                  placeholder="e.g. A5, CD, O" 
                  className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-2.5 sm:py-3 focus:ring-4 focus:ring-blue-50 outline-none text-black font-bold bg-white text-base sm:text-sm uppercase" 
                  value={gangBaris} 
                  onChange={(e) => setGangBaris(e.target.value.toUpperCase())} 
                />
              </div>

              {showPopup !== 'Not Available' ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-gray-900 border-l-4 border-blue-600 pl-3 py-1 bg-blue-50 rounded-r-lg">Field Verification Checklist</p>
                  <div className="space-y-2.5">
                    <label className={`flex items-start gap-3 group cursor-pointer p-3 rounded-xl border-2 transition-all ${checks.dimension ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
                      <input type="checkbox" checked={checks.dimension} onChange={(e) => setChecks({...checks, dimension: e.target.checked})} className="w-5 h-5 mt-0.5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 bg-white shrink-0" />
                      <div className="flex-1">
                        <span className="text-gray-900 font-bold text-xs sm:text-sm">Dimension Match Physical</span>
                        {dbRefExists && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {getDimensionLines().map((line, idx) => (
                              <span key={idx} className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{line}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                    {!checks.dimension && (
                      <div className="px-1 animate-fadeIn grid grid-cols-3 gap-2">
                        <input type="text" inputMode="numeric" placeholder="Thick" className="w-full border-b-2 border-gray-300 px-2 py-2 text-base sm:text-xs outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.thickness} onChange={(e) => setManualInput({...manualInput, thickness: e.target.value.replace(/[^0-9.]/g, '')})} />
                        <input type="text" inputMode="numeric" placeholder="Width" className="w-full border-b-2 border-gray-300 px-2 py-2 text-base sm:text-xs outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.width} onChange={(e) => setManualInput({...manualInput, width: e.target.value.replace(/[^0-9.]/g, '')})} />
                        <input type="text" inputMode="numeric" placeholder="Length" className="w-full border-b-2 border-gray-300 px-2 py-2 text-base sm:text-xs outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.length} onChange={(e) => setManualInput({...manualInput, length: e.target.value.replace(/[^0-9.]/g, '')})} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    <label className={`flex items-start gap-3 group cursor-pointer p-3 rounded-xl border-2 transition-all ${checks.grade ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}>
                      <input type="checkbox" checked={checks.grade} onChange={(e) => setChecks({...checks, grade: e.target.checked})} className="w-5 h-5 mt-0.5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500 bg-white shrink-0" />
                      <div className="flex-1">
                        <span className="text-gray-900 font-bold text-xs sm:text-sm">Slab Grade Match {dbRefExists && `(${getDbGrade()})`}</span>
                      </div>
                    </label>
                    {!checks.grade && (
                      <div className="px-1 animate-fadeIn">
                        <input type="text" placeholder="Enter Field Slab Grade" className="w-full border-b-2 border-gray-300 px-3 py-2 text-base sm:text-xs outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.grade} onChange={(e) => setManualInput({...manualInput, grade: e.target.value})} />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-red-600 border-l-4 border-red-600 pl-3 py-1 bg-red-50 rounded-r-lg">Manual Input Required (No Reference)</p>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Evidence Image</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => fileInputRef.current?.click()} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3.5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-xs transition-all"><Camera size={16} /> Take / Upload Photo</button>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                      {evidencePreview && (
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 relative">
                          <img src={evidencePreview} alt="Preview" className="w-full h-full object-cover" />
                          <button onClick={() => {setEvidenceFile(null); setEvidencePreview(null);}} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X size={12}/></button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Thick</label>
                      <input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-2.5 py-2 text-base sm:text-xs font-bold text-black" value={manualInput.thickness} onChange={(e) => setManualInput({...manualInput, thickness: e.target.value.replace(/[^0-9.]/g, '')})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Width</label>
                      <input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-2.5 py-2 text-base sm:text-xs font-bold text-black" value={manualInput.width} onChange={(e) => setManualInput({...manualInput, width: e.target.value.replace(/[^0-9.]/g, '')})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Length</label>
                      <input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-2.5 py-2 text-base sm:text-xs font-bold text-black" value={manualInput.length} onChange={(e) => setManualInput({...manualInput, length: e.target.value.replace(/[^0-9.]/g, '')})} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Slab Grade</label>
                    <input type="text" className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-base sm:text-xs font-bold text-black" value={manualInput.grade} onChange={(e) => setManualInput({...manualInput, grade: e.target.value})} />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Physical Location <span className="text-red-500">*</span></label>
                <select className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-2.5 sm:py-3 focus:ring-4 focus:ring-blue-50 outline-none text-black font-bold bg-white text-base sm:text-sm" value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="">Choose Location...</option>
                  {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inspector Remarks</label>
                <textarea className="w-full border-2 border-gray-100 rounded-xl px-3.5 py-2 focus:ring-4 focus:ring-blue-50 outline-none h-20 resize-none text-black font-medium bg-white text-base sm:text-sm" placeholder="Notes for discrepancy or condition..." value={remarks} onChange={(e) => setRemarks(e.target.value)}></textarea>
              </div>

              <button onClick={submitOpname} disabled={isSubmitting} className={`w-full py-3.5 sm:py-4 rounded-xl font-black text-white shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs sm:text-sm uppercase tracking-wider ${showPopup === 'Synchronized' ? 'bg-green-600 hover:bg-green-700' : showPopup === 'Missing Data' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'} ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSubmitting ? 'Saving...' : <><Save size={18} /> Finalize Reconciliation</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default OpnameSlab;
