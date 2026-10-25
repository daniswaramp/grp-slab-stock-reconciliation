
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { searchSlab, saveOpnameRecord, uploadEvidenceImage } from '../services/dataService';
import { SlabRecord, OpnameRecord, Location } from '../types';
import { Check, Search, Save, X, ClipboardCheck, MousePointer2, Filter, Camera, AlertTriangle, Image as ImageIcon } from 'lucide-react';

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
  const fuzzyMatch = (showDuplicateWarning && !duplicateMatch && results.opname.length > 0) ? results.opname[0] : null;

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
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-4 md:p-10 rounded-3xl border border-gray-100 shadow-sm">
        <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white"><Search size={20} /></div>
          Scan or Enter Slab Code
        </h2>
        
        <div className="relative mb-6 md:mb-10 group">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors pointer-events-none"><Search size={22} /></div>
          <input 
            type="text" 
            value={searchInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Enter slab / batch ID to search..."
            className="w-full text-base md:text-xl border border-gray-200 rounded-xl pl-14 pr-6 py-3 md:py-4 outline-none transition-all placeholder:text-gray-400 text-black bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
          {selectedBatchId && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg animate-fadeIn">
              <MousePointer2 size={12}/> ACTIVE SELECTION: {selectedBatchId}
              <button onClick={() => handleSelectBatch(selectedBatchId)} className="ml-2 hover:text-red-300"><X size={14}/></button>
            </div>
          )}
        </div>

        {(duplicateMatch || fuzzyMatch) && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl animate-fadeIn">
            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
              <AlertTriangle size={18} />
              {duplicateMatch ? `Perhatian: Batch ID "${duplicateMatch.batch_id}" sudah diopname!` : `Apakah maksud anda "${fuzzyMatch.batch_id}"?`}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-10">
          {[{ label: 'SAP Record', exists: sapExists }, { label: 'Mother Slab', exists: motherExists }, { label: 'Cut Stock', exists: cutExists }].map(item => (
            <div key={item.label} className={`p-3 md:p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${item.exists ? 'bg-green-50 border-green-200 text-green-900 scale-105 shadow-md shadow-green-100' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <span className="text-[10px] uppercase font-bold tracking-widest text-center leading-tight">{item.label}</span>
              {item.exists ? <Check size={28} className="text-green-600" strokeWidth={3} /> : <div className="h-7 w-7 rounded-full border-2 border-dashed border-gray-200"></div>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-6">
          <button disabled={!canSync || isLocked} onClick={() => handleAction('Synchronized')} className={`py-3 md:py-6 rounded-2xl font-black text-[10px] md:text-sm shadow-xl transition-all active:scale-95 ${canSync && !isLocked ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}>SYNCHRONIZE</button>
          <button disabled={!canMissing || isLocked} onClick={() => handleAction('Missing Data')} className={`py-3 md:py-6 rounded-2xl font-black text-[10px] md:text-sm shadow-xl transition-all active:scale-95 ${canMissing && !isLocked ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}>MISSING DATA</button>
          <button disabled={!canNotAvailable || isLocked} onClick={() => handleAction('Not Available')} className={`py-3 md:py-6 rounded-2xl font-black text-[10px] md:text-sm shadow-xl transition-all active:scale-95 ${canNotAvailable && !isLocked ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}>NOT AVAILABLE</button>
        </div>
      </div>

      {(searchInput || lastManualInput) && (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden animate-slideUp">
          <div className="p-5 bg-white border-b border-gray-100 flex flex-col md:flex-row justify-between items-center text-gray-900 gap-4">
            <h3 className="font-bold flex items-center gap-3"><Filter size={20} className="text-blue-600"/> Reconciliation Matrix</h3>
            <div className="flex flex-wrap justify-center gap-6 text-[10px] font-bold uppercase tracking-widest">
              <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.sap} onChange={e => setHideZero({...hideZero, sap: e.target.checked})} className="w-4 h-4 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 MT SAP</label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.mother} onChange={e => setHideZero({...hideZero, mother: e.target.checked})} className="w-4 h-4 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 MT MOTHER</label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"><input type="checkbox" checked={hideZero.cut} onChange={e => setHideZero({...hideZero, cut: e.target.checked})} className="w-4 h-4 rounded border-gray-300 bg-white text-blue-600" /> Hide 0 MT CUT</label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse bg-white">
              <thead className="text-gray-800 font-bold text-[11px] uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-8 py-5 border-r border-gray-100 w-64 bg-gray-50 text-gray-900">Target Batch ID</th>
                  <th className="px-8 py-5 border-r border-gray-100 bg-blue-50/30 text-blue-900">SAP Records (MT)</th>
                  <th className="px-8 py-5 border-r border-gray-100 bg-purple-50/30 text-purple-900">Mother Slab (MT)</th>
                  <th className="px-8 py-5 bg-orange-50/30 text-orange-900">Cut Stock (MT)</th>
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
                      <td className="px-8 py-6 font-bold border-r border-gray-100">
                        <div className="flex items-center justify-between"><span className="text-gray-900">{batchId}</span>{isSelected ? <Check size={18} className="text-blue-600" strokeWidth={3} /> : <MousePointer2 size={16} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />}</div>
                      </td>
                      <td className="px-8 py-6 border-r border-gray-100">{sap ? (<div className="space-y-1"><p className="font-bold text-blue-700">{sap.grade}</p><p className="text-xs text-gray-500 font-normal">{sap.thickness}x{sap.width}x{sap.length}</p><p className="font-bold text-gray-900">{(Number(sap.slab_weight) || 0).toFixed(3)} MT</p></div>) : <span className="text-gray-300 italic font-normal">-</span>}</td>
                      <td className="px-8 py-6 border-r border-gray-100">{mother ? (<div className="space-y-1"><p className="font-bold text-purple-700">{mother.grade}</p><p className="text-xs text-gray-500 font-normal">{mother.thickness}x{mother.width}x{mother.length}</p><p className="font-bold text-gray-900">{(Number(mother.slab_weight) || 0).toFixed(3)} MT</p></div>) : <span className="text-gray-300 italic font-normal">-</span>}</td>
                      <td className="px-8 py-6">{cut ? (<div className="space-y-1"><p className="font-bold text-orange-700">{cut.grade}</p><p className="text-xs text-gray-500 font-normal">{cut.thickness}x{cut.width}x{cut.length}</p><p className="font-bold text-gray-900">{(Number(cut.slab_weight) || 0).toFixed(3)} MT</p></div>) : <span className="text-gray-300 italic font-normal">-</span>}</td>
                    </tr>
                  )
                })}
                {allBatchIds.length === 0 && (<tr className="bg-white"><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-bold italic uppercase tracking-widest text-[11px]">No matching records found</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPopup && createPortal(
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-100 animate-slideUp">
            <div className={`p-4 md:p-6 text-white flex justify-between items-center ${showPopup === 'Synchronized' ? 'bg-green-600' : showPopup === 'Missing Data' ? 'bg-yellow-500' : 'bg-red-600'}`}>
              <h2 className="text-lg md:text-xl font-black flex items-center gap-3"><ClipboardCheck /> {showPopup}</h2>
              <button onClick={() => setShowPopup(null)} className="hover:bg-black/10 rounded-full p-2 transition-all"><X size={24} /></button>
            </div>
            
            <div className="p-4 md:p-8 space-y-6 md:space-y-8 bg-white text-black">
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Reconciliation Batch</label><p className="text-3xl font-bold text-gray-900 tracking-tight">{selectedBatchId || searchInput}</p></div>

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gang / Baris</label>
                <input type="text" placeholder="e.g. A5, CD, O" className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 md:px-6 md:py-4 focus:ring-4 focus:ring-blue-50 outline-none text-black font-bold bg-white" value={gangBaris} onChange={(e) => setGangBaris(e.target.value.toUpperCase())} />
              </div>

              {showPopup !== 'Not Available' ? (
                <div className="space-y-6">
                  <p className="text-sm font-bold text-gray-900 border-l-4 border-blue-600 pl-4 py-1 bg-blue-50 rounded-r-lg">Field Verification Checklist</p>
                  <div className="space-y-3">
                    <label className={`flex items-center gap-4 group cursor-pointer p-3 rounded-xl border-2 transition-all ${checks.dimension ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100'}`}>
                      <input type="checkbox" checked={checks.dimension} onChange={(e) => setChecks({...checks, dimension: e.target.checked})} className="w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 bg-white" />
                      <div className="flex-1"><span className="text-gray-900 font-bold text-sm">Dimension Match</span>{dbRefExists && (<div className="flex flex-col mt-1 space-y-0.5">{getDimensionLines().map((line, idx) => (<span key={idx} className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded w-fit">{line}</span>))}</div>)}</div>
                    </label>
                    {!checks.dimension && (
                      <div className="px-3 animate-fadeIn grid grid-cols-3 gap-2">
                        <input type="text" inputMode="numeric" placeholder="Thick" className="w-full border-b-2 border-gray-200 px-2 py-2 text-sm outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.thickness} onChange={(e) => setManualInput({...manualInput, thickness: e.target.value.replace(/[^0-9.]/g, '')})} />
                        <input type="text" inputMode="numeric" placeholder="Width" className="w-full border-b-2 border-gray-200 px-2 py-2 text-sm outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.width} onChange={(e) => setManualInput({...manualInput, width: e.target.value.replace(/[^0-9.]/g, '')})} />
                        <input type="text" inputMode="numeric" placeholder="Length" className="w-full border-b-2 border-gray-200 px-2 py-2 text-sm outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.length} onChange={(e) => setManualInput({...manualInput, length: e.target.value.replace(/[^0-9.]/g, '')})} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className={`flex items-center gap-4 group cursor-pointer p-3 rounded-xl border-2 transition-all ${checks.grade ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100'}`}>
                      <input type="checkbox" checked={checks.grade} onChange={(e) => setChecks({...checks, grade: e.target.checked})} className="w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 bg-white" />
                      <div className="flex-1"><span className="text-gray-900 font-bold text-sm">Slab Grade Match {dbRefExists && `(${getDbGrade()})`}</span></div>
                    </label>
                    {!checks.grade && (<div className="px-3 animate-fadeIn"><input type="text" placeholder="Enter Field Slab Grade" className="w-full border-b-2 border-gray-200 px-4 py-2 text-sm outline-none focus:border-blue-500 text-black font-bold bg-white rounded-t-lg" value={manualInput.grade} onChange={(e) => setManualInput({...manualInput, grade: e.target.value})} /></div>)}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-sm font-bold text-red-600 border-l-4 border-red-600 pl-4 py-1 bg-red-50 rounded-r-lg">Manual Input Required (No Reference)</p>
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Evidence Image</label>
                    <div className="flex items-center gap-4">
                      <button onClick={() => fileInputRef.current?.click()} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-xl flex items-center gap-2 font-bold transition-all"><Camera size={18} /> Take / Upload Photo</button>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                      {evidencePreview && (<div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 relative"><img src={evidencePreview} alt="Preview" className="w-full h-full object-cover" /><button onClick={() => {setEvidenceFile(null); setEvidencePreview(null);}} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X size={12}/></button></div>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Thick</label><input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 font-bold text-black" value={manualInput.thickness} onChange={(e) => setManualInput({...manualInput, thickness: e.target.value.replace(/[^0-9.]/g, '')})} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Width</label><input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 font-bold text-black" value={manualInput.width} onChange={(e) => setManualInput({...manualInput, width: e.target.value.replace(/[^0-9.]/g, '')})} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Length</label><input type="text" inputMode="numeric" className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 font-bold text-black" value={manualInput.length} onChange={(e) => setManualInput({...manualInput, length: e.target.value.replace(/[^0-9.]/g, '')})} /></div>
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Slab Grade</label><input type="text" className="w-full border-2 border-gray-100 rounded-xl px-3 py-3 font-bold text-black" value={manualInput.grade} onChange={(e) => setManualInput({...manualInput, grade: e.target.value})} /></div>
                </div>
              )}

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Physical Location <span className="text-red-500">*</span></label>
                <select className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 md:px-6 md:py-4 focus:ring-4 focus:ring-blue-50 outline-none text-black font-bold appearance-none bg-white" value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="">Choose Location...</option>
                  {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inspector Remarks</label>
                <textarea className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 md:px-6 md:py-4 focus:ring-4 focus:ring-blue-50 outline-none h-24 resize-none text-black font-medium bg-white" placeholder="Notes for discrepancy or condition..." value={remarks} onChange={(e) => setRemarks(e.target.value)}></textarea>
              </div>

              <button onClick={submitOpname} disabled={isSubmitting} className={`w-full py-3 md:py-5 rounded-2xl font-black text-white shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 uppercase tracking-widest ${showPopup === 'Synchronized' ? 'bg-green-600 hover:bg-green-700' : showPopup === 'Missing Data' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'} ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSubmitting ? 'Saving...' : <><Save size={20} /> Finalize Reconciliation</>}
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
