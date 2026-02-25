/**
 * Parse a JSON or JSON Lines file.
 * JSON: expects an array of objects, or an object with a key containing an array.
 * JSONL: each line is a JSON object.
 */
export async function parseJSON(file, config = {}) {
  const { maxRows = null } = config;

  const text = await file.text();
  const ext = file.name.split('.').pop().toLowerCase();

  let rows = [];

  if (ext === 'jsonl' || ext === 'ndjson') {
    // JSON Lines: parse each non-empty line
    const lines = text.split('\n').filter((l) => l.trim());
    rows = lines.map((line, i) => {
      try { return JSON.parse(line); }
      catch { console.warn(`JSON Lines parse error at line ${i + 1}`); return null; }
    }).filter(Boolean);
  } else {
    // Standard JSON
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      rows = parsed;
    } else if (typeof parsed === 'object') {
      // Look for the first key whose value is an array
      const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      if (arrayKey) rows = parsed[arrayKey];
      else throw new Error('JSON must contain an array of objects at the root or as a top-level key.');
    } else {
      throw new Error('Unsupported JSON structure. Expected an array of objects.');
    }
  }

  if (maxRows) rows = rows.slice(0, maxRows);

  // Normalize: ensure all rows are plain objects
  rows = rows.map((r) => (typeof r === 'object' && r !== null ? r : {}));

  const fields = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    data: rows,
    meta: { fields, rowCount: rows.length },
  };
}
