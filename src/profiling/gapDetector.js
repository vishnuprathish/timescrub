import { parseTimestamp } from './frequencyDetector.js';

/**
 * Detect gaps in a timeseries given sorted timestamps and an expected frequency.
 * A gap is any interval larger than tolerance * expectedFrequency.
 *
 * @param {number[]} sortedTimestamps - sorted array of ms timestamps
 * @param {number} freqMs - expected interval in ms
 * @param {number} toleranceFactor - how many multiples of freqMs before it's a "gap" (default 1.5)
 * @returns {Array<{ start: Date, end: Date, durationMs: number, missingCount: number }>}
 */
export function detectGaps(sortedTimestamps, freqMs, toleranceFactor = 1.5) {
  if (!sortedTimestamps || sortedTimestamps.length < 2 || !freqMs) return [];

  const threshold = freqMs * toleranceFactor;
  const gaps = [];

  for (let i = 1; i < sortedTimestamps.length; i++) {
    const diff = sortedTimestamps[i] - sortedTimestamps[i - 1];
    if (diff > threshold) {
      const missingCount = Math.round(diff / freqMs) - 1;
      gaps.push({
        start: new Date(sortedTimestamps[i - 1]),
        end: new Date(sortedTimestamps[i]),
        durationMs: diff,
        missingCount: Math.max(0, missingCount),
      });
    }
  }

  return gaps;
}

/**
 * Detect duplicate timestamps in a dataset.
 * Returns an array of { timestamp, indices, count } for each duplicate group.
 */
export function detectDuplicates(rows, tsColumn) {
  if (!tsColumn) return [];

  const tsMap = new Map();
  rows.forEach((row, i) => {
    const d = parseTimestamp(row[tsColumn]);
    if (!d) return;
    const key = d.getTime();
    if (!tsMap.has(key)) tsMap.set(key, []);
    tsMap.get(key).push(i);
  });

  const duplicates = [];
  tsMap.forEach((indices, tsMs) => {
    if (indices.length > 1) {
      duplicates.push({
        timestamp: new Date(tsMs),
        indices,
        count: indices.length,
      });
    }
  });

  return duplicates.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Compute per-column null profile over time buckets (for heatmap visualization).
 * Splits the time range into N buckets and returns null fraction per (column, bucket).
 *
 * @param {object[]} rows
 * @param {string} tsColumn
 * @param {string[]} valueColumns
 * @param {number} numBuckets
 * @returns {{ buckets: Date[], columns: string[], matrix: number[][] }}
 */
export function computeNullHeatmap(rows, tsColumn, valueColumns, numBuckets = 50) {
  if (!rows || rows.length === 0 || !tsColumn) {
    return { buckets: [], columns: valueColumns, matrix: [] };
  }

  const times = rows.map((r) => {
    const d = parseTimestamp(r[tsColumn]);
    return d ? d.getTime() : null;
  });

  const validTimes = times.filter(Boolean);
  if (validTimes.length === 0) return { buckets: [], columns: valueColumns, matrix: [] };

  const minT = Math.min(...validTimes);
  const maxT = Math.max(...validTimes);
  const bucketSize = (maxT - minT) / numBuckets || 1;

  // Build buckets
  const buckets = Array.from({ length: numBuckets }, (_, i) => new Date(minT + i * bucketSize));

  // Assign each row to a bucket
  const bucketRows = Array.from({ length: numBuckets }, () => []);
  rows.forEach((row, i) => {
    const t = times[i];
    if (t === null) return;
    const bi = Math.min(Math.floor((t - minT) / bucketSize), numBuckets - 1);
    bucketRows[bi].push(row);
  });

  // Compute null fraction per (column, bucket)
  const matrix = valueColumns.map((col) =>
    bucketRows.map((bucket) => {
      if (bucket.length === 0) return null;
      const nulls = bucket.filter((r) => r[col] == null || r[col] === '').length;
      return nulls / bucket.length;
    })
  );

  return { buckets, columns: valueColumns, matrix };
}
