const isNull = (v) => v == null || v === '' || (typeof v === 'string' && v.trim() === '');

/**
 * Apply a simple rolling mean to specified columns.
 * @param {object[]} rows
 * @param {string[]} columns
 * @param {number} window - number of periods
 * @param {boolean} inplace - overwrite column or create new
 * @param {string} suffix - suffix for new column name (default '_smooth')
 */
export function rollingMean(rows, columns, window = 5, inplace = false, suffix = '_smooth') {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const outCol = inplace ? col : `${col}${suffix}`;
    const vals = rows.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    result.forEach((_, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(vals.length, i + Math.ceil(window / 2));
      const windowVals = vals.slice(start, end).filter((v) => v !== null);

      result[i][outCol] = windowVals.length > 0
        ? windowVals.reduce((s, v) => s + v, 0) / windowVals.length
        : null;
    });
  }

  return result;
}

/**
 * Exponentially weighted moving average (EWMA).
 * @param {object[]} rows
 * @param {string[]} columns
 * @param {number} alpha - smoothing factor (0 < alpha <= 1)
 * @param {boolean} inplace
 * @param {string} suffix
 */
export function ewma(rows, columns, alpha = 0.3, inplace = false, suffix = '_ewma') {
  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const outCol = inplace ? col : `${col}${suffix}`;
    const vals = rows.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    let prev = null;
    const smoothed = vals.map((v) => {
      if (v === null) return prev; // carry forward
      if (prev === null) {
        prev = v;
        return v;
      }
      prev = alpha * v + (1 - alpha) * prev;
      return prev;
    });

    smoothed.forEach((v, i) => { result[i][outCol] = v; });
  }

  return result;
}

/**
 * Savitzky-Golay filter (polynomial smoothing).
 * Uses a simple least-squares polynomial fit in a sliding window.
 *
 * @param {object[]} rows
 * @param {string[]} columns
 * @param {number} window - must be odd, >= polyOrder + 2
 * @param {number} polyOrder - polynomial order (default 2)
 * @param {boolean} inplace
 * @param {string} suffix
 */
export function savitzkyGolay(rows, columns, window = 5, polyOrder = 2, inplace = false, suffix = '_sg') {
  // Ensure window is odd
  const w = window % 2 === 0 ? window + 1 : window;
  const half = Math.floor(w / 2);

  const result = rows.map((r) => ({ ...r }));

  for (const col of columns) {
    const outCol = inplace ? col : `${col}${suffix}`;
    const vals = rows.map((r) => (isNull(r[col]) ? null : parseFloat(r[col])));

    const smoothed = vals.map((_, i) => {
      const start = Math.max(0, i - half);
      const end = Math.min(vals.length - 1, i + half);

      const xArr = [];
      const yArr = [];
      for (let j = start; j <= end; j++) {
        if (vals[j] !== null) {
          xArr.push(j - i);
          yArr.push(vals[j]);
        }
      }

      if (yArr.length < polyOrder + 1) {
        return vals[i]; // not enough points, return original
      }

      // Fit polynomial of degree polyOrder using least squares
      const fitted = polyFit(xArr, yArr, Math.min(polyOrder, yArr.length - 1));
      return fitted;
    });

    smoothed.forEach((v, i) => { result[i][outCol] = v; });
  }

  return result;
}

/**
 * Fit a polynomial of the given degree to (x, y) data and evaluate at x=0.
 * Returns the fitted value at x=0.
 */
function polyFit(x, y, degree) {
  const n = x.length;
  const d = Math.min(degree, n - 1);

  // Build Vandermonde matrix A (n x (d+1))
  const A = x.map((xi) => Array.from({ length: d + 1 }, (_, k) => xi ** k));

  // Normal equations: (A^T A) c = A^T y
  const AtA = matMul(transpose(A), A);
  const Aty = matMulVec(transpose(A), y);

  const c = gaussianElimination(AtA, Aty);
  if (!c) return y[Math.floor(n / 2)]; // fallback to median

  // Evaluate at x=0: sum(c[k] * 0^k) = c[0]
  return c[0];
}

function transpose(M) {
  return M[0].map((_, j) => M.map((row) => row[j]));
}

function matMul(A, B) {
  const m = A.length, n = B[0].length, p = B.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      Array.from({ length: p }, (_, k) => A[i][k] * B[k][j]).reduce((s, v) => s + v, 0)
    )
  );
}

function matMulVec(A, v) {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

function gaussianElimination(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    if (Math.abs(M[col][col]) < 1e-10) return null; // singular

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }

  return x;
}
