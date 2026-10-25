/**
 * Authentication and User Management Service
 */

export interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active?: boolean;
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

  return json.user;
};

export const registerUser = async (username: string, full_name: string, password: string): Promise<AuthUser> => {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username, full_name, password })
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Registration failed');
  }

  return json.user;
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

export const adminListUsers = async (): Promise<AuthUser[]> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list_users' })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to list users');
  return json.users || [];
};

export const adminListResetRequests = async (): Promise<PasswordResetRequest[]> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'toggle_user_status', username, is_active: isActive })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to toggle user status');
};

export const adminToggleUserRole = async (username: string, role: 'admin' | 'user'): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'toggle_user_role', username, role })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to toggle user role');
};

export const adminDeleteUser = async (username: string): Promise<void> => {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_user_account', username })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete user');
};
