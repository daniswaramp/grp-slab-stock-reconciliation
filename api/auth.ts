import crypto from 'crypto';
import { getDb } from './db';

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getDb();
    const { action } = req.body;

    // 1. REGISTER
    if (action === 'register') {
      const { username, full_name, password } = req.body;

      if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Username, Full Name, and Password are required.' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanName = full_name.trim();

      if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
      }

      if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and dots.' });
      }

      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }

      // Check existing username
      const existing = await (db as any)(
        'SELECT id FROM "app_users" WHERE LOWER(username) = $1 LIMIT 1;',
        [cleanUsername]
      );

      if (existing && existing.length > 0) {
        return res.status(400).json({ error: 'This username is already taken. Please choose another.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);

      const rows = await (db as any)(
        `INSERT INTO "app_users" (username, full_name, password_hash, salt, role, is_active)
         VALUES ($1, $2, $3, $4, 'user', true)
         RETURNING id, username, full_name, role;`,
        [cleanUsername, cleanName, hash, salt]
      );

      const user = rows[0];

      // Broadcast event
      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['USER_REGISTERED', JSON.stringify({ username: user.username, full_name: user.full_name })]
        );
      } catch (e) {}

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      });
    }

    // 2. LOGIN
    if (action === 'login') {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and Password are required.' });
      }

      const cleanUsername = username.trim().toLowerCase();

      const rows = await (db as any)(
        `SELECT id, username, full_name, password_hash, salt, role, is_active
         FROM "app_users"
         WHERE LOWER(username) = $1 LIMIT 1;`,
        [cleanUsername]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const user = rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'This account has been deactivated. Please contact Administrator.' });
      }

      const expectedHash = hashPassword(password, user.salt);

      const hashBufferA = Buffer.from(expectedHash, 'hex');
      const hashBufferB = Buffer.from(user.password_hash, 'hex');

      if (hashBufferA.length !== hashBufferB.length || !crypto.timingSafeEqual(hashBufferA, hashBufferB)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      });
    }

    // 3. FORGOT PASSWORD REQUEST
    if (action === 'forgot_password') {
      const { username, notes } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Please enter your username.' });
      }

      const cleanUsername = username.trim().toLowerCase();

      const rows = await (db as any)(
        'SELECT id, username, full_name FROM "app_users" WHERE LOWER(username) = $1 LIMIT 1;',
        [cleanUsername]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Username not found in system.' });
      }

      const user = rows[0];

      // Check if already has a pending request
      const pending = await (db as any)(
        "SELECT id FROM \"password_reset_requests\" WHERE LOWER(username) = $1 AND status = 'pending' LIMIT 1;",
        [cleanUsername]
      );

      if (pending && pending.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'A password reset request is already pending for this user. The Administrator has been notified.'
        });
      }

      await (db as any)(
        `INSERT INTO "password_reset_requests" (username, full_name, notes, status)
         VALUES ($1, $2, $3, 'pending');`,
        [user.username, user.full_name, notes || 'User forgot password']
      );

      // Notify admin in system_events
      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['PASSWORD_RESET_REQUESTED', JSON.stringify({ username: user.username, full_name: user.full_name })]
        );
      } catch (e) {}

      return res.status(200).json({
        success: true,
        message: 'Password reset request submitted successfully. Please inform the Administrator to set your new password.'
      });
    }

    // 4. USER SELF-CHANGE PASSWORD
    if (action === 'change_password_self') {
      const { username, current_password, new_password } = req.body;

      if (!username || !current_password || !new_password) {
        return res.status(400).json({ error: 'All fields are required.' });
      }

      if (new_password.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters.' });
      }

      const cleanUsername = username.trim().toLowerCase();

      const rows = await (db as any)(
        'SELECT id, password_hash, salt FROM "app_users" WHERE LOWER(username) = $1 LIMIT 1;',
        [cleanUsername]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const user = rows[0];
      const currentHash = hashPassword(current_password, user.salt);

      const bufA = Buffer.from(currentHash, 'hex');
      const bufB = Buffer.from(user.password_hash, 'hex');

      if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
        return res.status(401).json({ error: 'Current password incorrect.' });
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = hashPassword(new_password, newSalt);

      await (db as any)(
        'UPDATE "app_users" SET password_hash = $1, salt = $2, updated_at = NOW() WHERE id = $3;',
        [newHash, newSalt, user.id]
      );

      return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: err.message || 'Authentication error' });
  }
}
