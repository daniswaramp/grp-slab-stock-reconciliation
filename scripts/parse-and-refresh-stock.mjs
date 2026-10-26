import fs from 'fs';
import { neon } from '../node_modules/@neondatabase/serverless/index.mjs';

const sql = neon(process.env.DATABASE_URL);

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

// RFC-4180 quote-aware CSV parser and numeric safe parser
function parseNumericSafe(val) {
  if (val === null || val === undefined) return 0;
  let clean = String(val).replace(/['"]/g, '').trim();
  if (!clean || clean === '-' || clean === 'N/A' || clean === 'null') return 0;

  // 1. Handle European thousand dot and comma decimal: e.g. "1.250,50" or "1,250.50"
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } 
  // 2. Handle integer with thousand separators: e.g. "9,800" or "12,000"
  else if (/^-?\d{1,3}(,\d{3})+$/.test(clean)) {
    clean = clean.replace(/,/g, '');
  } 
  // 3. Handle pure comma decimal: e.g. "24,3" or "0,52"
  else if (/^-?\d+,\d+$/.test(clean)) {
    clean = clean.replace(',', '.');
  } 
  // 4. Fallback: single comma without dots
  else if (clean.includes(',') && !clean.includes('.')) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseCsvRows(text, forcedDelimiter) {
  if (!text) return [];
  let cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  let delimiter = forcedDelimiter;
  if (!delimiter) {
    const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || '';
    const delimiters = [',', ';', '\t', '|'];
    let maxCols = 0;
    delimiter = ',';
    delimiters.forEach(d => {
      const count = firstLine.split(d).length;
      if (count > maxCols) {
        maxCols = count;
        delimiter = d;
      }
    });
  }

  const rows = [];
  let currentRow = [];
  let currentToken = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentToken += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentToken += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentToken.trim());
        currentToken = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentToken.trim());
        rows.push(currentRow);
        currentRow = [];
        currentToken = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentToken.trim());
        rows.push(currentRow);
        currentRow = [];
        currentToken = '';
        i++;
        continue;
      } else {
        currentToken += char;
        i++;
        continue;
      }
    }
  }

  if (currentToken.length > 0 || currentRow.length > 0) {
    currentRow.push(currentToken.trim());
    rows.push(currentRow);
  }

  return rows.filter(r => r.length > 0 && r.some(c => c.trim().length > 0));
}

function parseFileRecords(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const allRows = parseCsvRows(text);
  if (allRows.length <= 1) return [];
  const dataRows = allRows.slice(1);
  return dataRows.map(columns => {
    const batch_id = (columns[0] || '').trim().toUpperCase();
    if (!batch_id) return null;
    return {
      batch_id,
      grade: (columns[1] || '').trim() || 'N/A',
      thickness: parseNumericSafe(columns[2]),
      width: parseNumericSafe(columns[3]),
      length: parseNumericSafe(columns[4]),
      slab_weight: parseNumericSafe(columns[5])
    };
  }).filter(r => r !== null);
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function seedTable(tableName, records) {
  console.log(`\n--- Refreshing table: ${tableName} (${records.length} records) ---`);
  // Clear existing stock rows safely
  await queryWithRetry(() => sql(`TRUNCATE TABLE ${tableName};`));
  console.log(`Truncated previous rows in ${tableName}`);

  const BATCH_SIZE = 250;
  let inserted = 0;
  const startTime = Date.now();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const valueTuples = chunk.map(r => 
      `(${esc(r.batch_id)}, ${esc(r.grade)}, ${esc(r.thickness)}, ${esc(r.width)}, ${esc(r.length)}, ${esc(r.slab_weight)})`
    ).join(',\n');

    const query = `
      INSERT INTO ${tableName} (batch_id, grade, thickness, width, length, slab_weight)
      VALUES ${valueTuples};
    `;
    await queryWithRetry(() => sql(query));
    inserted += chunk.length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const pct = Math.round((inserted / records.length) * 100);
    process.stdout.write(`\rImported ${tableName}: ${inserted} / ${records.length} (${pct}%) in ${elapsed}s...`);
  }
  console.log(`\nCompleted ${tableName}: ${inserted} rows.`);
}

