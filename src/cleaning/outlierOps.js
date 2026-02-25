import { detectOutliers, computeIQRBounds, computeZScoreBounds } from '../profiling/outlierDetector.js';

const isNull = (v) => v == null || v === '' || (typeof v === 'string' && v.trim() === '');

/**
 * Get the set of outlier row indices for a column using the given method.
 */
function getOutlierIndices(rows, column, method, params) {
  const values = rows.map((r) => (isNull(r[column]) ? null : r[column]));
  const outliers = detectOutliers(values, { method, ...params });
  return new Set(outliers.map((o) => o.rowIndex));
}

/**
 * Clip outliers to the fence values defined by the detection method.
 */
export function clipOutliers(rows, columns, method = 'iqr', params = {}) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const values = rows.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));
    const nums = values.filter((v) => v !== null);

    let lower, upper;
    if (method === 'iqr') {
      const bounds = computeIQRBounds(nums, params.multiplier ?? 1.5);
      lower = bounds.lower;
      upper = bounds.upper;
    } else {
      const bounds = computeZScoreBounds(nums, params.threshold ?? 3.0);
      lower = bounds.lower;
      upper = bounds.upper;
    }

    if (lower === null) continue;

    result.forEach((row, i) => {
      const v = parseFloat(row[col]);
      if (!isNaN(v)) {
        result[i][col] = Math.max(lower, Math.min(upper, v));
      }
    });
  }

  return result;
}

/**
 * Replace outlier values with NaN (null).
 */
export function replaceOutliersWithNull(rows, columns, method = 'iqr', params = {}) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const indices = getOutlierIndices(rows, col, method, params);
    indices.forEach((i) => {
      result[i][col] = null;
    });
  }

  return result;
}

/**
 * Replace outlier values with the rolling median of surrounding values.
 */
export function replaceOutliersWithRollingMedian(rows, columns, method = 'iqr', params = {}, window = 5) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const values = rows.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));
    const indices = getOutlierIndices(rows, col, method, params);

    indices.forEach((i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, i + Math.ceil(window / 2));
      const windowVals = values
        .slice(start, end)
        .filter((v, idx) => v !== null && !indices.has(start + idx));

      if (windowVals.length > 0) {
        const sorted = [...windowVals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        result[i][col] = median;
      }
    });
  }

  return result;
}

/**
 * Drop rows where any of the specified columns has an outlier.
 */
export function dropOutlierRows(rows, columns, method = 'iqr', params = {}) {
  const outlierRowSets = columns.map((col) =>
    getOutlierIndices(rows, col, method, params)
  );

  const allOutlierRows = new Set();
  outlierRowSets.forEach((set) => set.forEach((i) => allOutlierRows.add(i)));

  return rows.filter((_, i) => !allOutlierRows.has(i));
}

/**
 * Flag outliers by adding a boolean column.
 */
export function flagOutliers(rows, columns, method = 'iqr', params = {}) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const indices = getOutlierIndices(rows, col, method, params);
    const flagCol = params.flagColumnSuffix
      ? `${col}${params.flagColumnSuffix}`
      : `${col}_outlier`;
    result.forEach((row, i) => {
      result[i][flagCol] = indices.has(i) ? 1 : 0;
    });
  }

  return result;
}
