import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { UserRole, Location, LockStatus } from './types';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import OpnameSlab from './components/OpnameSlab';
import OpnameList from './components/OpnameList';
import Setting from './components/Setting';
import Database from './components/Database';
import DatabaseSetup from './components/DatabaseSetup';
import LockBanner from './components/LockBanner';
import About from './components/About';
import { Minus, Plus, Lock, Unlock, X, Info, UserPlus, LogIn, KeyRound, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { getSystemNotification, getLockStatus, setLockMode } from './services/dataService';
import { loginUser, registerUser, requestPasswordReset, getMe, logoutUser } from './services/authService';
import { useI18n } from './i18n';

const App: React.FC = () => {
  const { language, setLanguage, t } = useI18n();
  const [userName, setUserName] = useState<string | null>(localStorage.getItem('slab_opname_user'));
  const [role, setRole] = useState<UserRole>((localStorage.getItem('slab_opname_role') as UserRole) || UserRole.USER);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [locations, setLocations] = useState<Location[]>([]);
  const [isDbReady, setIsDbReady] = useState<boolean | null>(null);
  const [uiScale, setUiScale] = useState<number>(Number(localStorage.getItem('slab_ui_scale')) || 1);

  const [globalSearchInput, setGlobalSearchInput] = useState('');
  const [globalSelectedBatchId, setGlobalSelectedBatchId] = useState<string | null>(null);
  const [lastManualInput, setLastManualInput] = useState('');

  // Auth States
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [forgotNotes, setForgotNotes] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Notification State
  const [notification, setNotification] = useState('');
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);

  // Lock State
  const [lockStatus, setLockStatus] = useState<LockStatus>({ lock_mode: false, locked_at: null, locked_by: null });
  const [togglingLock, setTogglingLock] = useState(false);

  // Global Presence State
  const [globalOnlineUsers, setGlobalOnlineUsers] = useState<Array<{ name: string; last_seen: string }>>([]);
  const [showOnlinePopover, setShowOnlinePopover] = useState(false);

  const activeOnlineUsers = globalOnlineUsers.filter(u => {
    if (!u.last_seen) return false;
    const diff = Math.abs(Date.now() - new Date(u.last_seen).getTime());
    return diff < 5 * 60 * 1000;
  });

  useEffect(() => {
    checkDatabase();
    fetchLockStatus();

    const token = localStorage.getItem('slab_opname_token');
    if (token) {
      getMe().then(user => {
        if (user) {
          const userRole = user.role === 'admin' ? UserRole.ADMIN : UserRole.USER;
          const displayName = user.full_name || user.username;
          setUserName(displayName);
          setRole(userRole);
          localStorage.setItem('slab_opname_user', displayName);
          localStorage.setItem('slab_opname_username', user.username);
          localStorage.setItem('slab_opname_role', userRole);
        } else {
          handleLogout();
        }
      });
    }
  }, []);

  const handleLogout = useCallback(() => {
    const rawUsername = localStorage.getItem('slab_opname_username') || userName;
    if (rawUsername) {
      supabase.from('users_online').delete().ilike('name', `%${rawUsername}%`);
    }
    logoutUser();
    setUserName(null);
    setAuthUsername('');
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthFullName('');
    setAuthError(null);
    setAuthSuccess(null);
    sessionStorage.removeItem('hasSeenNotification');
  }, [userName]);

  // Real-time listeners & Notification
  useEffect(() => {
    if (!userName || !isDbReady) return;

    // Fetch initial notification
    getSystemNotification().then(text => {
      setNotification(text);
      if (text && !sessionStorage.getItem('hasSeenNotification')) {
        setShowNotificationPopup(true);
        sessionStorage.setItem('hasSeenNotification', 'true');
      }
    });

    // 1. Kick Signal Listener
    const systemChannel = supabase
      .channel('system-signals')
      .on('broadcast', { event: 'KICK_USER' }, ({ payload }) => {
        const myUsername = localStorage.getItem('slab_opname_username');
        if (payload.name === userName || payload.name === myUsername || (myUsername && payload.name?.includes(myUsername))) {
          alert('SECURITY ALERT: Your session has been terminated by the Administrator.');
          handleLogout();
        }
      })
      .subscribe();

    // 2. Locations Real-time Sync
    const locationChannel = supabase
      .channel('locations-realtime')
      .on('postgres_changes', { event: '*', table: 'locations', schema: 'public' }, () => {
        fetchInitialData();
      })
      .subscribe();

    // 3. Settings Real-time Sync
    const settingsChannel = supabase
      .channel('settings-realtime')
      .on('postgres_changes', { event: '*', table: 'system_settings', schema: 'public' }, payload => {
        const newText = (payload.new as any)?.notification_text || '';
        setNotification(newText);

        if (payload.new) {
          setLockStatus({
            lock_mode: (payload.new as any).lock_mode ?? false,
            locked_at: (payload.new as any).locked_at ?? null,
            locked_by: (payload.new as any).locked_by ?? null
          });
        }
      })
      .subscribe();

    // 4. Global Online Users Real-time Sync
    const usersOnlineChannel = supabase
      .channel('app-users-online')
      .on('postgres_changes', { event: '*', table: 'users_online', schema: 'public' }, () => {
        fetchGlobalOnlineUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(systemChannel);
      supabase.removeChannel(locationChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(usersOnlineChannel);
    };
  }, [userName, isDbReady, handleLogout]);

  const checkDatabase = async () => {
    try {
      const { error } = await supabase.from('sap_stock').select('id').limit(1);
      if (error && (error.code === 'PGRST205' || error.message.includes('not found'))) {
        setIsDbReady(false);
      } else {
        setIsDbReady(true);
      }
    } catch (e) {
      setIsDbReady(false);
    }
  };

  useEffect(() => {
    if (userName && isDbReady) {
      updateUserStatus(userName, true); // Initial login = true
      fetchInitialData();
      fetchGlobalOnlineUsers();
      const interval = setInterval(() => {
        updateUserStatus(userName, false);
        fetchGlobalOnlineUsers();
      }, 30000); // Heartbeat = 30s
      return () => clearInterval(interval);
    }
  }, [userName, isDbReady]);

  const fetchGlobalOnlineUsers = async () => {
    try {
      const { data } = await supabase.from('users_online').select('*').order('last_seen', { ascending: false });
      if (data) setGlobalOnlineUsers(data);
    } catch (e) {}
  };

  const fetchInitialData = async () => {
    const { data: locs } = await supabase.from('locations').select('*').order('name');
    setLocations(locs || []);
  };

  const fetchLockStatus = async () => {
    try {
      const status = await getLockStatus();
      setLockStatus(status);
    } catch (error) {
      console.error('Failed to fetch lock status:', error);
    }
  };

  const handleToggleLock = async () => {
    if (!userName || role !== UserRole.ADMIN) return;

    setTogglingLock(true);
    try {
      const newLockState = !lockStatus.lock_mode;
      await setLockMode(newLockState, userName);
      await fetchLockStatus();
    } catch (error) {
      alert('Failed to update lock status');
    } finally {
      setTogglingLock(false);
    }
  };

  const updateUserStatus = async (name: string, isInitial: boolean) => {
    try {
      const u = localStorage.getItem('slab_opname_username') || name;
      const sessionKey = `${name} (${u})`;
      if (isInitial) {
        await supabase.from('users_online').upsert(
          [
            {
              name: sessionKey,
              last_seen: new Date().toISOString()
            }
          ],
          { conflictCol: 'name' }
        );
      } else {
        const { data, error } = await supabase
          .from('users_online')
          .update({ last_seen: new Date().toISOString() })
          .eq('name', sessionKey)
          .select();

        if (!error && data && data.length === 0) {
          // Re-upsert if session row was opportunistically cleaned up
          await supabase.from('users_online').upsert(
            [
              {
                name: sessionKey,
                last_seen: new Date().toISOString()
              }
            ],
            { conflictCol: 'name' }
          );
        }
      }
    } catch (e) {
      console.warn('User status update failed', e);
    }
  };

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const u = authUsername.trim();
    if (!u || !authPassword) {
      setAuthError('Please enter both username and password.');
      return;
    }

    setIsAuthLoading(true);
    try {
      const user = await loginUser(u, authPassword);
      const userRole = user.role === 'admin' ? UserRole.ADMIN : UserRole.USER;
      const displayName = user.full_name || user.username;

      setUserName(displayName);
      setRole(userRole);
      localStorage.setItem('slab_opname_user', displayName);
      localStorage.setItem('slab_opname_username', user.username);
      localStorage.setItem('slab_opname_role', userRole);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const u = authUsername.trim();
    const fn = authFullName.trim().toUpperCase();

    if (!u || !fn || !authPassword) {
      setAuthError('Username, Full Name, and Password are all required.');
      return;
    }

    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsAuthLoading(true);
    try {
      const res = await registerUser(u, fn, authPassword);
      if (res.pendingApproval) {
        setAuthSuccess(res.message || 'Account created successfully! Your account is pending Administrator approval before you can log in.');
        setAuthUsername('');
        setAuthFullName('');
        setAuthPassword('');
        setAuthConfirmPassword('');
        setAuthMode('login');
      } else {
        const user = res.user;
        setAuthSuccess(`Account created for ${user.full_name}! Logging you in...`);
        setTimeout(() => {
          const userRole = user.role === 'admin' ? UserRole.ADMIN : UserRole.USER;
          const displayName = user.full_name || user.username;
          setUserName(displayName);
          setRole(userRole);
          localStorage.setItem('slab_opname_user', displayName);
          localStorage.setItem('slab_opname_username', user.username);
          localStorage.setItem('slab_opname_role', userRole);
        }, 700);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const u = authUsername.trim();
    if (!u) {
      setAuthError('Please enter your username.');
      return;
    }

    setIsAuthLoading(true);
    try {
      const msg = await requestPasswordReset(u, forgotNotes.trim());
      setAuthSuccess(msg);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to submit reset request.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const adjustScale = (delta: number) => {
    const newScale = Math.min(Math.max(uiScale + delta, 0.6), 1.4);
    setUiScale(newScale);
    localStorage.setItem('slab_ui_scale', newScale.toString());
  };

  const LOGO_URL = 'https://myjourney-api.atmajaya.ac.id/storage/20240705/0fecce437f9e4991781ea0291336233e89f7a14f.png';

  if (isDbReady === false) {
    return <DatabaseSetup onRetry={checkDatabase} />;
  }

  if (isDbReady === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="animate-pulse text-blue-600 font-bold tracking-widest text-sm text-center px-4 uppercase">
            Initializing System
          </div>
        </div>
      </div>
    );
  }

  // LOGIN & AUTH SCREEN
  if (!userName) {
    return (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-full border border-gray-100 animate-slideUp my-auto">
          {/* Header & Logo */}
          <div className="flex justify-center mb-4">
            <img src={LOGO_URL} alt="GRP" className="h-14 object-contain" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 text-center">PPIC Slab Stock Opname</h2>
          <p className="text-[10px] text-gray-400 mb-6 text-center uppercase tracking-widest font-black">
            Reconciliation & Inventory Portal
          </p>

          {/* Mode Switcher Tabs (Sign In / Register) */}
          {authMode !== 'forgot' && (
            <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  authMode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <LogIn size={14} /> Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  authMode === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <UserPlus size={14} /> Create Account
              </button>
            </div>
          )}

          {/* Error & Success Messages */}
          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs mb-4 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs mb-4 flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
              <span>{authSuccess}</span>
            </div>
          )}

          {/* FORM 1: SIGN IN */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Username</label>
                <input
                  type="text"
                  placeholder="e.g. john or admin"
                  autoFocus
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div>
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="Enter Password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95 disabled:bg-blue-300 mt-2 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {isAuthLoading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-gray-400">First time here? </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Create an account
                </button>
              </div>
            </form>
          )}

          {/* FORM 2: CREATE ACCOUNT */}
          {authMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Username (login ID)</label>
                <input
                  type="text"
                  placeholder="e.g. budi_ppic"
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Full Name (UPPERCASE)</label>
                <input
                  type="text"
                  placeholder="e.g. BUDI SANTOSO"
                  value={authFullName}
                  onChange={e => setAuthFullName(e.target.value.toUpperCase())}
                  className="w-full uppercase font-medium border border-gray-300 rounded-xl px-4 py-2.5 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Password</label>
                <input
                  type="password"
                  placeholder="Min. 4 characters"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Re-type Password"
                  value={authConfirmPassword}
                  onChange={e => setAuthConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-95 disabled:bg-blue-300 mt-2"
              >
                {isAuthLoading ? 'Creating Account...' : 'Register Account'}
              </button>

              <div className="text-center pt-2">
                <span className="text-xs text-gray-400">Already registered? </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* FORM 3: FORGOT PASSWORD */}
          {authMode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-gray-700 pb-1">
                <KeyRound className="text-blue-600" size={20} />
                <h3 className="font-bold text-sm">Request Password Reset</h3>
              </div>
              <p className="text-xs text-gray-500">
                Submit your username. A notification will be sent to the Administrator to reset your password.
              </p>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Your Username</label>
                <input
                  type="text"
                  placeholder="Enter your registered username"
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Notes for Admin (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Please reset to temp123 or I forgot my password"
                  value={forgotNotes}
                  onChange={e => setForgotNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base sm:text-sm focus:ring-4 focus:ring-blue-50 outline-none transition-all focus:border-blue-500 text-gray-900 bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="flex-1 py-3 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-xs rounded-xl transition-all shadow active:scale-95 disabled:bg-blue-300"
                >
                  {isAuthLoading ? 'Submitting...' : 'Send Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ zoom: typeof window !== 'undefined' && window.innerWidth >= 768 ? uiScale : undefined }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-3 overflow-hidden shrink-0">
            <img src={LOGO_URL} alt="GRP" className="h-7 sm:h-9 object-contain" />
            <div className="h-5 w-[1px] bg-gray-200 hidden sm:block"></div>
            <div className="hidden sm:block">
              <h1 className="text-xs md:text-sm font-black text-gray-900 truncate uppercase tracking-tighter">
                {t.header.title}
              </h1>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{t.header.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200 shadow-inner">
              <button
                onClick={() => setLanguage('id')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] font-black tracking-wider transition-all ${
                  language === 'id'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
                title="Bahasa Indonesia"
              >
                🇮🇩 ID
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] font-black tracking-wider transition-all ${
                  language === 'en'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
                title="English"
              >
                🇬🇧 EN
              </button>
            </div>

            {/* Scale adjustment (Desktop only) */}
            <div className="hidden md:flex items-center bg-gray-50 rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => adjustScale(-0.1)}
                className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"
              >
                <Minus size={14} />
              </button>
              <div className="px-2 text-[10px] font-bold text-gray-400 select-none min-w-[35px] text-center">
                {Math.round(uiScale * 100)}%
              </div>
              <button
                onClick={() => adjustScale(0.1)}
                className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Real-time Online Users Badge */}
            <div className="relative">
              <button
                onClick={() => setShowOnlinePopover(prev => !prev)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-full text-xs font-bold border border-emerald-200 transition-all shadow-sm active:scale-95"
                title="View Connected Users"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-mono font-black text-[11px] sm:text-xs">{activeOnlineUsers.length}</span>
                <span className="hidden sm:inline text-[11px] font-bold">Online</span>
              </button>

              {showOnlinePopover && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-20px)] bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Active Users ({activeOnlineUsers.length})
                    </span>
                    <button
                      onClick={() => setShowOnlinePopover(false)}
                      className="text-gray-400 hover:text-gray-600 text-xs font-bold p-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {activeOnlineUsers.map((u, i) => {
                      const match = (u.name || '').match(/^(.*?)(?:\s*\((.*?)\))?$/);
                      const displayName = match?.[1]?.trim() || u.name;
                      const uname = match && match[2] ? `@${match[2]}` : '';
                      const isMe = displayName === userName || (uname && uname === `@${localStorage.getItem('slab_opname_username')}`);
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 hover:bg-blue-50/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-bold text-gray-800 leading-tight truncate">
                                {displayName}
                                {isMe && <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1 py-0.2 rounded font-bold">You</span>}
                              </p>
                              {uname && <p className="text-[10px] text-gray-400 font-mono truncate">{uname}</p>}
                            </div>
                          </div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                            Active
                          </span>
                        </div>
                      );
                    })}
                    {activeOnlineUsers.length === 0 && (
                      <p className="text-xs text-gray-400 italic text-center py-2">No other users online</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 sm:border-r sm:pr-4 border-gray-100">
              {role === UserRole.ADMIN && (
                <button
                  onClick={handleToggleLock}
                  disabled={togglingLock}
                  className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                    lockStatus.lock_mode
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={lockStatus.lock_mode ? 'Unlock System' : 'Lock System'}
                >
                  {togglingLock ? (
                    <Minus size={15} className="animate-spin" />
                  ) : lockStatus.lock_mode ? (
                    <Lock size={15} />
                  ) : (
                    <Unlock size={15} />
                  )}
                </button>
              )}
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-gray-900 leading-tight">{userName}</p>
                <p className="text-[9px] uppercase tracking-wider text-blue-500 font-black">{role}</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-inner shrink-0" title={`${userName} (${role})`}>
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest flex items-center gap-1"
              title={t.header.signOut}
            >
              <LogOut size={16} className="text-gray-500 hover:text-red-600" />
              <span className="hidden sm:inline text-xs font-black">{t.header.signOut}</span>
            </button>
          </div>
        </div>
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        <LockBanner
          isLocked={lockStatus.lock_mode}
          lockedBy={lockStatus.locked_by}
          lockedAt={lockStatus.locked_at}
          role={role}
          onToggleLock={handleToggleLock}
        />
      </header>

      <main className="flex-1 overflow-auto bg-white">
        <div className="max-w-7xl mx-auto w-full p-3 md:p-8 origin-top">
          {activeTab === 'Dashboard' && <Dashboard userName={userName} role={role} notification={notification} />}
          {activeTab === 'Opname Slab' && (
            <OpnameSlab
              userName={userName}
              locations={locations}
              searchInput={globalSearchInput}
              setSearchInput={setGlobalSearchInput}
              selectedBatchId={globalSelectedBatchId}
              setSelectedBatchId={setGlobalSelectedBatchId}
              lastManualInput={lastManualInput}
              setLastManualInput={setLastManualInput}
              isLocked={lockStatus.lock_mode}
            />
          )}
          {activeTab === 'Opname List' && (
            <OpnameList role={role} userName={userName} isLocked={lockStatus.lock_mode} />
          )}
          {activeTab === 'Setting' && (
            <Setting
              role={role}
              locations={locations}
              currentUserName={userName}
              onRefresh={fetchInitialData}
              isLocked={lockStatus.lock_mode}
            />
          )}
          {activeTab === 'Database' && <Database role={role} isLocked={lockStatus.lock_mode} userName={userName} />}
          {activeTab === 'About' && <About />}
        </div>
      </main>

      {/* Notification Login Popup */}
      {showNotificationPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slideUp border border-yellow-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-yellow-600 flex items-center gap-2">
                <Info size={20} className="fill-yellow-100 stroke-yellow-600" /> SYSTEM ANNOUNCEMENT
              </h3>
              <button onClick={() => setShowNotificationPopup(false)} className="hover:bg-gray-100 rounded-full p-1">
                <X size={20} />
              </button>
            </div>
            <div className="bg-yellow-50 p-4 rounded-xl text-sm font-medium text-gray-800 whitespace-pre-wrap">
              {notification}
            </div>
            <button
              onClick={() => setShowNotificationPopup(false)}
              className="w-full mt-6 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-xl transition-all"
            >
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
