import { parseTimestamp } from '../profiling/frequencyDetector.js';

/**
 * Parse a frequency string like "1H", "15min", "1D" to milliseconds.
 */
export function freqToMs(freq) {
  const match = freq.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|min|T|H|D|W|M|Y)$/i);
  if (!match) throw new Error(`Unknown frequency format: "${freq}"`);
  const n = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000, sec: 1000,
    min: 60000, t: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
    m: 2592000000,
    y: 31536000000,
  };
  return n * (multipliers[unit] ?? 60000);
}

/**
 * Downsample rows to a lower frequency by aggregating within each time bucket.
 *
 * @param {object[]} rows - sorted by timestamp
 * @param {string} tsColumn
 * @param {string} frequency - e.g. "1H", "1D", "15min"
 * @param {string} aggregation - mean|sum|min|max|first|last|median
 * @param {string[]} numericColumns - columns to aggregate (others are dropped or kept as first)
 * @returns {object[]}
 */
export function downsample(rows, tsColumn, frequency, aggregation = 'mean', numericColumns = []) {
  if (!rows || rows.length === 0) return [];

  const freqMs = freqToMs(frequency);

  // Get min timestamp for bucket alignment
  const times = rows.map((r) => {
    const d = parseTimestamp(r[tsColumn]);
    return d ? d.getTime() : null;
  });

  const validTimes = times.filter(Boolean);
  if (validTimes.length === 0) return rows;

  const minT = Math.min(...validTimes);

  // Assign each row to a bucket
  const buckets = new Map();
  rows.forEach((row, i) => {
    const t = times[i];
    if (t === null) return;
    const bucketKey = Math.floor((t - minT) / freqMs);
    const bucketTs = minT + bucketKey * freqMs;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, { ts: bucketTs, rows: [] });
    buckets.get(bucketKey).rows.push(row);
  });

  // Aggregate each bucket
  const result = [];
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);

  for (const key of sortedKeys) {
    const { ts, rows: bucketRows } = buckets.get(key);
    if (bucketRows.length === 0) continue;

    const aggregated = {};
    aggregated[tsColumn] = new Date(ts).toISOString();

    // Numeric columns: aggregate
    const allCols = Object.keys(bucketRows[0]);
    for (const col of allCols) {
      if (col === tsColumn) continue;

      if (numericColumns.length > 0 && !numericColumns.includes(col)) {
        // Non-numeric: keep first value
        aggregated[col] = bucketRows[0][col];
        continue;
      }

      const vals = bucketRows
        .map((r) => parseFloat(r[col]))
        .filter((v) => !isNaN(v));

      if (vals.length === 0) {
        aggregated[col] = null;
        continue;
      }

      switch (aggregation) {
        case 'sum':    aggregated[col] = vals.reduce((s, v) => s + v, 0); break;
        case 'min':    aggregated[col] = Math.min(...vals); break;
        case 'max':    aggregated[col] = Math.max(...vals); break;
        case 'first':  aggregated[col] = vals[0]; break;
        case 'last':   aggregated[col] = vals[vals.length - 1]; break;
        case 'median': {
          const s = [...vals].sort((a, b) => a - b);
          aggregated[col] = s[Math.floor(s.length / 2)];
          break;
        }
        default: // mean
          aggregated[col] = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    }

    result.push(aggregated);
  }

  return result;
}

/**
 * Upsample rows to a higher frequency by inserting rows at the new frequency
 * and filling with the specified method.
 *
 * @param {object[]} rows - sorted by timestamp
 * @param {string} tsColumn
 * @param {string} frequency - target frequency string
 * @param {string} fillMethod - 'ffill' | 'bfill' | 'linear' | 'null'
 * @returns {object[]}
 */
export function upsample(rows, tsColumn, frequency, fillMethod = 'ffill') {
  if (!rows || rows.length === 0) return [];

  const freqMs = freqToMs(frequency);
  const times = rows.map((r) => {
    const d = parseTimestamp(r[tsColumn]);
    return d ? d.getTime() : null;
  }).filter(Boolean);

  if (times.length === 0) return rows;

  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  // Build a lookup of existing rows by timestamp
  const rowMap = new Map();
  rows.forEach((row) => {
    const d = parseTimestamp(row[tsColumn]);
    if (d) rowMap.set(d.getTime(), row);
  });

  // Generate all timestamps in the new grid
  const newRows = [];
  const template = { ...rows[0] }; // Column names
  Object.keys(template).forEach((k) => { template[k] = null; });

  for (let t = minT; t <= maxT; t += freqMs) {
    const existing = rowMap.get(t);
    if (existing) {
      newRows.push({ ...existing });
    } else {
      newRows.push({ ...template, [tsColumn]: new Date(t).toISOString() });
    }
  }

  // Apply fill
  if (fillMethod === 'ffill') {
    return applyFfill(newRows, tsColumn);
  } else if (fillMethod === 'bfill') {
    return applyBfill(newRows, tsColumn);
  } else if (fillMethod === 'linear') {
    return applyLinearFill(newRows, tsColumn);
  }

  return newRows;
}

function applyFfill(rows, tsColumn) {
  const result = rows.map((r) => ({ ...r }));
  const lastVals = {};
  for (let i = 0; i < result.length; i++) {
    Object.keys(result[i]).forEach((k) => {
      if (k === tsColumn) return;
      if (result[i][k] != null && result[i][k] !== '') {
        lastVals[k] = result[i][k];
      } else if (lastVals[k] !== undefined) {
        result[i][k] = lastVals[k];
      }
    });
  }
  return result;
}

function applyBfill(rows, tsColumn) {
  const result = rows.map((r) => ({ ...r }));
  const nextVals = {};
  for (let i = result.length - 1; i >= 0; i--) {
    Object.keys(result[i]).forEach((k) => {
      if (k === tsColumn) return;
      if (result[i][k] != null && result[i][k] !== '') {
        nextVals[k] = result[i][k];
      } else if (nextVals[k] !== undefined) {
        result[i][k] = nextVals[k];
      }
    });
  }
  return result;
}

function applyLinearFill(rows, tsColumn) {
  // Simple linear fill for upsampled rows
  const result = rows.map((r) => ({ ...r }));
  const cols = Object.keys(result[0]).filter((k) => k !== tsColumn);

  for (const col of cols) {
    const vals = result.map((r) => (r[col] != null && r[col] !== '' ? parseFloat(r[col]) : null));

    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== null) continue;

      let prevIdx = i - 1;
      while (prevIdx >= 0 && vals[prevIdx] === null) prevIdx--;
      let nextIdx = i + 1;
      while (nextIdx < vals.length && vals[nextIdx] === null) nextIdx++;

      if (prevIdx < 0 && nextIdx >= vals.length) continue;
      if (prevIdx < 0) { result[i][col] = vals[nextIdx]; continue; }
      if (nextIdx >= vals.length) { result[i][col] = vals[prevIdx]; continue; }

      const alpha = (i - prevIdx) / (nextIdx - prevIdx);
      result[i][col] = vals[prevIdx] + alpha * (vals[nextIdx] - vals[prevIdx]);
    }
  }

  return result;
}
