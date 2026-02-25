const isNull = (v) => v == null || v === '' || (typeof v === 'string' && v.trim() === '');

/**
 * Rename a column across all rows.
 */
export function renameColumn(rows, from, to) {
  return rows.map((row) => {
    const updated = {};
    Object.entries(row).forEach(([k, v]) => {
      updated[k === from ? to : k] = v;
    });
    return updated;
  });
}

/**
 * Drop one or more columns.
 */
export function dropColumns(rows, columns) {
  const dropSet = new Set(columns);
  return rows.map((row) => {
    const updated = {};
    Object.entries(row).forEach(([k, v]) => {
      if (!dropSet.has(k)) updated[k] = v;
    });
    return updated;
  });
}

/**
 * Cast a column to a different data type.
 * @param {'numeric'|'string'|'boolean'} dtype
 */
export function changeDtype(rows, column, dtype) {
  return rows.map((row) => {
    const v = row[column];
    if (v == null || v === '') return { ...row, [column]: null };

    let converted;
    switch (dtype) {
      case 'numeric':
        converted = isNaN(Number(v)) ? null : Number(v);
        break;
      case 'string':
        converted = String(v);
        break;
      case 'boolean':
        converted = ['true', '1', 'yes'].includes(String(v).toLowerCase()) ? 1 : 0;
        break;
      default:
        converted = v;
    }
    return { ...row, [column]: converted };
  });
}

/**
 * Derive a lag feature: value at index i - n.
 */
export function deriveLag(rows, column, n = 1, outputColumn = null) {
  const outCol = outputColumn || `${column}_lag${n}`;
  return rows.map((row, i) => {
    const lagVal = i >= n ? rows[i - n][column] : null;
    return { ...row, [outCol]: lagVal };
  });
}

/**
 * Derive a diff feature: value[i] - value[i - n].
 */
export function deriveDiff(rows, column, n = 1, outputColumn = null) {
  const outCol = outputColumn || `${column}_diff${n}`;
  return rows.map((row, i) => {
    if (i < n) return { ...row, [outCol]: null };
    const curr = parseFloat(row[column]);
    const prev = parseFloat(rows[i - n][column]);
    const diff = isNaN(curr) || isNaN(prev) ? null : curr - prev;
    return { ...row, [outCol]: diff };
  });
}

/**
 * Derive a percent change feature: (value[i] - value[i-n]) / value[i-n] * 100.
 */
export function derivePctChange(rows, column, n = 1, outputColumn = null) {
  const outCol = outputColumn || `${column}_pct${n}`;
  return rows.map((row, i) => {
    if (i < n) return { ...row, [outCol]: null };
    const curr = parseFloat(row[column]);
    const prev = parseFloat(rows[i - n][column]);
    if (isNaN(curr) || isNaN(prev) || prev === 0) return { ...row, [outCol]: null };
    return { ...row, [outCol]: ((curr - prev) / Math.abs(prev)) * 100 };
  });
}

/**
 * Derive a rolling mean feature.
 */
export function deriveRollingMean(rows, column, window = 5, outputColumn = null) {
  const outCol = outputColumn || `${column}_rmean${window}`;
  return rows.map((row, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = rows.slice(start, i + 1);
    const vals = slice.map((r) => parseFloat(r[column])).filter((v) => !isNaN(v));
    const mean = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return { ...row, [outCol]: mean };
  });
}

/**
 * Derive a rolling standard deviation feature.
 */
export function deriveRollingStd(rows, column, window = 5, outputColumn = null) {
  const outCol = outputColumn || `${column}_rstd${window}`;
  return rows.map((row, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = rows.slice(start, i + 1);
    const vals = slice.map((r) => parseFloat(r[column])).filter((v) => !isNaN(v));
    if (vals.length < 2) return { ...row, [outCol]: null };
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    return { ...row, [outCol]: Math.sqrt(variance) };
  });
}

/**
 * Derive a cumulative sum feature.
 */
export function deriveCumsum(rows, column, outputColumn = null) {
  const outCol = outputColumn || `${column}_cumsum`;
  let running = 0;
  return rows.map((row) => {
    const v = parseFloat(row[column]);
    if (!isNaN(v)) running += v;
    return { ...row, [outCol]: isNaN(v) ? null : running };
  });
}

/**
 * Drop rows where a specific column is null.
 */
export function dropRowsWhereNull(rows, column) {
  return rows.filter((row) => !isNull(row[column]));
}