async function main() {
  console.log('====================================================');
  console.log('SAFETY AUDIT: Checking Live Opname Records Before Operation');
  console.log('====================================================');
  const [initialOpname] = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM opname_records;`);
  console.log(`INITIAL OPNAME RECORDS COUNT: ${initialOpname.count}`);
  if (initialOpname.count !== 691) {
    throw new Error(`ABORT: Expected 691 opname records, but found ${initialOpname.count}. Halting.`);
  }

  // 1. Parse SAP.csv
  console.log('\nParsing SAP.csv...');
  const sapRecords = parseFileRecords('database/SAP.csv');
  console.log(`Parsed SAP.csv: ${sapRecords.length} records.`);
  const sampleSap = sapRecords.find(r => r.batch_id === '19L2533A');
  console.log('Sample parsed 19L2533A from SAP.csv:', sampleSap);
  if (!sampleSap || sampleSap.length !== 9800 || sampleSap.slab_weight !== 15.38) {
    throw new Error(`Parsed sample 19L2533A incorrect! Expected length=9800, weight=15.38, got: ${JSON.stringify(sampleSap)}`);
  }
  console.log('SUCCESS: 19L2533A parsed length=9800, slab_weight=15.38!');

  // 2. Parse Mother-Slab.csv
  console.log('\nParsing Mother-Slab.csv...');
  const motherRecords = parseFileRecords('database/Mother-Slab.csv');
  console.log(`Parsed Mother-Slab.csv: ${motherRecords.length} records.`);
  console.log('Sample parsed mother slab (first):', motherRecords[0]);

  // 3. Parse Cut-Slab.csv
  console.log('\nParsing Cut-Slab.csv...');
  const cutRecords = parseFileRecords('database/Cut-Slab.csv');
  console.log(`Parsed Cut-Slab.csv: ${cutRecords.length} records.`);
  console.log('Sample parsed cut slab (first):', cutRecords[0]);

  // 4. Update Tables in Neon
  await seedTable('sap_stock', sapRecords);
  await seedTable('mother_slab_stock', motherRecords);
  await seedTable('cut_slab_stock', cutRecords);

  // 5. Verification
  console.log('\n====================================================');
  console.log('POST-OPERATION INTEGRITY VERIFICATION');
  console.log('====================================================');
  const [finalOpname] = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM opname_records;`);
  console.log(`FINAL OPNAME RECORDS COUNT: ${finalOpname.count} (Must be 691)`);
  if (finalOpname.count !== 691) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Opname records changed from 691 to ${finalOpname.count}!`);
  }

  const [dbSapCount] = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM sap_stock;`);
  const [dbMotherCount] = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM mother_slab_stock;`);
  const [dbCutCount] = await queryWithRetry(() => sql`SELECT count(*)::int as count FROM cut_slab_stock;`);

  console.log(`Database counts after refresh:`);
  console.log(`- sap_stock: ${dbSapCount.count}`);
  console.log(`- mother_slab_stock: ${dbMotherCount.count}`);
  console.log(`- cut_slab_stock: ${dbCutCount.count}`);

  const [dbSampleSap] = await queryWithRetry(() => sql`SELECT * FROM sap_stock WHERE batch_id = '19L2533A' LIMIT 1;`);
  console.log(`Sample 19L2533A verified in Neon DB:`, dbSampleSap);

  console.log('\n====================================================');
  console.log('ALL STOCK TABLES REFRESHED & VERIFIED WITH 100% OPNAME INTEGRITY!');
  console.log('====================================================');
}

main().catch(err => {
  console.error('\nERROR during execution:', err);
  process.exit(1);
});
