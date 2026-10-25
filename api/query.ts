import { getDb } from './db';

const ALLOWED_TABLES = new Set([
  'sap_stock',
  'mother_slab_stock',
  'cut_slab_stock',
  'opname_records',
  'locations',
  'users_online',
  'system_settings',
  'opname_backups',
  'app_storage',
  'system_events'
]);

function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

export default async function handler(req: any, res: any) {
  // Handle CORS
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
    const { action, table, columns = '*', filters = [], orderBy, limit, offset, rows, values, conflictCol, select = false } = req.body;

    if (action === 'ping') {
      const result = await (db as any)('SELECT 1 as connected;');
      return res.status(200).json({ data: result });
    }

    if (!table || !ALLOWED_TABLES.has(table)) {
      return res.status(400).json({ error: `Table '${table}' is not allowed or not found` });
    }

    const safeTable = sanitizeIdentifier(table);

    // 1. SELECT
    if (action === 'select') {
      const params: any[] = [];
      let whereClause = '';

      if (Array.isArray(filters) && filters.length > 0) {
        const conditions = filters.map((f: any) => {
          const col = sanitizeIdentifier(f.column);
          params.push(f.value);
          const paramIdx = `$${params.length}`;
          if (f.op === 'neq') return `${col} != ${paramIdx}`;
          if (f.op === 'ilike') return `${col} ILIKE ${paramIdx}`;
          if (f.op === 'gt') return `${col} > ${paramIdx}`;
          if (f.op === 'gte') return `${col} >= ${paramIdx}`;
          if (f.op === 'lt') return `${col} < ${paramIdx}`;
          if (f.op === 'lte') return `${col} <= ${paramIdx}`;
          return `${col} = ${paramIdx}`;
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      // If exact count requested (head: true)
      if (req.body.count === 'exact') {
        const countQuery = `SELECT COUNT(*)::int as total FROM ${safeTable} ${whereClause};`;
        const countResult = await (db as any)(countQuery, params);
        const count = countResult[0]?.total || 0;

        if (req.body.head) {
          return res.status(200).json({ count, data: null });
        }
      }

      let orderClause = '';
      if (orderBy && orderBy.column) {
        const col = sanitizeIdentifier(orderBy.column);
        const direction = orderBy.ascending === false ? 'DESC' : 'ASC';
        orderClause = `ORDER BY ${col} ${direction}`;
      }

      let limitClause = '';
      if (typeof limit === 'number' && limit > 0) {
        params.push(limit);
        limitClause = `LIMIT $${params.length}`;
      }

      let offsetClause = '';
      if (typeof offset === 'number' && offset >= 0) {
        params.push(offset);
        offsetClause = `OFFSET $${params.length}`;
      }

      const safeColumns = columns === '*' ? '*' : columns.split(',').map((c: string) => sanitizeIdentifier(c.trim())).join(', ');
      const query = `SELECT ${safeColumns} FROM ${safeTable} ${whereClause} ${orderClause} ${limitClause} ${offsetClause};`;
      const data = await (db as any)(query, params);

      if (req.body.single) {
        return res.status(200).json({ data: data.length > 0 ? data[0] : null });
      }

      return res.status(200).json({ data });
    }

    // 2. INSERT
    if (action === 'insert') {
      const items = Array.isArray(rows) ? rows : [rows];
      if (items.length === 0) {
        return res.status(200).json({ data: [] });
      }

      const keys = Object.keys(items[0]);
      const safeCols = keys.map(k => sanitizeIdentifier(k)).join(', ');

      const params: any[] = [];
      const rowClauses = items.map(item => {
        const valuePlaceholders = keys.map(k => {
          params.push(item[k] !== undefined ? item[k] : null);
          return `$${params.length}`;
        });
        return `(${valuePlaceholders.join(', ')})`;
      });

      const returningClause = select ? 'RETURNING *' : '';
      const query = `INSERT INTO ${safeTable} (${safeCols}) VALUES ${rowClauses.join(', ')} ${returningClause};`;
      const result = await (db as any)(query, params);

      // Log event for realtime sync
      try {
        if (table === 'opname_records' || table === 'locations') {
          const eventType = table === 'opname_records' ? 'OPNAME_INSERT' : 'LOCATION_INSERT';
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            [eventType, JSON.stringify(items[0])]
          );
        }
      } catch (e) {
        console.error('Failed to log event:', e);
      }

      return res.status(200).json({ data: result || [] });
    }

    // 3. UPSERT
    if (action === 'upsert') {
      const items = Array.isArray(rows) ? rows : [rows];
      if (items.length === 0) return res.status(200).json({ data: [] });

      const keys = Object.keys(items[0]);
      const safeCols = keys.map(k => sanitizeIdentifier(k)).join(', ');
      const conflictKey = conflictCol || (table === 'users_online' ? 'name' : 'id');
      const safeConflict = sanitizeIdentifier(conflictKey);

      const updateAssignments = keys
        .filter(k => k !== conflictKey)
        .map(k => `${sanitizeIdentifier(k)} = EXCLUDED.${sanitizeIdentifier(k)}`)
        .join(', ');

      const params: any[] = [];
      const rowClauses = items.map(item => {
        const placeholders = keys.map(k => {
          params.push(item[k] !== undefined ? item[k] : null);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      const conflictAction = updateAssignments.length > 0 
        ? `DO UPDATE SET ${updateAssignments}`
        : `DO NOTHING`;

      const returningClause = select ? 'RETURNING *' : '';
      const query = `INSERT INTO ${safeTable} (${safeCols}) VALUES ${rowClauses.join(', ')} ON CONFLICT (${safeConflict}) ${conflictAction} ${returningClause};`;
      const result = await (db as any)(query, params);

      return res.status(200).json({ data: result || [] });
    }

    // 4. UPDATE
    if (action === 'update') {
      if (!values || Object.keys(values).length === 0) {
        return res.status(400).json({ error: 'No values provided for update' });
      }

      const params: any[] = [];
      const setClauses = Object.keys(values).map(k => {
        params.push(values[k]);
        return `${sanitizeIdentifier(k)} = $${params.length}`;
      });

      let whereClause = '';
      if (Array.isArray(filters) && filters.length > 0) {
        const conditions = filters.map((f: any) => {
          const col = sanitizeIdentifier(f.column);
          params.push(f.value);
          return `${col} = $${params.length}`;
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const returningClause = select ? 'RETURNING *' : '';
      const query = `UPDATE ${safeTable} SET ${setClauses.join(', ')} ${whereClause} ${returningClause};`;
      const result = await (db as any)(query, params);

      // Log event
      try {
        if (table === 'system_settings' || table === 'opname_records') {
          const eventType = table === 'system_settings' ? 'SETTINGS_UPDATE' : 'OPNAME_UPDATE';
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            [eventType, JSON.stringify(values)]
          );
        }
      } catch (e) {
        console.error('Failed to log event:', e);
      }

      return res.status(200).json({ data: result || [] });
    }

    // 5. DELETE
    if (action === 'delete') {
      const params: any[] = [];
      let whereClause = '';

      if (Array.isArray(filters) && filters.length > 0) {
        const conditions = filters.map((f: any) => {
          const col = sanitizeIdentifier(f.column);
          params.push(f.value);
          const paramIdx = `$${params.length}`;
          if (f.op === 'neq') return `${col} != ${paramIdx}`;
          return `${col} = ${paramIdx}`;
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const query = `DELETE FROM ${safeTable} ${whereClause};`;
      await (db as any)(query, params);

      // Log event
      try {
        if (table === 'opname_records' || table === 'locations' || table === 'users_online') {
          const eventType = `${table.toUpperCase()}_DELETE`;
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            [eventType, JSON.stringify({ filters })]
          );
        }
      } catch (e) {
        console.error('Failed to log event:', e);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Query error:', err);
    return res.status(500).json({ error: err.message || 'Internal database error' });
  }
}
