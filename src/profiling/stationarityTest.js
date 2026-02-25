/**
 * Augmented Dickey-Fuller (ADF) stationarity test — pure JS implementation.
 *
 * Tests H₀: series has a unit root (non-stationary).
 * Regression form: Δy_t = γ·y_{t-1} + Σ δ_j·Δy_{t-j} + μ + ε
 * ADF statistic = t-stat on γ (coefficient of y_{t-1}).
 * Reject H₀ (conclude stationarity) when ADF stat < critical value.
 *
 * Critical values for constant, no trend (MacKinnon 1994 large-sample):
 *   1%  → -3.43
 *   5%  → -2.86
 *  10%  → -2.57
 */

// -----------------------------------------------------------------------
// Utility: Gaussian elimination matrix inverse (n × n)
// -----------------------------------------------------------------------
function invertMatrix(A) {
  const n = A.length;
  // Augmented matrix [A | I]
  const M = A.map((row, i) => {
    const aug = [...row.map((v) => v), ...Array(n).fill(0)];
    aug[n + i] = 1;
    return aug;
  });

  for (let col = 0; col < n; col++) {
    // Find pivot row
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) return null; // singular

    for (let j = 0; j < 2 * n; j++) M[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = 0; j < 2 * n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row.slice(n));
}

// -----------------------------------------------------------------------
// Utility: OLS — returns { beta, se } where se[i] is std error of beta[i]
// X: n×p array-of-arrays, y: n-vector
// -----------------------------------------------------------------------
function ols(X, y) {
  const n = X.length;
  const p = X[0].length;

  // Build X^T X and X^T y
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  const inv = invertMatrix(XtX);
  if (!inv) return null;

  // beta = inv(X^T X) · X^T y
  const beta = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < p; k++) {
      beta[j] += inv[j][k] * Xty[k];
    }
  }

  // Residual sum of squares → s²
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let j = 0; j < p; j++) yhat += X[i][j] * beta[j];
    sse += (y[i] - yhat) ** 2;
  }
  const s2 = sse / Math.max(1, n - p);

  // Standard errors: se[j] = sqrt(s² · inv[j][j])
  const se = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    se[j] = Math.sqrt(Math.max(0, s2 * inv[j][j]));
  }

  return { beta, se };
}

// -----------------------------------------------------------------------
// ADF test for a single numeric array
// Returns { adfStat, lags } or null on failure
// -----------------------------------------------------------------------
function adfTest(values) {
  // Extract finite values preserving positions
  const y = values.map((v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  });

  // Fill nulls with linear interpolation for continuity
  const filled = [...y];
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] === null) {
      let left = i - 1;
      let right = i + 1;
      while (left >= 0 && filled[left] === null) left--;
      while (right < filled.length && filled[right] === null) right++;
      if (left >= 0 && right < filled.length) {
        filled[i] = filled[left] + ((filled[right] - filled[left]) * (i - left)) / (right - left);
      } else if (left >= 0) {
        filled[i] = filled[left];
      } else if (right < filled.length) {
        filled[i] = filled[right];
      }
    }
  }

  const clean = filled.filter((v) => v !== null);
  if (clean.length < 12) return null;

  const n = clean.length;
  const k = Math.max(1, Math.floor(Math.cbrt(n - 1))); // lag order

  // First differences: dy[t] = y[t+1] - y[t]
  const dy = [];
  for (let t = 0; t < n - 1; t++) dy.push(clean[t + 1] - clean[t]);

  // Need dy.length >= k + 1 for the regression
  if (dy.length - k < 4) return null;

  // Build regression matrices
  // Y = dy[k], dy[k+1], ..., dy[n-2]   (length = n-1-k)
  // X row t (t starts at k): [y[t], dy[t-1], ..., dy[t-k], 1]
  const Y = [];
  const X = [];

  for (let t = k; t < dy.length; t++) {
    Y.push(dy[t]);
    const row = [clean[t]]; // y_{t} as proxy for y_{t-1} in Δy_t context
    for (let j = 1; j <= k; j++) row.push(dy[t - j]);
    row.push(1); // constant
    X.push(row);
  }

  const result = ols(X, Y);
  if (!result) return null;

  const { beta, se } = result;
  if (se[0] === 0) return null;

  const adfStat = beta[0] / se[0];
  return { adfStat: +adfStat.toFixed(4), lags: k };
}

// -----------------------------------------------------------------------
// Map ADF statistic to verdict using MacKinnon 1994 critical values
// -----------------------------------------------------------------------
function adfVerdict(adfStat) {
  if (adfStat < -3.43) return { verdict: 'Stationary', pApprox: '< 0.01', level: 'strong' };
  if (adfStat < -2.86) return { verdict: 'Stationary', pApprox: '< 0.05', level: 'moderate' };
  if (adfStat < -2.57) return { verdict: 'Borderline', pApprox: '< 0.10', level: 'weak' };
  return { verdict: 'Non-stationary', pApprox: '> 0.10', level: 'none' };
}

// -----------------------------------------------------------------------
// Public API: run ADF test for all numeric columns
// numericCols: array of columnStats objects with .name and .dtype === 'numeric'
// rows: array of plain JS row objects
// -----------------------------------------------------------------------
export function runAdfTests(rows, numericCols) {
  const results = [];
  const cols = numericCols.slice(0, 10); // same cap as outlier detection

  for (const col of cols) {
    const values = rows.map((r) => r[col.name]);
    const testResult = adfTest(values);
    if (!testResult) continue;

    const { adfStat, lags } = testResult;
    const { verdict, pApprox, level } = adfVerdict(adfStat);

    results.push({
      column: col.name,
      adfStat,
      verdict,
      pApprox,
      level,   // 'strong' | 'moderate' | 'weak' | 'none'
      lags,
    });
  }

  return results;
}
