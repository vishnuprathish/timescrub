import { parseTimestamp } from '../profiling/frequencyDetector.js';

/**
 * Sort rows by a timestamp column.
 * @param {object[]} rows
 * @param {string} tsColumn
 * @param {'asc'|'desc'} direction
 * @returns {object[]}
 */
export function sortByTimestamp(rows, tsColumn, direction = 'asc') {
  if (!tsColumn) return rows;
  return [...rows].sort((a, b) => {
    const da = parseTimestamp(a[tsColumn]);
    const db = parseTimestamp(b[tsColumn]);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return direction === 'asc' ? da - db : db - da;
  });
}

/**
 * Deduplicate rows with duplicate timestamps.
 * @param {object[]} rows
 * @param {string} tsColumn
 * @param {'first'|'last'|'mean'|'max'|'min'} keep
 * @returns {object[]}
 */
export function deduplicateTimestamps(rows, tsColumn, keep = 'last') {
  if (!tsColumn) return rows;

  // Group rows by timestamp key
  const groups = new Map();
  rows.forEach((row) => {
    const d = parseTimestamp(row[tsColumn]);
    const key = d ? d.getTime() : `null_${Math.random()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const result = [];
  groups.forEach((group) => {
    if (group.length === 1) {
      result.push(group[0]);
      return;
    }

    if (keep === 'first') {
      result.push(group[0]);
    } else if (keep === 'last') {
      result.push(group[group.length - 1]);
    } else if (keep === 'mean') {
      // Average all numeric columns
      const merged = { ...group[0] };
      const numericCols = Object.keys(group[0]).filter((k) => {
        return group.every((r) => r[k] != null && !isNaN(Number(r[k])));
      });
      numericCols.forEach((col) => {
        const vals = group.map((r) => Number(r[col]));
        merged[col] = vals.reduce((s, v) => s + v, 0) / vals.length;
      });
      result.push(merged);
    } else if (keep === 'max') {
      const numericCols = Object.keys(group[0]).filter((k) => !isNaN(Number(group[0][k])));
      const merged = { ...group[0] };
      numericCols.forEach((col) => {
        merged[col] = Math.max(...group.map((r) => Number(r[col])));
      });
      result.push(merged);
    } else if (keep === 'min') {
      const numericCols = Object.keys(group[0]).filter((k) => !isNaN(Number(group[0][k])));
      const merged = { ...group[0] };
      numericCols.forEach((col) => {
        merged[col] = Math.min(...group.map((r) => Number(r[col])));
      });
      result.push(merged);
    }
  });

  return result;
}

/**
 * Normalize the timestamp column to ISO 8601 strings.
 */
export function normalizeTimestamps(rows, tsColumn, timezone = 'UTC') {
  return rows.map((row) => {
    const d = parseTimestamp(row[tsColumn]);
    if (!d) return row;
    return { ...row, [tsColumn]: d.toISOString() };
  });
}

/**
 * Filter rows to a date range [start, end] (inclusive).
 */
export function filterDateRange(rows, tsColumn, start, end) {
  const startMs = start ? new Date(start).getTime() : -Infinity;
  const endMs = end ? new Date(end).getTime() : Infinity;
  return rows.filter((row) => {
    const d = parseTimestamp(row[tsColumn]);
    if (!d) return false;
    const ms = d.getTime();
    return ms >= startMs && ms <= endMs;
  });
}

/**
 * Filter rows by a column value comparison.
 */
export function filterByValue(rows, column, operator, value) {
  const num = parseFloat(value);
  return rows.filter((row) => {
    const v = row[column];
    if (v == null || v === '') return false;
    const n = parseFloat(v);
    switch (operator) {
      case '=':  return String(v) === String(value);
      case '!=': return String(v) !== String(value);
      case '>':  return !isNaN(n) && n > num;
      case '<':  return !isNaN(n) && n < num;
      case '>=': return !isNaN(n) && n >= num;
      case '<=': return !isNaN(n) && n <= num;
      default:   return true;
    }
  });
}
