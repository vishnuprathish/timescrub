import Papa from 'papaparse';

// File size thresholds (bytes)
export const FILE_SIZE_THRESHOLDS = {
  csv: 50 * 1024 * 1024,   // 50 MB
  tsv: 50 * 1024 * 1024,
  xlsx: 20 * 1024 * 1024,  // 20 MB
  xls: 20 * 1024 * 1024,
  json: 30 * 1024 * 1024,  // 30 MB
  jsonl: 75 * 1024 * 1024, // 75 MB
};

export const LARGE_FILE_SAMPLE_ROWS = 10_000;

/**
 * Detect the file type from extension.
 */
export function detectFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext;
}

/**
 * Returns true if the file is too large for full browser processing.
 */
export function isLargeFile(file) {
  const ext = detectFileType(file.name);
  const threshold = FILE_SIZE_THRESHOLDS[ext] ?? FILE_SIZE_THRESHOLDS.csv;
  return file.size > threshold;
}

/**
 * Auto-detect CSV delimiter by scanning the first line.
 */
export function detectDelimiter(text) {
  const firstLine = text.slice(0, 2000).split('\n')[0];
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Parse a CSV/TSV File object.
 * @param {File} file
 * @param {object} config - { delimiter, hasHeader, maxRows }
 * @param {function} onProgress - called with 0-100
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export function parseCSV(file, config = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const {
      delimiter = ',',
      hasHeader = true,
      maxRows = null,
    } = config;

    const rows = [];
    let rowCount = 0;
    const fileSizeGuess = file.size;

    Papa.parse(file, {
      delimiter: delimiter === 'auto' ? '' : delimiter, // '' = auto-detect
      header: hasHeader,
      skipEmptyLines: true,
      dynamicTyping: false, // We do our own type inference
      worker: false, // We handle worker ourselves
      step: (result, parser) => {
        if (result.errors?.length) return; // skip rows with parse errors

        rows.push(result.data);
        rowCount++;

        if (maxRows && rowCount >= maxRows) {
          parser.abort();
          return;
        }

        // Approximate progress from bytes processed
        if (onProgress && rowCount % 1000 === 0) {
          const approxBytesPerRow = fileSizeGuess / Math.max(rowCount, 1);
          const progress = Math.min(90, (rowCount * approxBytesPerRow / fileSizeGuess) * 100);
          onProgress(progress);
        }
      },
      complete: (results) => {
        onProgress?.(100);
        resolve({
          data: rows,
          meta: {
            delimiter: results.meta?.delimiter || delimiter,
            fields: results.meta?.fields || (rows[0] ? Object.keys(rows[0]) : []),
            rowCount: rows.length,
          },
        });
      },
      error: (err) => {
        reject(new Error(`CSV parse error: ${err.message}`));
      },
    });
  });
}

/**
 * Read first N bytes of a file as text (for delimiter detection preview).
 */
export function readFileHead(file, bytes = 4096) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, bytes);
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(slice, 'utf-8');
  });
}

/**
 * Format bytes as a human-readable string.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
