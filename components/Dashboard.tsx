import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Users, ClipboardCheck, AlertTriangle, XCircle, Circle, Activity, LayoutGrid, Bell, X, Edit, Save } from 'lucide-react';
import { getUnopnamedCounts, updateSystemNotification, fetchAllOpnameRecords, updateOpnameCacheFromPayload } from '../services/dataService';
import { UserRole } from '../types';

interface Props {
  userName?: string;
  role?: UserRole;
  notification?: string;
}

const Dashboard: React.FC<Props> = ({ userName, role, notification }) => {
  const [usersOnline, setUsersOnline] = useState<any[]>([]);
  const [opnameStats, setOpnameStats] = useState<any[]>([]);
  const [locationStats, setLocationStats] = useState<any[]>([]);
  const [statusSummary, setStatusSummary] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);

  const [unopnamed, setUnopnamed] = useState<any>({
    sap: { total: 0, remaining: 0, opnamed: 0, synchronized: 0, missing: 0 },
    mother: { total: 0, remaining: 0, opnamed: 0, synchronized: 0, missing: 0 },
    cut: { total: 0, remaining: 0, opnamed: 0, synchronized: 0, missing: 0 }
  });

  const [showNotifModal, setShowNotifModal] = useState(false);
  const [isEditingNotif, setIsEditingNotif] = useState(false);
  const [editNotifText, setEditNotifText] = useState('');

  useEffect(() => {
    fetchData();
    fetchUnopnamed();

    const recordsSub = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opname_records' }, (payload) => {
        updateOpnameCacheFromPayload(payload.eventType, payload.old, payload.new);
        setRecords(prev => {
            let updated = [...prev];
            if (payload.eventType === 'INSERT') {
              updated = [payload.new, ...updated];
            } else if (payload.eventType === 'UPDATE') {
              updated = updated.map(r => r.id === payload.new.id ? payload.new : r);
            } else if (payload.eventType === 'DELETE') {
              updated = updated.filter(r => r.id !== payload.old.id);
            }
            return updated;
        });
        fetchUnopnamed();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users_online' }, () => fetchData(true))
      .subscribe();

    const interval = setInterval(() => {
      fetchData(true);
    }, 15000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(recordsSub);
    };
  }, []);

  useEffect(() => {
    if (records.length === 0) return;
    calculateDashboardStats(records);
  }, [records]);

  const fetchUnopnamed = async () => {
    try {
      const counts = await getUnopnamedCounts();
      setUnopnamed(counts);
    } catch (e) {
      console.error("Failed to fetch unopnamed counts", e);
    }
  };

  const fetchData = async (usersOnly = false) => {
    if (usersOnly) {
         const { data } = await supabase.from('users_online').select('*').order('last_seen', { ascending: false });
         if (data) setUsersOnline(data);
         return;
    }

    const [usersRes, recordsData, locsRes] = await Promise.all([
      supabase.from('users_online').select('*').order('last_seen', { ascending: false }),
      fetchAllOpnameRecords(),
      supabase.from('locations').select('*')
    ]);

    if (usersRes.data) setUsersOnline(usersRes.data);
    
    if (recordsData) {
        setRecords(recordsData);
        if (locsRes.data) {
            calculateDashboardStats(recordsData, locsRes.data);
        } else {
            calculateDashboardStats(recordsData);
        }
    }
  };

  const calculateDashboardStats = async (currentRecords: any[], locations?: any[]) => {
      const counts = {
        'Synchronized': currentRecords.filter(r => r.status === 'Synchronized').length,
        'Missing Data': currentRecords.filter(r => r.status === 'Missing Data').length,
        'Not Available': currentRecords.filter(r => r.status === 'Not Available').length,
      };
      setStatusSummary([
        { name: 'Synchronized', value: counts['Synchronized'], color: '#22c55e' },
        { name: 'Missing Data', value: counts['Missing Data'], color: '#eab308' },
        { name: 'Not Available', value: counts['Not Available'], color: '#ef4444' },
      ]);

      const userGroup = currentRecords.reduce((acc: any, r: any) => {
        acc[r.user_name] = (acc[r.user_name] || 0) + 1;
        return acc;
      }, {});
      setOpnameStats(Object.keys(userGroup).map(key => ({ name: key, count: userGroup[key] })));

      let locs = locations;
      if (!locs) {
          const { data } = await supabase.from('locations').select('*');
          locs = data || [];
      }

      const matrix = Object.keys(userGroup).map(user => {
        const row: any = { name: user };
        (locs || []).forEach((loc: any) => {
          row[loc.name] = currentRecords.filter(r => r.user_name === user && r.location === loc.name).length;
        });
        return row;
      });
      setLocationStats(matrix);
  };

  const getUserStatus = (lastSeen: string) => {
    const lastSeenDate = new Date(lastSeen).getTime();
    const now = new Date().getTime();
    return now - lastSeenDate < 5 * 60 * 1000;
  };

  const handleSaveNotification = async () => {
    try {
      await updateSystemNotification(editNotifText);
      setIsEditingNotif(false);
    } catch (e) {
      alert("Failed to update notification");
    }
  };

  const openNotifModal = () => {
    setEditNotifText(notification || '');
    setIsEditingNotif(false);
    setShowNotifModal(true);
  }

  const StatCard = ({ title, data, colorClass, textClass, barColorClass }: any) => {
    const percentOpnamed = data.total > 0 ? ((data.opnamed / data.total) * 100).toFixed(1) : '0.0';
    return (
      <div className={`p-4 text-center group hover:${colorClass} transition-colors flex flex-col items-center justify-center min-h-[140px]`}>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
        <p className={`text-2xl font-black ${textClass} mb-1 group-hover:scale-110 transition-transform`}>
          {data.remaining} <span className="text-sm text-gray-300 font-medium">/ {data.total}</span>
        </p>
        <div className="w-full max-w-[80%] h-1.5 bg-gray-100 rounded-full mb-1 overflow-hidden">
           <div className={`h-full ${barColorClass}`} style={{ width: `${percentOpnamed}%` }}></div>
        </div>
        <p className="text-[10px] font-bold text-gray-500 mb-2">{percentOpnamed}% Opnamed</p>
        <div className="flex gap-2 text-[9px] font-bold uppercase text-gray-400 bg-white/50 px-2 py-1 rounded-lg border border-gray-100">
           <span className="text-green-600">Sync: {data.synchronized}</span>
           <span className="text-gray-300">|</span>
           <span className="text-yellow-600">Missing: {data.missing}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Dashboard Overview</h2>
          <p className="text-sm text-gray-500 font-medium">Real-time monitoring of reconciliation progress</p>
        </div>
        <div className="flex items-center gap-3">
          {(notification || role === UserRole.ADMIN) && (
             <button
                onClick={openNotifModal}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${
                  notification
                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 animate-pulse border border-yellow-200'
                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-100'
                }`}
             >
                <Bell size={14} className={notification ? 'fill-yellow-500' : ''} />
                {notification ? 'Announcement' : 'Set Announcement'}
             </button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
            <Activity size={14} className="animate-pulse" />
            Live Updates Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 group">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <Users size={24} strokeWidth={2.5} />
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-gray-900 mb-1">
              {usersOnline.filter(u => getUserStatus(u.last_seen)).length}
            </p>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Active Online Users</p>
          </div>
        </div>

        {statusSummary.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 group relative overflow-hidden">
            <div className="absolute right-0 top-0 w-24 h-24 rounded-full opacity-5 -mr-8 -mt-8 pointer-events-none transition-transform group-hover:scale-150" style={{ backgroundColor: stat.color }}></div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                {stat.name === 'Synchronized' && <ClipboardCheck size={24} strokeWidth={2.5} />}
                {stat.name === 'Missing Data' && <AlertTriangle size={24} strokeWidth={2.5} />}
                {stat.name === 'Not Available' && <XCircle size={24} strokeWidth={2.5} />}
              </div>
              <span className="px-2.5 py-1 bg-gray-50 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-md">Status</span>
            </div>
            <div>
              <p className="text-3xl font-black text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
              <Circle size={16} className="fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">User Activity Status</h3>
              <p className="text-xs text-gray-500">Live monitoring of connected inspectors</p>
            </div>
          </div>
          <div className="overflow-auto flex-1 max-h-[400px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white sticky top-0 z-10 border-b border-gray-100">
                <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-4 bg-gray-50/80 backdrop-blur-sm w-16">#</th>
                  <th className="px-6 py-4 bg-gray-50/80 backdrop-blur-sm">Inspector Name</th>
                  <th className="px-6 py-4 bg-gray-50/80 backdrop-blur-sm">Last Seen</th>
                  <th className="px-6 py-4 bg-gray-50/80 backdrop-blur-sm text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usersOnline.map((user, idx) => {
                  const isActive = getUserStatus(user.last_seen);
                  return (
                    <tr key={user.name} className="hover:bg-blue-50/30 transition-colors group">
                      <td className="px-6 py-4 text-gray-400 font-medium">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-gray-700">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                        {new Date(user.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                          isActive ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                          {isActive ? 'Active' : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {usersOnline.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic text-xs">
                      No users currently online
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
             <h3 className="font-bold text-gray-900">Overall Progress</h3>
             <p className="text-xs text-gray-500">Distribution of reconciliation statuses</p>
          </div>
          <div className="flex-1 p-6 flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusSummary}
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={4}
                  >
                    {statusSummary.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} itemStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black text-gray-800">
                  {statusSummary.reduce((a, b) => a + b.value, 0)}
                </span>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Records</span>
              </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-3 mt-6">
               {statusSummary.map(s => (
                 <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                   <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></div>
                     <span className="text-[10px] font-bold text-gray-600 uppercase truncate max-w-[80px]">{s.name}</span>
                   </div>
                   <span className="text-xs font-black text-gray-900">{s.value}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
            <LayoutGrid size={16} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Remaining Unopnamed Batch ID</h3>
            <p className="text-xs text-gray-500">Live count of outstanding stock</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
           <StatCard title="SAP" data={unopnamed.sap} colorClass="bg-blue-50" textClass="text-blue-600" barColorClass="bg-blue-600" />
           <StatCard title="Mother Slab" data={unopnamed.mother} colorClass="bg-purple-50" textClass="text-purple-600" barColorClass="bg-purple-600" />
           <StatCard title="Cut Stock" data={unopnamed.cut} colorClass="bg-orange-50" textClass="text-orange-600" barColorClass="bg-orange-600" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
            <LayoutGrid size={16} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Location Distribution Matrix</h3>
            <p className="text-xs text-gray-500">Breakdown of slab counts by user and location</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">User</th>
                {locationStats.length > 0 && Object.keys(locationStats[0]).filter(k => k !== 'name').map(loc => (
                  <th key={loc} className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center border-l border-gray-100">{loc}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {locationStats.map((row, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-700 sticky left-0 bg-white group-hover:bg-indigo-50/30 border-r border-gray-100 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">{row.name}</td>
                  {Object.keys(row).filter(k => k !== 'name').map(loc => (
                    <td key={loc} className="px-6 py-4 text-center border-l border-gray-50">
                      {row[loc] > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold shadow-sm">{row[loc]}</span>
                      ) : (
                        <span className="text-gray-200 font-medium text-xs">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {locationStats.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-400 italic text-xs">No location data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNotifModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slideUp">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-gray-800">System Announcement</h3>
              <button onClick={() => setShowNotifModal(false)} className="hover:bg-gray-100 rounded-full p-1"><X size={20}/></button>
            </div>
            {isEditingNotif ? (
              <div className="space-y-4">
                <textarea className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none h-32 text-sm font-medium" placeholder="Enter announcement text..." value={editNotifText} onChange={(e) => setEditNotifText(e.target.value)}></textarea>
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingNotif(false)} className="flex-1 py-2 rounded-lg font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">Cancel</button>
                  <button onClick={handleSaveNotification} className="flex-1 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2"><Save size={16}/> Save</button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {notification ? (
                  <div className="bg-yellow-50 p-4 rounded-xl text-sm font-medium text-gray-800 whitespace-pre-wrap">{notification}</div>
                ) : (
                  <div className="text-center py-8 text-gray-400 italic text-sm">No active announcement</div>
                )}
                {role === UserRole.ADMIN && (
                  <button onClick={() => setIsEditingNotif(true)} className="w-full py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center justify-center gap-2">
                    <Edit size={16}/> {notification ? 'Edit Announcement' : 'Create Announcement'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;