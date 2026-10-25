import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { addLocation, deleteLocation, kickAndRemoveUser } from '../services/dataService';
import {
  adminListUsers,
  adminListPendingUsers,
  adminApproveUser,
  adminRejectUser,
  adminListResetRequests,
  adminResolveReset,
  adminSetPassword,
  adminToggleUserStatus,
  adminToggleUserRole,
  adminDeleteUser,
  AuthUser,
  PasswordResetRequest
} from '../services/authService';
import { Location, UserRole } from '../types';
import {
  Plus,
  Trash2,
  MapPin,
  Users,
  ShieldAlert,
  Circle,
  RefreshCcw,
  KeyRound,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  UserPlus,
  Check,
  XCircle
} from 'lucide-react';
import { useI18n } from '../i18n';

interface Props {
  role: UserRole;
  locations: Location[];
  currentUserName: string;
  onRefresh: () => void;
  isLocked?: boolean;
}

const Setting: React.FC<Props> = ({ role, locations, currentUserName, onRefresh, isLocked = false }) => {
  const { t } = useI18n();
  const [newLocation, setNewLocation] = useState('');
  const [onlineSessions, setOnlineSessions] = useState<any[]>([]);
  const [appUsers, setAppUsers] = useState<AuthUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AuthUser[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password reset inline state
  const [selectedUserForReset, setSelectedUserForReset] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'resets' | 'locations'>('users');

  useEffect(() => {
    fetchData();

    // Listen for realtime events
    const sub = supabase.channel('settings-realtime-view')
      .on('postgres_changes', { event: '*', table: 'users_online', schema: 'public' }, () => {
        fetchOnlineSessions();
      })
      .on('broadcast', { event: 'PASSWORD_RESET_REQUESTED' }, () => {
        fetchData();
      })
      .on('broadcast', { event: 'USER_REGISTERED' }, () => {
        fetchData();
      })
      .on('broadcast', { event: 'USER_APPROVED' }, () => {
        fetchData();
      })
      .on('broadcast', { event: 'USER_REJECTED' }, () => {
        fetchData();
      })
      .on('broadcast', { event: 'USER_DELETED' }, () => {
        fetchData();
      })
      .subscribe();

    const interval = setInterval(() => {
      fetchOnlineSessions();
    }, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(sub);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchOnlineSessions(),
      role === UserRole.ADMIN ? fetchAppUsersAndResets() : Promise.resolve()
    ]);
    setIsLoading(false);
  };

  const fetchOnlineSessions = async () => {
    const { data } = await supabase.from('users_online').select('*').order('last_seen', { ascending: false });
    setOnlineSessions(data || []);
  };

  const isSessionActive = (lastSeen: string) => {
    if (!lastSeen) return false;
    const diff = Math.abs(Date.now() - new Date(lastSeen).getTime());
    return diff < 5 * 60 * 1000;
  };

  const isUserOnline = (username: string) => {
    const session = onlineSessions.find(s => {
      const raw = (s.name || '').toLowerCase();
      const target = (username || '').toLowerCase();
      return (
        raw.includes(`(${target})`) ||
        raw === target ||
        raw.startsWith(`${target} `)
      );
    });
    return session ? isSessionActive(session.last_seen) : false;
  };

  const parseSessionName = (rawName: string) => {
    const match = (rawName || '').match(/^(.*?)(?:\s*\((.*?)\))?$/);
    return {
      displayName: match?.[1]?.trim() || rawName || 'Unknown',
      username: match?.[2]?.trim() || null
    };
  };

  const formatRelativeTime = (lastSeen: string) => {
    if (!lastSeen) return '-';
    const diffSec = Math.floor(Math.abs(Date.now() - new Date(lastSeen).getTime()) / 1000);
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const fetchAppUsersAndResets = async () => {
    try {
      const [users, pending, requests] = await Promise.all([
        adminListUsers(),
        adminListPendingUsers(),
        adminListResetRequests()
      ]);
      setAppUsers(users);
      setPendingUsers(pending);
      setResetRequests(requests);
    } catch (err) {
      console.error('Failed to load users/requests:', err);
    }
  };

  const handleApproveUser = async (username: string) => {
    try {
      await adminApproveUser(username);
      alert(`User "${username}" approved successfully. They can now log in.`);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert('Failed to approve user: ' + (e.message || 'Error'));
    }
  };

  const handleRejectUser = async (username: string) => {
    if (!confirm(`Are you sure you want to REJECT and block registration for "${username}"?`)) return;
    try {
      await adminRejectUser(username);
      alert(`Registration for "${username}" rejected.`);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert('Failed to reject user: ' + (e.message || 'Error'));
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (username.toLowerCase() === 'admin' || username.toLowerCase() === currentUserName.toLowerCase()) {
      alert('Cannot delete the primary administrator or your own account.');
      return;
    }

    if (!confirm(`DANGER: Are you sure you want to PERMANENTLY delete user account "${username}"?\n\nThis will remove their login and terminate any active sessions immediately.`)) {
      return;
    }

    try {
      await adminDeleteUser(username);
      alert(`User account "${username}" has been permanently deleted.`);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert('Failed to delete user: ' + (e.message || 'Unknown error'));
    }
  };

  const handleAddLocation = async () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;
    if (locations.some(l => l.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('This location already exists.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addLocation(trimmed);
      setNewLocation('');
      onRefresh();
    } catch (e: any) {
      alert('Error adding location: ' + (e.message || 'Unknown error'));
    }
    setIsSubmitting(false);
  };

  const handleDeleteLocation = async (id: string) => {
    if (confirm('Are you sure you want to delete this location?')) {
      try {
        await deleteLocation(id);
        onRefresh();
      } catch (e) {
        alert('Error deleting location');
      }
    }
  };

  const handleKickSession = async (name: string) => {
    if (name.toLowerCase().includes('admin') || name.toLowerCase().includes(currentUserName.toLowerCase())) {
      alert('Cannot disconnect your own session.');
      return;
    }
    if (confirm(`FORCE DISCONNECT: Terminate session for "${name}"?`)) {
      try {
        await kickAndRemoveUser(name);
        setOnlineSessions(prev => prev.filter(u => u.name !== name));
      } catch (e) {
        alert('Failed to remove user session.');
      }
    }
  };

  const handleResolveReset = async (request: PasswordResetRequest) => {
    const newPwd = prompt(`Enter new password for user "${request.username}":`, '');
    if (!newPwd) return;
    if (newPwd.length < 4) {
      alert('Password must be at least 4 characters.');
      return;
    }

    try {
      await adminResolveReset(request.id, request.username, newPwd, currentUserName);
      alert(`Password for "${request.username}" has been updated to "${newPwd}". Please communicate this to the user.`);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert('Failed to reset password: ' + (e.message || 'Unknown error'));
    }
  };

  const handleDirectPasswordChange = async (username: string) => {
    if (!newPasswordInput || newPasswordInput.length < 4) {
      alert('Password must be at least 4 characters.');
      return;
    }

    try {
      await adminSetPassword(username, newPasswordInput, currentUserName);
      alert(`Password for "${username}" has been successfully changed.`);
      setSelectedUserForReset(null);
      setNewPasswordInput('');
    } catch (e: any) {
      alert('Failed to update password: ' + (e.message || 'Unknown error'));
    }
  };

  const handleToggleStatus = async (user: AuthUser) => {
    const nextStatus = !user.is_active;
    const actionName = nextStatus ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${actionName} user "${user.username}"?`)) return;

    try {
      await adminToggleUserStatus(user.username, nextStatus);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert(e.message || 'Failed to update user status');
    }
  };

  const handleToggleRole = async (user: AuthUser) => {
    const nextRole: 'admin' | 'user' = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change role of "${user.username}" to ${nextRole.toUpperCase()}?`)) return;

    try {
      await adminToggleUserRole(user.username, nextRole);
      fetchAppUsersAndResets();
    } catch (e: any) {
      alert(e.message || 'Failed to update user role');
    }
  };

  const pendingResets = resetRequests.filter(r => r.status === 'pending');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Alert for Pending Registrations */}
      {role === UserRole.ADMIN && pendingUsers.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <UserPlus className="text-blue-600 shrink-0" size={24} />
            <div>
              <h4 className="font-bold text-blue-900 text-sm">
                {pendingUsers.length} Pending Account Registration{pendingUsers.length > 1 ? 's' : ''}
              </h4>
              <p className="text-xs text-blue-700">New internal users have registered and are waiting for your approval before logging in.</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('approvals')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow"
          >
            Review Approvals
          </button>
        </div>
      )}

      {/* Alert for Pending Password Resets */}
      {role === UserRole.ADMIN && pendingResets.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600 shrink-0" size={24} />
            <div>
              <h4 className="font-bold text-amber-900 text-sm">
                {pendingResets.length} Pending Password Reset Request{pendingResets.length > 1 ? 's' : ''}
              </h4>
              <p className="text-xs text-amber-700">Users requested a password reset. Review and set new passwords below.</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('resets')}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow"
          >
            Review Requests
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        {role === UserRole.ADMIN && (
          <>
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center gap-2 relative shrink-0 ${
                activeTab === 'approvals' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <UserPlus size={16} /> {t.setting.pendingTab}
              {pendingUsers.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'users' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Users size={16} /> {t.setting.usersTab} ({appUsers.length})
            </button>

            <button
              onClick={() => setActiveTab('resets')}
              className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center gap-2 relative shrink-0 ${
                activeTab === 'resets' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <KeyRound size={16} /> {t.setting.resetsTab}
              {pendingResets.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingResets.length}
                </span>
              )}
            </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('locations')}
          className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center gap-2 shrink-0 ${
            activeTab === 'locations' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <MapPin size={16} /> {t.setting.locationsTab} ({locations.length})
        </button>

        <button
          onClick={fetchData}
          className={`ml-auto p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-50 transition-all ${
            isLoading ? 'animate-spin' : ''
          }`}
          title="Refresh Data"
        >
          <RefreshCcw size={18} />
        </button>
      </div>

      {/* TAB: PENDING APPROVALS (ADMIN ONLY) */}
      {role === UserRole.ADMIN && activeTab === 'approvals' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="text-blue-600" size={20} /> Pending User Approvals
              </h2>
              <p className="text-xs text-gray-400">
                Only approved users are granted access to log into the GRP Slab Opname system.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="px-6 py-3">Username</th>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Registered At</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingUsers.map(u => (
                  <tr key={u.id} className="hover:bg-blue-50/30">
                    <td className="px-6 py-4 font-bold text-gray-800">{u.username}</td>
                    <td className="px-6 py-4 text-gray-600">{u.full_name}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold">
                        Pending Approval
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleApproveUser(u.username)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition-all flex items-center gap-1 active:scale-95"
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          onClick={() => handleRejectUser(u.username)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.username)}
                          className="bg-gray-100 hover:bg-rose-50 hover:text-rose-600 text-gray-500 font-bold text-xs px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95"
                          title="Delete Registration Request"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">
                      No pending user registrations. All users are reviewed!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: USER ACCOUNTS (ADMIN ONLY) */}
      {role === UserRole.ADMIN && activeTab === 'users' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Users className="text-blue-600" size={20} /> Registered App Accounts
              </h2>
              <p className="text-xs text-gray-400">Manage user access, change passwords, and promote admins.</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="px-6 py-3">Username</th>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Presence</th>
                  <th className="px-6 py-3">Account State</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appUsers.map(u => {
                  const isCurrent = u.username.toLowerCase() === currentUserName.toLowerCase();
                  const isMasterAdmin = u.username.toLowerCase() === 'admin';
                  const online = isUserOnline(u.username);

                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-bold text-gray-800">
                        {u.username}
                        {isCurrent && (
                          <span className="ml-2 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase font-bold">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium">{u.full_name}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => !isMasterAdmin && handleToggleRole(u)}
                          disabled={isMasterAdmin}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-gray-100 text-gray-600'
                          } ${!isMasterAdmin ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                          title={!isMasterAdmin ? 'Click to toggle role' : 'Protected'}
                        >
                          {u.role.toUpperCase()}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {online ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Online Now
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-50 text-gray-400 border border-gray-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                            Offline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => !isMasterAdmin && handleToggleStatus(u)}
                          disabled={isMasterAdmin}
                          className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1.5 ${
                            u.is_active !== false && u.status === 'approved'
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-rose-700 bg-rose-50'
                          } ${!isMasterAdmin ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                        >
                          {u.is_active !== false && u.status === 'approved' ? <UserCheck size={14} /> : <UserX size={14} />}
                          {u.status === 'pending_approval'
                            ? 'Pending'
                            : u.is_active !== false
                            ? 'Active'
                            : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedUserForReset(u.username);
                              setNewPasswordInput('');
                            }}
                            className="text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-600 font-bold px-3 py-1.5 rounded-lg transition-all"
                          >
                            Reset Password
                          </button>
                          {!isMasterAdmin && !isCurrent && (
                            <button
                              onClick={() => handleDeleteUser(u.username)}
                              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm border border-rose-200 active:scale-95"
                              title="Permanently Delete User Account"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Inline Reset Password Modal */}
          {selectedUserForReset && (
            <div className="fixed inset-0 bg-gray-900 bg-opacity-40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-slideUp">
                <div className="flex items-center gap-2 text-gray-800">
                  <KeyRound className="text-blue-600" size={20} />
                  <h3 className="font-bold text-base">Change Password</h3>
                </div>
                <p className="text-xs text-gray-500">
                  Enter new password for <strong className="text-gray-800">{selectedUserForReset}</strong>:
                </p>
                <input
                  type="text"
                  placeholder="New Password (min. 4 chars)"
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  autoFocus
                />
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => {
                      setSelectedUserForReset(null);
                      setNewPasswordInput('');
                    }}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDirectPasswordChange(selectedUserForReset)}
                    className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
                  >
                    Save Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Online Sessions Table */}
          <div className="pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Circle size={10} className="fill-emerald-500 text-emerald-500" /> Active Online Sessions ({onlineSessions.filter(s => isSessionActive(s.last_seen)).length})
              </h3>
              <button
                onClick={() => fetchOnlineSessions()}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <RefreshCcw size={12} /> Refresh
              </button>
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[9px]">
                  <tr>
                    <th className="px-6 py-3">Logged-in User</th>
                    <th className="px-6 py-3">Last Active</th>
                    <th className="px-6 py-3">Presence</th>
                    <th className="px-6 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {onlineSessions.map(s => {
                    const isProtected = s.name.toLowerCase().includes('admin') || s.name.toLowerCase().includes(currentUserName.toLowerCase());
                    const { displayName, username } = parseSessionName(s.name);
                    const active = isSessionActive(s.last_seen);
                    return (
                      <tr key={s.name} className="hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${
                              active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{displayName}</p>
                              {username && <p className="text-[10px] text-gray-400 font-mono">@{username}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-semibold text-gray-700">{formatRelativeTime(s.last_seen)}</span>
                          <span className="text-gray-400 text-[10px] ml-1.5">
                            ({new Date(s.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
                            {active ? 'Active' : 'Idle'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {!isProtected ? (
                            <button
                              onClick={() => handleKickSession(s.name)}
                              className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                              title="Force Disconnect"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-300">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {onlineSessions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-400 italic">
                        No active sessions
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PASSWORD RESET REQUESTS (ADMIN ONLY) */}
      {role === UserRole.ADMIN && activeTab === 'resets' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <KeyRound className="text-blue-600" size={20} /> Password Reset Requests
            </h2>
            <p className="text-xs text-gray-400">
              Users who forgot their password send requests here. Set their new password to resolve the request.
            </p>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px]">
                <tr>
                  <th className="px-6 py-3">Username</th>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Notes</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Requested Time</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resetRequests.map(r => {
                  const isPending = r.status === 'pending';
                  return (
                    <tr key={r.id} className={isPending ? 'bg-amber-50/40 font-semibold' : 'text-gray-500'}>
                      <td className="px-6 py-4 text-gray-800">{r.username}</td>
                      <td className="px-6 py-4 text-gray-600">{r.full_name || '-'}</td>
                      <td className="px-6 py-4 text-xs italic text-gray-500">{r.notes || '-'}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                            isPending ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        {isPending ? (
                          <button
                            onClick={() => handleResolveReset(r)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition-all active:scale-95"
                          >
                            Set New Password
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 flex items-center justify-center gap-1">
                            <CheckCircle size={14} className="text-green-500" /> Resolved by {r.resolved_by}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {resetRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic">
                      No password reset requests received.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: LOCATIONS */}
      {activeTab === 'locations' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <MapPin className="text-blue-600" size={20} /> Location Management
          </h2>

          {role === UserRole.ADMIN ? (
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                placeholder="e.g. Yard 1, Bay A..."
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                disabled={isLocked}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 disabled:bg-gray-100"
                onKeyDown={e => e.key === 'Enter' && !isLocked && handleAddLocation()}
              />
              <button
                disabled={isSubmitting || isLocked}
                onClick={handleAddLocation}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md disabled:bg-blue-300"
              >
                <Plus size={18} /> {isSubmitting ? 'ADDING...' : 'ADD'}
              </button>
            </div>
          ) : (
            <div className="bg-blue-50 text-blue-600 p-4 rounded-xl text-sm flex items-center gap-2">
              <ShieldAlert size={16} /> <strong>Standard View:</strong> Read-only access.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {locations.map(loc => (
              <div
                key={loc.id}
                className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl hover:bg-white hover:shadow-md transition-all"
              >
                <span className="font-semibold text-gray-700">{loc.name}</span>
                {role === UserRole.ADMIN && !isLocked && (
                  <button
                    onClick={() => handleDeleteLocation(loc.id)}
                    className="text-gray-300 hover:text-red-500 p-2 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {locations.length === 0 && (
              <div className="col-span-full py-10 text-center text-gray-400 italic">No locations defined.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Setting;
