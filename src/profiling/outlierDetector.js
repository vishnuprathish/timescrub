/**
 * Outlier detection methods for timeseries numeric columns.
 * All methods return an array of { rowIndex, value, score } objects.
 */

/**
 * Z-score method.
 * @param {number[]} values - array indexed by row
 * @param {number} threshold - default 3.0
 * @returns {{ rowIndex: number, value: number, score: number }[]}
 */
export function detectZScore(values, threshold = 3.0) {
  const nums = values.map((v, i) => ({ v: parseFloat(v), i })).filter(({ v }) => !isNaN(v));
  if (nums.length === 0) return [];

  const mean = nums.reduce((s, { v }) => s + v, 0) / nums.length;
  const std = Math.sqrt(nums.reduce((s, { v }) => s + (v - mean) ** 2, 0) / nums.length);

  if (std === 0) return [];

  return nums
    .map(({ v, i }) => ({ rowIndex: i, value: v, score: Math.abs((v - mean) / std) }))
    .filter(({ score }) => score > threshold);
}

/**
 * IQR method (Tukey fences).
 * @param {number[]} values
 * @param {number} multiplier - default 1.5
 */
export function detectIQR(values, multiplier = 1.5) {
  const nums = values.map((v, i) => ({ v: parseFloat(v), i })).filter(({ v }) => !isNaN(v));
  if (nums.length === 0) return [];

  const sorted = [...nums].sort((a, b) => a.v - b.v);
  const q1 = quantile(sorted.map((x) => x.v), 0.25);
  const q3 = quantile(sorted.map((x) => x.v), 0.75);
  const iqr = q3 - q1;

  const lower = q1 - multiplier * iqr;
  const upper = q3 + multiplier * iqr;

  return nums
    .filter(({ v }) => v < lower || v > upper)
    .map(({ v, i }) => ({
      rowIndex: i,
      value: v,
      score: v < lower ? (lower - v) / iqr : (v - upper) / iqr,
      lower,
      upper,
    }));
}

/**
 * Modified Z-score using Median Absolute Deviation (MAD).
 * More robust than standard Z-score for non-normal distributions.
 * @param {number[]} values
 * @param {number} threshold - default 3.5
 */
export function detectMAD(values, threshold = 3.5) {
  const nums = values.map((v, i) => ({ v: parseFloat(v), i })).filter(({ v }) => !isNaN(v));
  if (nums.length === 0) return [];

  const sorted = [...nums.map((x) => x.v)].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const absDeviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = quantile(absDeviations, 0.5);

  if (mad === 0) return detectZScore(values, threshold); // fallback

  return nums
    .map(({ v, i }) => ({ rowIndex: i, value: v, score: (0.6745 * Math.abs(v - median)) / mad }))
    .filter(({ score }) => score > threshold);
}

/**
 * Rolling Z-score — detects local outliers by computing mean/std within a sliding window.
 * Better for non-stationary series.
 * @param {number[]} values
 * @param {number} window - window size (default 20)
 * @param {number} threshold - default 3.0
 */
export function detectRollingZScore(values, window = 20, threshold = 3.0) {
  const nums = values.map((v) => (v == null || v === '' ? NaN : parseFloat(v)));
  const outliers = [];

  for (let i = 0; i < nums.length; i++) {
    if (isNaN(nums[i])) continue;

    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(nums.length, i + Math.floor(window / 2));
    const windowVals = nums.slice(start, end).filter((v) => !isNaN(v));

    if (windowVals.length < 3) continue;

    const mean = windowVals.reduce((s, v) => s + v, 0) / windowVals.length;
    const std = Math.sqrt(windowVals.reduce((s, v) => s + (v - mean) ** 2, 0) / windowVals.length);

    if (std === 0) continue;

    const z = Math.abs((nums[i] - mean) / std);
    if (z > threshold) {
      outliers.push({ rowIndex: i, value: nums[i], score: z });
    }
  }

  return outliers;
}

/**
 * Run all enabled detection methods and merge results (deduplicated by rowIndex).
 * @param {number[]} values
 * @param {object} config - { method, threshold, window, multiplier }
 * @returns {{ rowIndex: number, value: number, score: number, method: string }[]}
 */
export function detectOutliers(values, config = {}) {
  const {
    method = 'iqr',
    threshold = method === 'iqr' ? 1.5 : 3.0,
    window = 20,
    multiplier = 1.5,
  } = config;

  let results = [];

  switch (method) {
    case 'zscore':
      results = detectZScore(values, threshold).map((r) => ({ ...r, method: 'zscore' }));
      break;
    case 'iqr':
      results = detectIQR(values, multiplier).map((r) => ({ ...r, method: 'iqr' }));
      break;
    case 'mad':
      results = detectMAD(values, threshold).map((r) => ({ ...r, method: 'mad' }));
      break;
    case 'rolling_zscore':
      results = detectRollingZScore(values, window, threshold).map((r) => ({
        ...r,
        method: 'rolling_zscore',
      }));
      break;
    default:
      results = detectIQR(values, multiplier).map((r) => ({ ...r, method: 'iqr' }));
  }

  return results;
}

function quantile(sorted, q) {
  const pos = q * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (pos - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Compute IQR bounds for a column (used in outlier treatment).
 */
export function computeIQRBounds(values, multiplier = 1.5) {
  const nums = values.map((v) => parseFloat(v)).filter((v) => !isNaN(v)).sort((a, b) => a - b);
  if (nums.length === 0) return { lower: null, upper: null, q1: null, q3: null };
  const q1 = quantile(nums, 0.25);
  const q3 = quantile(nums, 0.75);
  const iqr = q3 - q1;
  return { lower: q1 - multiplier * iqr, upper: q3 + multiplier * iqr, q1, q3, iqr };
}

/**
 * Compute Z-score bounds for a column.
 */
export function computeZScoreBounds(values, threshold = 3.0) {
  const nums = values.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
  if (nums.length === 0) return { lower: null, upper: null };
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
  const std = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length);
  return { lower: mean - threshold * std, upper: mean + threshold * std, mean, std };
}
