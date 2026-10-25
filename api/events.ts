import { getDb } from './db.js';
import { verifyToken } from './auth.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getDb();

    // 1. GET RECENT EVENTS SINCE ID OR GET LATEST ID (to prevent historic replay)
    if (req.method === 'GET') {
      if (req.query.latest === 'true' || req.query.since_id === 'latest') {
        const maxRes = await (db as any)('SELECT COALESCE(MAX(id), 0)::int as max_id FROM "system_events";');
        const maxId = maxRes[0]?.max_id || 0;
        return res.status(200).json({ events: [], latest_id: maxId });
      }

      const sinceId = parseInt(req.query.since_id as string, 10) || 0;

      const events = await (db as any)(
        'SELECT id, event_type, payload, created_at FROM "system_events" WHERE id > $1 ORDER BY id ASC LIMIT 50;',
        [sinceId]
      );

      return res.status(200).json({ events: events || [] });
    }

    // 2. BROADCAST AN EVENT
    if (req.method === 'POST') {
      const authUser = verifyToken(req.headers.authorization);
      if (!authUser) {
        return res.status(401).json({ error: 'Authentication required to broadcast events.' });
      }

      const { event_type, payload = {} } = req.body;
      if (!event_type) {
        return res.status(400).json({ error: 'Missing event_type' });
      }

      const result = await (db as any)(
        'INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2) RETURNING id;',
        [event_type, JSON.stringify(payload)]
      );

      // Opportunistic cleanup of events older than 24 hours
      try {
        await (db as any)(
          "DELETE FROM \"system_events\" WHERE created_at < NOW() - INTERVAL '24 hours';"
        );
      } catch (cleanupErr) {
        // Non-blocking
      }

      return res.status(200).json({ success: true, id: result[0]?.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Events error:', err);
    return res.status(500).json({ error: err.message || 'Events error' });
  }
}
