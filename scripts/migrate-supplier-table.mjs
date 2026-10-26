import { neon } from '../node_modules/@neondatabase/serverless/index.mjs';

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('--- Step 1: Pre-flight check on existing opname records ---');
  const preCheck = await sql`SELECT count(*)::int as count FROM opname_records;`;
  console.log(`Current opname_records count: ${preCheck[0].count}`);

  console.log('--- Step 2: Creating supplier_slab_import table ---');
  await sql`
    CREATE TABLE IF NOT EXISTS public.supplier_slab_import (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
      batch_id TEXT NOT NULL,
      heat_no TEXT NOT NULL,
      no_slab TEXT NOT NULL,
      heat_slab_concat TEXT,
      supplier_name TEXT,
      thickness NUMERIC,
      width NUMERIC,
      length NUMERIC,
      weight_ton NUMERIC,
      weight_mtc NUMERIC,
      weight_actual NUMERIC,
      grade TEXT,
      steel_grade TEXT,
      application TEXT,
      po_number TEXT,
      item_po TEXT,
      ce NUMERIC,
      pcm NUMERIC,
      source_sheet TEXT
    );
  `;

  console.log('--- Step 3: Creating indexes for high-speed lookups ---');
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_batch_id ON public.supplier_slab_import (LOWER(batch_id));`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_heat_no ON public.supplier_slab_import (LOWER(heat_no));`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_no_slab ON public.supplier_slab_import (LOWER(no_slab));`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_heat_slab_concat ON public.supplier_slab_import (LOWER(heat_slab_concat));`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supplier_heat_slab_pair ON public.supplier_slab_import (LOWER(heat_no), LOWER(no_slab));`;

  console.log('--- Step 4: Post-migration validation ---');
  const postCheck = await sql`SELECT count(*)::int as count FROM opname_records;`;
  console.log(`Verified opname_records count: ${postCheck[0].count} (Unchanged: ${preCheck[0].count === postCheck[0].count})`);

  const supplierCheck = await sql`SELECT count(*)::int as count FROM supplier_slab_import;`;
  console.log(`supplier_slab_import table created. Current rows: ${supplierCheck[0].count}`);
  console.log('Migration successful!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
