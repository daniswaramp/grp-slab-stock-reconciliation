import crypto from 'crypto';
import { getDb } from './db.js';
import { verifyToken } from './auth.js';

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authUser = verifyToken(req.headers.authorization);
    if (!authUser || authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
    }

    const db = getDb();
    const { action } = req.body;

    // 1. LIST ALL USERS
    if (action === 'list_users') {
      const users = await (db as any)(
        `SELECT id, username, full_name, role, is_active, status, created_at, updated_at
         FROM "app_users"
         ORDER BY role DESC, username ASC;`
      );
      return res.status(200).json({ users });
    }

    // 2. LIST PENDING REGISTRATIONS
    if (action === 'list_pending_users') {
      const users = await (db as any)(
        `SELECT id, username, full_name, role, status, created_at
         FROM "app_users"
         WHERE status = 'pending_approval'
         ORDER BY created_at ASC;`
      );
      return res.status(200).json({ users });
    }

    // 3. APPROVE USER REGISTRATION
    if (action === 'approve_user') {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
      }

      const rows = await (db as any)(
        `UPDATE "app_users"
         SET status = 'approved', is_active = true, updated_at = NOW()
         WHERE LOWER(username) = LOWER($1)
         RETURNING id, username, full_name, role, status;`,
        [username]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['USER_APPROVED', JSON.stringify({ username, approved_by: authUser.username })]
        );
      } catch (e) {}

      return res.status(200).json({ success: true, user: rows[0], message: `User ${username} approved.` });
    }

    // 4. REJECT USER REGISTRATION
    if (action === 'reject_user') {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required.' });
      }

      if (username.toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'Cannot reject primary administrator.' });
      }

      const rows = await (db as any)(
        `UPDATE "app_users"
         SET status = 'rejected', is_active = false, updated_at = NOW()
         WHERE LOWER(username) = LOWER($1)
         RETURNING id, username, full_name, role, status;`,
        [username]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['USER_REJECTED', JSON.stringify({ username, rejected_by: authUser.username })]
        );
      } catch (e) {}

      return res.status(200).json({ success: true, user: rows[0], message: `User ${username} rejected.` });
    }

    // 5. LIST PASSWORD RESET REQUESTS
    if (action === 'list_reset_requests') {
      const requests = await (db as any)(
        `SELECT id, username, full_name, notes, status, created_at, resolved_at, resolved_by
         FROM "password_reset_requests"
         ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 50;`
      );
      return res.status(200).json({ requests });
    }

    // 6. RESOLVE PASSWORD RESET REQUEST & SET NEW PASSWORD
    if (action === 'resolve_reset_request') {
      const { request_id, username, new_password, admin_name } = req.body;

      if (!username || !new_password) {
        return res.status(400).json({ error: 'Username and new password are required.' });
      }

      if (new_password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(new_password, salt);

      // Update password
      await (db as any)(
        `UPDATE "app_users"
         SET password_hash = $1, salt = $2, updated_at = NOW()
         WHERE LOWER(username) = LOWER($3);`,
        [hash, salt, username]
      );

      // Mark request as resolved
      const effectiveAdmin = admin_name || authUser.username;
      if (request_id) {
        await (db as any)(
          `UPDATE "password_reset_requests"
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
           WHERE id = $2;`,
          [effectiveAdmin, request_id]
        );
      } else {
        await (db as any)(
          `UPDATE "password_reset_requests"
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
           WHERE LOWER(username) = LOWER($2) AND status = 'pending';`,
          [effectiveAdmin, username]
        );
      }

      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['PASSWORD_RESET_RESOLVED', JSON.stringify({ username, resolved_by: effectiveAdmin })]
        );
      } catch (e) {}

      return res.status(200).json({ success: true, message: `Password for ${username} has been reset successfully.` });
    }

    // 7. DIRECT ADMIN SET PASSWORD
    if (action === 'admin_set_password') {
      const { username, new_password } = req.body;

      if (!username || !new_password) {
        return res.status(400).json({ error: 'Username and new password are required.' });
      }

      if (new_password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(new_password, salt);

      const result = await (db as any)(
        `UPDATE "app_users"
         SET password_hash = $1, salt = $2, updated_at = NOW()
         WHERE LOWER(username) = LOWER($3)
         RETURNING id;`,
        [hash, salt, username]
      );

      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      return res.status(200).json({ success: true, message: `Password for ${username} updated.` });
    }

    // 8. TOGGLE ACTIVE STATUS
    if (action === 'toggle_user_status') {
      const { username, is_active } = req.body;

      if (username.toLowerCase() === 'admin' && !is_active) {
        return res.status(400).json({ error: 'Cannot deactivate the primary administrator account.' });
      }

      await (db as any)(
        `UPDATE "app_users"
         SET is_active = $1, updated_at = NOW()
         WHERE LOWER(username) = LOWER($2);`,
        [is_active, username]
      );

      return res.status(200).json({ success: true });
    }

    // 9. TOGGLE ROLE
    if (action === 'toggle_user_role') {
      const { username, role } = req.body;

      if (username.toLowerCase() === 'admin' && role !== 'admin') {
        return res.status(400).json({ error: 'Cannot remove admin role from primary administrator.' });
      }

      await (db as any)(
        `UPDATE "app_users"
         SET role = $1, updated_at = NOW()
         WHERE LOWER(username) = LOWER($2);`,
        [role, username]
      );

      return res.status(200).json({ success: true });
    }

    // 10. DELETE USER
    if (action === 'delete_user_account') {
      const { username } = req.body;

      if (username.toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'Cannot delete the primary administrator account.' });
      }

      await (db as any)(
        'DELETE FROM "app_users" WHERE LOWER(username) = LOWER($1);',
        [username]
      );

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: err.message || 'Admin API error' });
  }
}
