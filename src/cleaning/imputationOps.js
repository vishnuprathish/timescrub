import { parseTimestamp } from '../profiling/frequencyDetector.js';

const isNull = (v) => v == null || v === '' || (typeof v === 'string' && v.trim() === '');

/**
 * Forward fill: propagate last non-null value forward.
 */
export function ffill(rows, columns) {
  const result = rows.map((r) => ({ ...r }));
  const lastVal = {};
  for (let i = 0; i < result.length; i++) {
    for (const col of columns) {
      if (!isNull(result[i][col])) {
        lastVal[col] = result[i][col];
      } else if (lastVal[col] !== undefined) {
        result[i][col] = lastVal[col];
      }
    }
  }
  return result;
}

/**
 * Backward fill: propagate next non-null value backward.
 */
export function bfill(rows, columns) {
  const result = rows.map((r) => ({ ...r }));
  const nextVal = {};
  for (let i = result.length - 1; i >= 0; i--) {
    for (const col of columns) {
      if (!isNull(result[i][col])) {
        nextVal[col] = result[i][col];
      } else if (nextVal[col] !== undefined) {
        result[i][col] = nextVal[col];
      }
    }
  }
  return result;
}

/**
 * Linear interpolation (index-based).
 * For time-aware interpolation, pass tsColumn to weight by time distance.
 */
export function linearInterpolate(rows, columns, tsColumn = null) {
  const result = rows.map((r) => ({ ...r }));

  // Extract timestamps as numbers for time-weighted interpolation
  const times = tsColumn
    ? rows.map((r) => {
        const d = parseTimestamp(r[tsColumn]);
        return d ? d.getTime() : null;
      })
    : rows.map((_, i) => i);

  for (const col of columns) {
    const vals = result.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== null) continue;

      // Find nearest non-null values before and after
      let prevIdx = i - 1;
      while (prevIdx >= 0 && vals[prevIdx] === null) prevIdx--;

      let nextIdx = i + 1;
      while (nextIdx < vals.length && vals[nextIdx] === null) nextIdx++;

      if (prevIdx < 0 && nextIdx >= vals.length) continue; // all null
      if (prevIdx < 0) {
        result[i][col] = vals[nextIdx];
        continue;
      }
      if (nextIdx >= vals.length) {
        result[i][col] = vals[prevIdx];
        continue;
      }

      // Interpolate
      const t0 = times[prevIdx];
      const t1 = times[nextIdx];
      const ti = times[i];

      let alpha;
      if (t1 === t0 || t0 === null || t1 === null || ti === null) {
        alpha = (i - prevIdx) / (nextIdx - prevIdx);
      } else {
        alpha = (ti - t0) / (t1 - t0);
      }

      result[i][col] = vals[prevIdx] + alpha * (vals[nextIdx] - vals[prevIdx]);
    }
  }

  return result;
}

/**
 * Cubic spline interpolation (simplified natural spline).
 */
export function splineInterpolate(rows, columns) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const vals = result.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    // Collect known points
    const knownX = [];
    const knownY = [];
    vals.forEach((v, i) => {
      if (v !== null) { knownX.push(i); knownY.push(v); }
    });

    if (knownX.length < 2) continue;

    // For each null, find the cubic spline value
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== null) continue;

      // Find bracketing known points
      let j = knownX.findIndex((x) => x > i);
      if (j <= 0) j = 1;
      if (j >= knownX.length) j = knownX.length - 1;

      const x0 = knownX[j - 1], x1 = knownX[j];
      const y0 = knownY[j - 1], y1 = knownY[j];
      const t = (i - x0) / (x1 - x0);

      // Hermite cubic with zero tangents at endpoints (simple approximation)
      let m0 = 0, m1 = 0;
      if (j > 1) m0 = (knownY[j] - knownY[j - 2]) / (knownX[j] - knownX[j - 2]);
      if (j < knownX.length - 1) m1 = (knownY[j + 1] - knownY[j - 1]) / (knownX[j + 1] - knownX[j - 1]);

      const h = x1 - x0;
      const interpolated =
        (2 * t ** 3 - 3 * t ** 2 + 1) * y0 +
        (t ** 3 - 2 * t ** 2 + t) * h * m0 +
        (-2 * t ** 3 + 3 * t ** 2) * y1 +
        (t ** 3 - t ** 2) * h * m1;

      result[i][col] = interpolated;
    }
  }

  return result;
}

/**
 * Fill missing values with a constant.
 */
export function fillConstant(rows, columns, value) {
  return rows.map((r) => {
    const updated = { ...r };
    for (const col of columns) {
      if (isNull(r[col])) updated[col] = value;
    }
    return updated;
  });
}

/**
 * Fill missing values with rolling mean (symmetric window).
 */
export function fillRollingMean(rows, columns, window = 5) {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const vals = result.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    for (let i = 0; i < vals.length; i++) {
      if (vals[i] !== null) continue;

      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(vals.length, i + Math.ceil(window / 2));
      const windowVals = vals.slice(start, end).filter((v) => v !== null);

      if (windowVals.length > 0) {
        result[i][col] = windowVals.reduce((s, v) => s + v, 0) / windowVals.length;
      }
    }
  }

  return result;
}

/**
 * Drop rows where any of the specified columns is null.
 * If columns is empty, drop rows where ANY column is null.
 */
export function dropNullRows(rows, columns = []) {
  return rows.filter((row) => {
    const cols = columns.length > 0 ? columns : Object.keys(row);
    return !cols.some((col) => isNull(row[col]));
  });
}
