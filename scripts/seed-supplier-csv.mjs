import fs from 'fs';
import readline from 'readline';
import { neon } from '../node_modules/@neondatabase/serverless/index.mjs';

const sql = neon(process.env.DATABASE_URL);

function parseNumericSafe(val) {
  if (val === null || val === undefined) return 0;
  let clean = String(val).replace(/['"]/g, '').trim();
  if (!clean || clean === '-' || clean === 'N/A' || clean === 'null') return 0;

  if (/^-?\d+,\d+$/.test(clean)) {
    clean = clean.replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(clean)) {
    clean = clean.replace(/,/g, '');
  } else if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',') && !clean.includes('.')) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function esc(val) {
  if (val === null || val === undefined) return "''";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// Parses single CSV line respecting quotes
function parseLine(text) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  result.push(cur.trim());
  return result;
}

async function queryWithRetry(fn, retries = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`\n[Network Warn] Attempt ${attempt} failed (${err.message}). Retrying in ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastErr;
}

async function run() {
  console.log('--- Step 1: Pre-flight check on existing opname records ---');
  const preCheck = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM opname_records;`);
  console.log(`Current opname_records count: ${preCheck[0].count}`);

  const csvPath = 'database/Supplier Data Slab Import 2024-2026 - MERGED with CE PCM.csv';
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  console.log(`--- Step 2: Reading CSV from ${csvPath} ---`);
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity
  });

  const records = [];
  let lineIdx = 0;

  for await (const line of rl) {
    lineIdx++;
    if (lineIdx === 1) continue; // Skip header
    if (!line.trim()) continue;

    const cols = parseLine(line);
    const batchId = (cols[4] || cols[16] || '').trim().toUpperCase();
    const heatNo = (cols[5] || '').trim();
    const noSlab = (cols[6] || '').trim();

    if (!batchId) continue;

    // Heat + Slab concatenated (e.g. 13392 + 4 = 133924)
    const rawConcat = (cols[17] || '').trim();
    const heatSlabConcat = rawConcat || (heatNo && noSlab ? `${heatNo}${noSlab}` : '');

    records.push({
      batch_id: batchId,
      heat_no: heatNo,
      no_slab: noSlab,
      heat_slab_concat: heatSlabConcat,
      supplier_name: (cols[1] || '').trim(),
      thickness: parseNumericSafe(cols[7]),
      width: parseNumericSafe(cols[8]),
      length: parseNumericSafe(cols[9]),
      weight_ton: parseNumericSafe(cols[10]),
      weight_mtc: parseNumericSafe(cols[11]),
      weight_actual: parseNumericSafe(cols[12]),
      grade: (cols[13] || '').trim(),
      steel_grade: (cols[14] || '').trim(),
      application: (cols[15] || '').trim(),
      po_number: (cols[18] || '').trim(),
      item_po: (cols[19] || '').trim(),
      ce: parseNumericSafe(cols[34]),
      pcm: parseNumericSafe(cols[35]),
      source_sheet: (cols[37] || '').trim()
    });
  }

  console.log(`Total parsed records to import: ${records.length}`);

  // Clear existing supplier_slab_import table (if any partial previous import)
  await queryWithRetry(() => sql`TRUNCATE TABLE supplier_slab_import;`);
  console.log('Truncated supplier_slab_import table for clean ingestion.');

  console.log('--- Step 3: Batch inserting records into Neon PostgreSQL ---');
  const CHUNK_SIZE = 250;
  let inserted = 0;
  const startTime = Date.now();

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const valuesSql = chunk.map(r => `(${esc(r.batch_id)}, ${esc(r.heat_no)}, ${esc(r.no_slab)}, ${esc(r.heat_slab_concat)}, ${esc(r.supplier_name)}, ${r.thickness}, ${r.width}, ${r.length}, ${r.weight_ton}, ${r.weight_mtc}, ${r.weight_actual}, ${esc(r.grade)}, ${esc(r.steel_grade)}, ${esc(r.application)}, ${esc(r.po_number)}, ${esc(r.item_po)}, ${r.ce}, ${r.pcm}, ${esc(r.source_sheet)})`).join(',\n');

    const rawQuery = `
      INSERT INTO supplier_slab_import (
        batch_id, heat_no, no_slab, heat_slab_concat, supplier_name,
        thickness, width, length, weight_ton, weight_mtc, weight_actual,
        grade, steel_grade, application, po_number, item_po, ce, pcm, source_sheet
      ) VALUES ${valuesSql};
    `;

    await queryWithRetry(() => sql(rawQuery));
    inserted += chunk.length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const pct = Math.round((inserted / records.length) * 100);
    process.stdout.write(`\rImported ${inserted} / ${records.length} records (${pct}%) in ${elapsed}s...`);
  }

  console.log('\n--- Step 4: Verification & Integrity checks ---');
  const countRes = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM supplier_slab_import;`);
  console.log(`Total rows in supplier_slab_import: ${countRes[0].count}`);

  const postCheck = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM opname_records;`);
  console.log(`Verified opname_records count: ${postCheck[0].count} (Unchanged: ${preCheck[0].count === postCheck[0].count})`);

  // Test query for TC13392D / 13392
  const sampleMatch = await queryWithRetry(() => sql`
    SELECT batch_id, heat_no, no_slab, heat_slab_concat, supplier_name, grade, thickness, width, length, weight_ton
    FROM supplier_slab_import
    WHERE heat_no = '13392' AND no_slab = '4';
  `);
  console.log('Sample test query result (Heat 13392, Slab 4):', sampleMatch);
  console.log('Seeding completed successfully!');
}

run().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
