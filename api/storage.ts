import { getDb } from './db.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getDb();

    // 1. GET FILE
    if (req.method === 'GET') {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: 'Missing path query parameter' });
      }

      const rows = await (db as any)(
        'SELECT path, mime_type, data FROM "app_storage" WHERE path = $1 LIMIT 1;',
        [filePath]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }

      const file = rows[0];
      const mime = file.mime_type || 'application/octet-stream';

      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (file.data.startsWith('data:') && file.data.includes(';base64,')) {
        const base64Data = file.data.split(';base64,')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        return res.send(buffer);
      } else if (mime.startsWith('image/')) {
        const buffer = Buffer.from(file.data, 'base64');
        return res.send(buffer);
      } else {
        return res.send(file.data);
      }
    }

    // 2. UPLOAD FILE
    if (req.method === 'POST') {
      const { path: filePath, mime_type = 'text/plain', data } = req.body;
      if (!filePath || data === undefined) {
        return res.status(400).json({ error: 'Missing path or data in request body' });
      }

      await (db as any)(
        `INSERT INTO "app_storage" (path, mime_type, data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (path)
         DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, updated_at = NOW();`,
        [filePath, mime_type, data]
      );

      const publicUrl = `/api/storage?path=${encodeURIComponent(filePath)}`;
      return res.status(200).json({ publicUrl, path: filePath });
    }

    // 3. DELETE FILE
    if (req.method === 'DELETE') {
      const { paths } = req.body;
      if (!Array.isArray(paths) || paths.length === 0) {
        return res.status(400).json({ error: 'Missing paths array' });
      }

      await (db as any)(
        'DELETE FROM "app_storage" WHERE path = ANY($1::text[]);',
        [paths]
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Storage error:', err);
    return res.status(500).json({ error: err.message || 'Storage error' });
  }
}
