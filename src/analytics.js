/**
 * TimeScrub Analytics — thin wrapper around Plausible custom events.
 *
 * All calls are fire-and-forget. If Plausible is blocked by an ad-blocker,
 * window.plausible is the no-op stub defined in index.html and nothing breaks.
 *
 * Event taxonomy:
 *   File Upload         — user drops / selects a file
 *   Sample Load         — user clicks a built-in sample dataset
 *   Parse Complete      — file parsed successfully
 *   Large File          — file exceeded size threshold → script mode
 *   Operation Applied   — a cleaning operation was applied
 *   Operation Undone    — an operation was removed from the log
 *   Tab View            — user switches to a tab
 *   Export              — user downloads data or a script
 *   Parse Error         — parsing failed
 */

/* ---------- helpers ---------- */

function sizeBucket(bytes) {
  if (bytes < 1024 * 1024)       return '< 1 MB';
  if (bytes < 10 * 1024 * 1024)  return '1–10 MB';
  if (bytes < 50 * 1024 * 1024)  return '10–50 MB';
  return '> 50 MB';
}

function track(event, props = {}) {
  try {
    window.plausible?.(event, { props });
  } catch {
    // Never let analytics break the app
  }
}

/* ---------- public API ---------- */

/**
 * User uploads or drops a file.
 * @param {File} file
 * @param {boolean} isLarge
 */
export function trackFileUpload(file, isLarge) {
  const ext = file.name.split('.').pop().toLowerCase();
  track('File Upload', {
    format: ext,
    size_bucket: sizeBucket(file.size),
    large_file: isLarge ? 'yes' : 'no',
  });
}

/**
 * User loads a built-in sample dataset.
 * @param {string} datasetId  e.g. 'sensor', 'ohlcv'
 */
export function trackSampleLoad(datasetId) {
  track('Sample Load', { dataset: datasetId });
}

/**
 * File parsed successfully and workspace opened.
 * @param {number} rowCount
 * @param {number} colCount
 * @param {string} frequency  e.g. 'hourly', 'daily', 'irregular'
 * @param {boolean} hasTimestamp
 */
export function trackParseComplete(rowCount, colCount, frequency, hasTimestamp) {
  const rowBucket =
    rowCount < 1000    ? '< 1k'   :
    rowCount < 10000   ? '1–10k'  :
    rowCount < 100000  ? '10–100k':
                         '> 100k';

  track('Parse Complete', {
    row_bucket: rowBucket,
    col_count: String(colCount),
    frequency: frequency || 'unknown',
    has_timestamp: hasTimestamp ? 'yes' : 'no',
  });
}

/**
 * File exceeded size threshold — script generation mode activated.
 * @param {string} format  file extension
 * @param {number} sizeBytes
 */
export function trackLargeFile(format, sizeBytes) {
  track('Large File', {
    format,
    size_bucket: sizeBucket(sizeBytes),
  });
}

/**
 * A cleaning operation was applied to the dataset.
 * @param {string} op    operation key, e.g. 'impute_linear'
 * @param {string} category  e.g. 'missing', 'outlier', 'resample'
 */
export function trackOperation(op, category) {
  track('Operation Applied', { op, category });
}

/**
 * An operation was removed from the log (undo).
 * @param {string} op
 */
export function trackUndo(op) {
  track('Operation Undone', { op });
}

/**
 * User switches to a tab.
 * @param {string} tabId  e.g. 'plot', 'quality', 'columns'
 */
export function trackTabView(tabId) {
  track('Tab View', { tab: tabId });
}

/**
 * User downloads something from the export panel.
 * @param {'csv'|'excel'|'json'|'python'|'r'|'log'|'report'} exportType
 */
export function trackExport(exportType) {
  track('Export', { type: exportType });
}

/**
 * Parsing failed with an error.
 * @param {string} format  file extension
 * @param {string} error   short error message (no PII)
 */
export function trackParseError(format, error) {
  track('Parse Error', {
    format,
    // Truncate and sanitize — never log file content
    error: String(error).slice(0, 120).replace(/\/[^\s]+/g, '[path]'),
  });
}
