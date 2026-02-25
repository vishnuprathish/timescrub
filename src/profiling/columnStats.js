/**
 * Compute per-column statistics from an array of row objects.
 * Returns an array of column stat objects.
 */
export function computeColumnStats(rows, columns) {
  if (!rows || rows.length === 0) return [];

  return columns.map(({ name }) => {
    const values = rows.map((r) => r[name]);
    const total = values.length;

    // Null / missing count
    const nullCount = values.filter(
      (v) => v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '')
    ).length;
    const nullPct = total > 0 ? (nullCount / total) * 100 : 0;

    // Non-null values
    const nonNull = values.filter(
      (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'string' && v.trim() === '')
    );

    // Unique count (cap at 10000 for performance)
    const uniqueSet = new Set(nonNull.slice(0, 10000).map(String));
    const uniqueCount = uniqueSet.size;

    // Type inference
    const dtype = inferDtype(nonNull);

    // Numeric stats
    let min = null, max = null, mean = null, std = null;
    let p25 = null, p50 = null, p75 = null;

    if (dtype === 'numeric' && nonNull.length > 0) {
      const nums = nonNull.map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      if (nums.length > 0) {
        min = nums[0];
        max = nums[nums.length - 1];
        const sum = nums.reduce((a, b) => a + b, 0);
        mean = sum / nums.length;
        const variance =
          nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
        std = Math.sqrt(variance);
        p25 = quantile(nums, 0.25);
        p50 = quantile(nums, 0.5);
        p75 = quantile(nums, 0.75);
      }
    }

    // Sample values (first 5 non-null)
    const sampleValues = nonNull.slice(0, 5).map(String);

    return {
      name,
      dtype,
      total,
      nullCount,
      nullPct,
      uniqueCount,
      min,
      max,
      mean,
      std,
      p25,
      p50,
      p75,
      sampleValues,
    };
  });
}

/**
 * Infer the dtype of an array of non-null values.
 * Returns 'numeric' | 'datetime' | 'boolean' | 'string'
 */
export function inferDtype(values) {
  if (!values || values.length === 0) return 'string';

  const sample = values.slice(0, Math.min(50, values.length));

  // Boolean check
  const boolSet = new Set(['true', 'false', '1', '0', 'yes', 'no']);
  if (sample.every((v) => boolSet.has(String(v).toLowerCase()))) return 'boolean';

  // Numeric check
  const numericCount = sample.filter((v) => !isNaN(Number(v)) && v !== '').length;
  if (numericCount / sample.length > 0.9) return 'numeric';

  // Datetime check — try parsing a few values
  const dtCount = sample.filter((v) => {
    if (typeof v === 'object' && v instanceof Date) return true;
    const d = new Date(String(v));
    return !isNaN(d.getTime()) && String(v).length > 5;
  }).length;
  if (dtCount / sample.length > 0.8) return 'datetime';

  return 'string';
}

/**
 * Compute the q-quantile of a sorted numeric array.
 */
function quantile(sorted, q) {
  const pos = q * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (pos - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Detect which columns are likely datetime columns by name and value inspection.
 * Returns an array of column names sorted by confidence (highest first).
 */
export function detectDatetimeColumns(columns, rows) {
  const sample = rows.slice(0, 20);
  const NAME_PATTERNS = /^(date|time|timestamp|datetime|dt|ts|created|updated|recorded|measured|logged|index)$/i;

  return columns
    .map(({ name }) => {
      let score = 0;
      if (NAME_PATTERNS.test(name)) score += 3;
      if (/date|time|stamp/i.test(name)) score += 2;

      const vals = sample.map((r) => r[name]).filter((v) => v != null && v !== '');
      const dtCount = vals.filter((v) => {
        if (typeof v === 'object' && v instanceof Date) return true;
        const d = new Date(String(v));
        return !isNaN(d.getTime()) && String(v).length > 5;
      }).length;

      if (vals.length > 0) score += (dtCount / vals.length) * 5;

      return { name, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.name);
}

/**
 * Estimate memory usage of a dataset in bytes (rough approximation).
 */
export function estimateMemory(rows, columns) {
  if (!rows || rows.length === 0) return 0;
  const sample = rows.slice(0, Math.min(100, rows.length));
  const avgRowSize = sample.reduce((sum, row) => {
    return sum + JSON.stringify(row).length;
  }, 0) / sample.length;
  return Math.round(avgRowSize * rows.length);
}
