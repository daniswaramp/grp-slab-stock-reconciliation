/**
 * Authentication and User Management Service
 */

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active?: boolean;
  status?: 'pending_approval' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

export interface PasswordResetRequest {
  id: string;
  username: string;
  full_name: string;
  notes: string;
  status: 'pending' | 'resolved';
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

function getAuthHeaders(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem('slab_opname_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const loginUser = async (username: string, password: string): Promise<AuthUser> => {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username, password })
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Login failed');
  }

  if (json.token) {
    localStorage.setItem('slab_opname_token', json.token);
  }

  return json.user;
};

export const registerUser = async (
  username: string,
  full_name: string,
  password: string
): Promise<{ user: AuthUser; pendingApproval: boolean; message: string }> => {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username, full_name, password })
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Registration failed');
  }

  return {
    user: json.user,
    pendingApproval: !!json.pendingApproval,
    message: json.message || 'Account created successfully! Awaiting Administrator approval.'
  };
};

export const getMe = async (): Promise<AuthUser | null> => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('slab_opname_token') : null;
  if (!token) return null;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action: 'me' })
    });

    if (!res.ok) {
      localStorage.removeItem('slab_opname_token');
      return null;
    }

    const json = await res.json();
    return json.user;
  } catch {
    return null;
  }
};

export const logoutUser = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('slab_opname_token');
    localStorage.removeItem('slab_opname_user');
    localStorage.removeItem('slab_opname_username');
    localStorage.removeItem('slab_opname_role');
  }
};

export const requestPasswordReset = async (username: string, notes?: string): Promise<string> => {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'forgot_password', username, notes })
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Password reset request failed');
  }

  return json.message;
};

// --- Admin Endpoints ---

export const adminListUsers = async (): Promise<AuthUser[]> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'list_users' })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to list users');
  return json.users || [];
};

export const adminListPendingUsers = async (): Promise<AuthUser[]> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'list_pending_users' })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to list pending users');
  return json.users || [];
};

export const adminApproveUser = async (username: string): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'approve_user', username })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to approve user');
};

export const adminRejectUser = async (username: string): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'reject_user', username })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to reject user');
};

export const adminListResetRequests = async (): Promise<PasswordResetRequest[]> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'list_reset_requests' })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to list reset requests');
  return json.requests || [];
};

export const adminResolveReset = async (
  requestId: string | null,
  username: string,
  newPassword: string,
  adminName: string
): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      action: 'resolve_reset_request',
      request_id: requestId,
      username,
      new_password: newPassword,
      admin_name: adminName
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to resolve reset request');
};

export const adminSetPassword = async (
  username: string,
  newPassword: string,
  adminName: string
): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      action: 'admin_set_password',
      username,
      new_password: newPassword,
      admin_name: adminName
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update password');
};

export const adminToggleUserStatus = async (username: string, isActive: boolean): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'toggle_user_status', username, is_active: isActive })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to toggle user status');
};

export const adminToggleUserRole = async (username: string, role: 'admin' | 'user'): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'toggle_user_role', username, role })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to toggle user role');
};

export const adminDeleteUser = async (username: string): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action: 'delete_user_account', username })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete user');
};
