/**
 * Utility functions for RFC-4180 quote-aware CSV parsing and robust numeric conversion.
 */

/**
 * Universal safe numeric parser that automatically converts comma decimals to dots,
 * strips quotes and thousand-separators, and handles European & Indonesian Excel formats.
 * e.g.:
 *  "24,3"   -> 24.3
 *  "24.3"   -> 24.3
 *  "9,800"  -> 9800
 *  "1.250,5" -> 1250.5
 *  "-"      -> 0
 */
export function parseNumericSafe(val: any): number {
  if (val === null || val === undefined) return 0;
  let clean = String(val).replace(/['"]/g, '').trim();
  if (!clean || clean === '-' || clean === 'N/A' || clean === 'null') return 0;

  // Handle pure comma decimal: e.g. "24,3" or "0,52"
  if (/^-?\d+,\d+$/.test(clean)) {
    clean = clean.replace(',', '.');
  } 
  // Handle integer with thousand separators: e.g. "9,800" or "12,000"
  else if (/^-?\d{1,3}(,\d{3})+$/.test(clean)) {
    clean = clean.replace(/,/g, '');
  } 
  // Handle European thousand dot and comma decimal: e.g. "1.250,50"
  else if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } 
  // Fallback: single comma without dots
  else if (clean.includes(',') && !clean.includes('.')) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Parses full CSV text into a 2D array of tokens, properly preserving
 * quoted fields that contain commas, semicolons, or newlines (RFC-4180).
 */
export function parseCsvRows(text: string, forcedDelimiter?: string): string[][] {
  if (!text) return [];

  // Strip BOM if present
  let cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  // Auto-detect delimiter if not forced
  let delimiter = forcedDelimiter;
  if (!delimiter) {
    const firstLine = cleanText.split(/\r\n|\n|\r/)[0] || '';
    const delimiters = [',', ';', '\t', '|'];
    let maxCols = 0;
    delimiter = ',';
    delimiters.forEach(d => {
      // Rough column count estimate for first line
      const count = firstLine.split(d).length;
      if (count > maxCols) {
        maxCols = count;
        delimiter = d;
      }
    });
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
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
          // Escaped quote
          currentToken += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
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
        if (nextChar === '\n') {
          i++; // Skip \r in \r\n
        }
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

  // Final flush
  if (currentToken.length > 0 || currentRow.length > 0) {
    currentRow.push(currentToken.trim());
    rows.push(currentRow);
  }

  return rows.filter(r => r.length > 0 && r.some(c => c.trim().length > 0));
}
