import * as XLSX from 'xlsx';

/**
 * Parse an Excel (.xlsx / .xls) File into an array of row objects.
 * Returns the first sheet by default.
 */
export async function parseExcel(file, config = {}) {
  const { sheetIndex = 0, hasHeader = true, maxRows = null } = config;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,     // Parse dates as JS Date objects
    cellNF: false,
    cellText: false,
  });

  const sheetName = workbook.SheetNames[sheetIndex];
  const sheet = workbook.Sheets[sheetName];

  const opts = {
    header: hasHeader ? 1 : undefined,
    raw: false,         // Use formatted text, not raw values
    defval: null,
  };

  const raw = XLSX.utils.sheet_to_json(sheet, opts);

  // If hasHeader=true, XLSX returns objects with column names as keys
  // If hasHeader=false, returns arrays — convert to objects with col0, col1, ...
  let rows = raw;
  if (!hasHeader && raw.length > 0) {
    const numCols = raw[0].length;
    rows = raw.map((arr) => {
      const obj = {};
      for (let i = 0; i < numCols; i++) obj[`col${i}`] = arr[i];
      return obj;
    });
  }

  if (maxRows) rows = rows.slice(0, maxRows);

  const fields = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    data: rows,
    meta: {
      sheetName,
      sheetNames: workbook.SheetNames,
      fields,
      rowCount: rows.length,
    },
  };
}
