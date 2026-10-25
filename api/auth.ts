import crypto from 'crypto';
import { getDb } from './db.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'grp-slab-opname-production-secret-2026-secure-key';

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function createToken(payload: { id: string; username: string; full_name: string; role: string }): string {
  const data = {
    ...payload,
    exp: Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days expiration
  };
  const jsonStr = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(jsonStr).digest('base64url');
  return `${jsonStr}.${signature}`;
}

export function verifyToken(token?: string): { id: string; username: string; full_name: string; role: string } | null {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const parts = clean.split('.');
  if (parts.length !== 2) return null;
  const [jsonStr, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(jsonStr).digest('base64url');

  const bufA = Buffer.from(signature);
  const bufB = Buffer.from(expectedSignature);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
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
    const db = getDb();
    const { action } = req.body;

    // 1. REGISTER (REQUIRES ADMIN APPROVAL)
    if (action === 'register') {
      const { username, full_name, password } = req.body;

      if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Username, Full Name, and Password are required.' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanName = full_name.trim().toUpperCase();

      if (cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
      }

      if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and dots.' });
      }

      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }

      const existing = await (db as any)(
        'SELECT id FROM "app_users" WHERE LOWER(username) = $1 LIMIT 1;',
        [cleanUsername]
      );

      if (existing && existing.length > 0) {
        return res.status(400).json({ error: 'This username is already taken. Please choose another.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);

      // New users start as pending_approval and is_active: false
      const rows = await (db as any)(
        `INSERT INTO "app_users" (username, full_name, password_hash, salt, role, is_active, status)
         VALUES ($1, $2, $3, $4, 'user', false, 'pending_approval')
         RETURNING id, username, full_name, role, status;`,
        [cleanUsername, cleanName, hash, salt]
      );

      const user = rows[0];

      // Broadcast registration event to alert admin
      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['USER_REGISTERED', JSON.stringify({ username: user.username, full_name: user.full_name })]
        );
      } catch (e) {}

      return res.status(200).json({
        success: true,
        pendingApproval: true,
        message: 'Account created successfully! Your account is pending Administrator approval before you can log in.',
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          status: user.status
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
        `SELECT id, username, full_name, password_hash, salt, role, is_active, status
         FROM "app_users"
         WHERE LOWER(username) = $1 LIMIT 1;`,
        [cleanUsername]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const user = rows[0];

      if (user.status === 'pending_approval') {
        return res.status(403).json({
          error: 'Your account is pending Administrator approval. Please notify your supervisor or administrator.'
        });
      }

      if (user.status === 'rejected' || !user.is_active) {
        return res.status(403).json({
          error: 'This account has been deactivated or rejected. Please contact the Administrator.'
        });
      }

      const expectedHash = hashPassword(password, user.salt);
      const hashBufferA = Buffer.from(expectedHash, 'hex');
      const hashBufferB = Buffer.from(user.password_hash, 'hex');

      if (hashBufferA.length !== hashBufferB.length || !crypto.timingSafeEqual(hashBufferA, hashBufferB)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Generate signed session token
      const token = createToken({
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      });

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      });
    }

    // 3. ME (SESSION VALIDATION)
    if (action === 'me') {
      const authHeader = req.headers.authorization;
      const verified = verifyToken(authHeader);

      if (!verified) {
        return res.status(401).json({ error: 'Session expired or invalid.' });
      }

      // Fetch fresh state from database
      const rows = await (db as any)(
        `SELECT id, username, full_name, role, is_active, status FROM "app_users" WHERE id = $1 LIMIT 1;`,
        [verified.id]
      );

      if (!rows || rows.length === 0 || !rows[0].is_active || rows[0].status !== 'approved') {
        return res.status(401).json({ error: 'Account is no longer active.' });
      }

      const u = rows[0];
      return res.status(200).json({
        user: {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          role: u.role
        }
      });
    }

    // 4. FORGOT PASSWORD REQUEST
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

      try {
        await (db as any)(
          `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
          ['PASSWORD_RESET_REQUESTED', JSON.stringify({ username: user.username, full_name: user.full_name })]
        );
      } catch (e) {}

      return res.status(200).json({
        success: true,
        message: 'Password reset request submitted successfully. The Administrator has been notified.'
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: err.message || 'Authentication error' });
  }
}
