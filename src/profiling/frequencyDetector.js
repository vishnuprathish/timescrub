/**
 * Detect the sampling frequency of a timeseries from an array of timestamps.
 * Strategy: compute all consecutive diffs, find the mode, map to a human label.
 */

const FREQUENCY_LABELS = [
  { ms: 1000,        label: '1sec',      name: 'secondly' },
  { ms: 5000,        label: '5sec',      name: '5-secondly' },
  { ms: 10000,       label: '10sec',     name: '10-secondly' },
  { ms: 15000,       label: '15sec',     name: '15-secondly' },
  { ms: 30000,       label: '30sec',     name: '30-secondly' },
  { ms: 60000,       label: '1min',      name: 'minutely' },
  { ms: 300000,      label: '5min',      name: '5-minutely' },
  { ms: 600000,      label: '10min',     name: '10-minutely' },
  { ms: 900000,      label: '15min',     name: '15-minutely' },
  { ms: 1800000,     label: '30min',     name: '30-minutely' },
  { ms: 3600000,     label: '1H',        name: 'hourly' },
  { ms: 7200000,     label: '2H',        name: '2-hourly' },
  { ms: 14400000,    label: '4H',        name: '4-hourly' },
  { ms: 21600000,    label: '6H',        name: '6-hourly' },
  { ms: 43200000,    label: '12H',       name: '12-hourly' },
  { ms: 86400000,    label: '1D',        name: 'daily' },
  { ms: 172800000,   label: '2D',        name: '2-daily' },
  { ms: 604800000,   label: '1W',        name: 'weekly' },
  { ms: 2592000000,  label: '1M',        name: 'monthly' },
  { ms: 7776000000,  label: '3M',        name: 'quarterly' },
  { ms: 31536000000, label: '1Y',        name: 'yearly' },
];

/**
 * Given an array of JS timestamps (numbers, ms), detect the dominant frequency.
 * @param {number[]} timestamps - sorted array of ms timestamps
 * @returns {{ label, name, medianMs, isRegular, regularity }}
 */
export function detectFrequency(timestamps) {
  if (!timestamps || timestamps.length < 2) {
    return { label: 'unknown', name: 'unknown', medianMs: null, isRegular: false, regularity: 0 };
  }

  // Compute diffs
  const diffs = [];
  for (let i = 1; i < timestamps.length; i++) {
    const d = timestamps[i] - timestamps[i - 1];
    if (d > 0) diffs.push(d); // skip duplicates / negative (unsorted)
  }

  if (diffs.length === 0) {
    return { label: 'unknown', name: 'unknown', medianMs: null, isRegular: false, regularity: 0 };
  }

  // Sort diffs and find median
  const sorted = [...diffs].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];

  // Find the closest standard frequency
  const closest = FREQUENCY_LABELS.reduce((best, freq) => {
    const ratio = medianMs / freq.ms;
    const logDist = Math.abs(Math.log(ratio));
    return logDist < best.dist ? { ...freq, dist: logDist } : best;
  }, { dist: Infinity, label: 'irregular', name: 'irregular', ms: medianMs });

  // Regularity score: fraction of diffs within ±20% of the median
  const tolerance = medianMs * 0.2;
  const regularCount = diffs.filter(
    (d) => Math.abs(d - medianMs) <= tolerance
  ).length;
  const regularity = diffs.length > 0 ? regularCount / diffs.length : 0;

  const isRegular = regularity > 0.8;

  // If the median is far from any standard frequency, label as irregular
  const isStandardFreq = closest.dist < 0.3; // within ~35% of a standard freq

  return {
    label: isStandardFreq ? closest.label : 'irregular',
    name: isStandardFreq ? closest.name : 'irregular',
    medianMs,
    isRegular,
    regularity,
  };
}

/**
 * Parse a timestamp value to a JS Date.
 * Handles string, number (unix seconds/ms), and Date objects.
 */
export function parseTimestamp(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    // Heuristic: if the number is > 1e10, it's milliseconds; else seconds
    const ms = val > 1e10 ? val : val * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extract sorted numeric timestamps from a dataset and a column name.
 */
export function extractTimestamps(rows, tsColumn) {
  if (!tsColumn) return [];
  return rows
    .map((r) => {
      const d = parseTimestamp(r[tsColumn]);
      return d ? d.getTime() : null;
    })
    .filter((t) => t !== null)
    .sort((a, b) => a - b);
}

/**
 * Compute the expected number of rows given a time range and frequency.
 */
export function expectedRowCount(minMs, maxMs, freqMs) {
  if (!freqMs || freqMs <= 0) return null;
  return Math.round((maxMs - minMs) / freqMs) + 1;
}

/**
 * Human-readable frequency label from ms.
 */
export function msToFreqLabel(ms) {
  const match = FREQUENCY_LABELS.reduce((best, freq) => {
    const ratio = ms / freq.ms;
    const dist = Math.abs(Math.log(ratio));
    return dist < best.dist ? { ...freq, dist } : best;
  }, { dist: Infinity, label: '?', ms });
  return match.label;
}
