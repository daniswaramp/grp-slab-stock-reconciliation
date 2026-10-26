import { getDb } from './db.js';
import { verifyToken } from './auth.js';

const ALLOWED_TABLES = new Set([
  'sap_stock',
  'mother_slab_stock',
  'cut_slab_stock',
  'supplier_slab_import',
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

    // Public Ping / Health check
    if (action === 'ping') {
      const result = await (db as any)('SELECT 1 as connected;');
      return res.status(200).json({ data: result });
    }

    // Server-side Authentication
    const authUser = verifyToken(req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    // SMART SEARCH & DECODER: One-trip lookup across stock + supplier data
    if (action === 'search_slabs_with_supplier') {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(200).json({ sap: [], mother: [], cut: [], opname: [], supplierMap: {}, decodedDirectMatch: null });
      }

      const cleanCode = code.trim().toUpperCase();
      const parts = cleanCode.split(/[\s\-_/.]+/);
      const isMultiPart = parts.length >= 2 && parts[0].length >= 3 && parts[1].length >= 1;

      let supplierMatches: any[] = [];
      let decodedDirectMatch: any = null;

      if (isMultiPart) {
        const heat = parts[0];
        const slab = parts[1];
        const concat = heat + slab;
        supplierMatches = await (db as any)(
          `SELECT batch_id, heat_no, no_slab, heat_slab_concat, supplier_name, grade, thickness, width, length, weight_ton
           FROM "supplier_slab_import"
           WHERE (LOWER(heat_no) = LOWER($1) AND (no_slab = $2 OR no_slab = $3 OR no_slab = $4))
              OR LOWER(heat_slab_concat) = LOWER($5)
           LIMIT 10;`,
          [heat, slab, '0' + slab, slab + '0', concat]
        );
        if (supplierMatches.length > 0) {
          decodedDirectMatch = supplierMatches[0];
        }
      } else {
        supplierMatches = await (db as any)(
          `SELECT batch_id, heat_no, no_slab, heat_slab_concat, supplier_name, grade, thickness, width, length, weight_ton
           FROM "supplier_slab_import"
           WHERE LOWER(heat_no) = LOWER($1)
              OR LOWER(heat_slab_concat) = LOWER($1)
              OR batch_id ILIKE $2
           ORDER BY batch_id ASC
           LIMIT 20;`,
          [cleanCode, `%${cleanCode}%`]
        );
        if (supplierMatches.length === 1) {
          decodedDirectMatch = supplierMatches[0];
        }
      }

      // Collect target batch IDs to query stock tables
      const batchIdsToQuery = new Set<string>();
      batchIdsToQuery.add(cleanCode);
      supplierMatches.forEach(s => {
        if (s.batch_id) batchIdsToQuery.add(s.batch_id.toUpperCase());
      });

      const batchList = Array.from(batchIdsToQuery);

      // Query stock & opname tables for these batch IDs or pattern
      const [sapRes, motherRes, cutRes, opnameRes] = await Promise.all([
        (db as any)(
          `SELECT * FROM "sap_stock" WHERE batch_id = ANY($1) OR batch_id ILIKE $2 LIMIT 25;`,
          [batchList, `%${cleanCode}%`]
        ),
        (db as any)(
          `SELECT * FROM "mother_slab_stock" WHERE batch_id = ANY($1) OR batch_id ILIKE $2 LIMIT 25;`,
          [batchList, `%${cleanCode}%`]
        ),
        (db as any)(
          `SELECT * FROM "cut_slab_stock" WHERE batch_id = ANY($1) OR batch_id ILIKE $2 LIMIT 25;`,
          [batchList, `%${cleanCode}%`]
        ),
        (db as any)(
          `SELECT * FROM "opname_records" WHERE batch_id = ANY($1) OR batch_id ILIKE $2 LIMIT 20;`,
          [batchList, `%${cleanCode}%`]
        )
      ]);

      // If supplier matches found, also fetch supplier metadata for all returned stock items
      const returnedBatchIds = Array.from(new Set([
        ...sapRes.map((r: any) => r.batch_id),
        ...motherRes.map((r: any) => r.batch_id),
        ...cutRes.map((r: any) => r.batch_id),
        ...opnameRes.map((r: any) => r.batch_id),
        ...batchList
      ]));

      const extraSupplier = await (db as any)(
        `SELECT batch_id, heat_no, no_slab, heat_slab_concat, supplier_name, grade, thickness, width, length, weight_ton
         FROM "supplier_slab_import"
         WHERE batch_id = ANY($1);`,
        [returnedBatchIds]
      );

      const supplierMap: Record<string, any> = {};
      [...supplierMatches, ...extraSupplier].forEach(s => {
        if (s.batch_id) {
          supplierMap[s.batch_id.toUpperCase()] = s;
        }
      });

      return res.status(200).json({
        sap: sapRes || [],
        mother: motherRes || [],
        cut: cutRes || [],
        opname: opnameRes || [],
        supplierMap,
        decodedDirectMatch
      });
    }

    if (!table || !ALLOWED_TABLES.has(table)) {
      return res.status(400).json({ error: `Table '${table}' is not allowed or not found` });
    }

    const safeTable = sanitizeIdentifier(table);

    // Lock Mode Enforcement for Mutation Actions
    if (['insert', 'update', 'upsert', 'delete', 'replace_table_rows'].includes(action)) {
      const settings = await (db as any)('SELECT lock_mode FROM "system_settings" WHERE id = 1 LIMIT 1;');
      if (settings && settings[0]?.lock_mode && authUser.role !== 'admin') {
        return res.status(423).json({ error: 'System is locked by Administrator. Data modifications are temporarily disabled.' });
      }
    }

    // 1. SELECT
    if (action === 'select') {
      // Opportunistic cleanup of dead sessions older than 15 minutes
      if (table === 'users_online') {
        try {
          await (db as any)("DELETE FROM \"users_online\" WHERE last_seen < NOW() - INTERVAL '15 minutes';");
        } catch (e) {}
      }

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
            [eventType, JSON.stringify(result?.[0] || items[0])]
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

      // Log event for realtime sync
      try {
        if (table === 'users_online') {
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            ['USERS_ONLINE_UPDATE', JSON.stringify(items[0])]
          );
        }
      } catch (e) {
        console.error('Failed to log event on upsert:', e);
      }

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
        if (table === 'system_settings' || table === 'opname_records' || table === 'users_online') {
          const eventType = table === 'system_settings'
            ? 'SETTINGS_UPDATE'
            : (table === 'users_online' ? 'USERS_ONLINE_UPDATE' : 'OPNAME_UPDATE');
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            [eventType, JSON.stringify(result?.[0] || values)]
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

      // Log event with exact payload for cache eviction
      try {
        if (table === 'opname_records' || table === 'locations' || table === 'users_online') {
          const eventType = `${table.toUpperCase()}_DELETE`;
          const idFilter = filters.find((f: any) => f.column === 'id');
          const nameFilter = filters.find((f: any) => f.column === 'name');
          await (db as any)(
            `INSERT INTO "system_events" (event_type, payload) VALUES ($1, $2);`,
            [eventType, JSON.stringify({ id: idFilter?.value, name: nameFilter?.value, filters })]
          );
        }
      } catch (e) {
        console.error('Failed to log event:', e);
      }

      return res.status(200).json({ success: true });
    }

    // 6. REPLACE TABLE ROWS (Safe Batch Atomic Stock CSV Replacement)
    if (action === 'replace_table_rows') {
      if (!['sap_stock', 'mother_slab_stock', 'cut_slab_stock', 'opname_records'].includes(table)) {
        return res.status(400).json({ error: `Replacement not allowed for table '${table}'` });
      }

      const items = Array.isArray(rows) ? rows : [];

      // Clear existing records
      await (db as any)(`DELETE FROM ${safeTable};`);

      if (items.length > 0) {
        const keys = Object.keys(items[0]);
        const safeCols = keys.map(k => sanitizeIdentifier(k)).join(', ');
        const CHUNK_SIZE = 500;

        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          const params: any[] = [];
          const rowClauses = chunk.map(item => {
            const placeholders = keys.map(k => {
              params.push(item[k] !== undefined ? item[k] : null);
              return `$${params.length}`;
            });
            return `(${placeholders.join(', ')})`;
          });

          await (db as any)(
            `INSERT INTO ${safeTable} (${safeCols}) VALUES ${rowClauses.join(', ')};`,
            params
          );
        }
      }

      return res.status(200).json({ success: true, count: items.length });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error('Query error:', err);
    return res.status(500).json({ error: err.message || 'Internal database error' });
  }
}
