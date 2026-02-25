/**
 * Pearson correlation matrix computation.
 * Uses pairwise complete observations — rows with null/NaN in either column are excluded.
 */

// -----------------------------------------------------------------------
// Pearson correlation between two numeric arrays (pairwise complete obs)
// -----------------------------------------------------------------------
function pearsonCorrelation(rowsA, rowsB) {
  const pairs = [];
  for (let i = 0; i < rowsA.length; i++) {
    const a = typeof rowsA[i] === 'number' ? rowsA[i] : parseFloat(rowsA[i]);
    const b = typeof rowsB[i] === 'number' ? rowsB[i] : parseFloat(rowsB[i]);
    if (isFinite(a) && isFinite(b)) pairs.push([a, b]);
  }

  const n = pairs.length;
  if (n < 3) return null;

  const mx = pairs.reduce((s, [a]) => s + a, 0) / n;
  const my = pairs.reduce((s, [, b]) => s + b, 0) / n;

  let num = 0, dx = 0, dy = 0;
  for (const [a, b] of pairs) {
    num += (a - mx) * (b - my);
    dx += (a - mx) ** 2;
    dy += (b - my) ** 2;
  }

  const denom = Math.sqrt(dx) * Math.sqrt(dy);
  if (denom === 0) return 0;

  // Clamp to [-1, 1] to handle float rounding
  return Math.max(-1, Math.min(1, num / denom));
}

// -----------------------------------------------------------------------
// Public API
// columnStats: array from profiling/columnStats.js
// rows: plain JS row objects
// Returns { columns: string[], matrix: number[][] } or null
// -----------------------------------------------------------------------
export function computeCorrelationMatrix(rows, columnStats) {
  const numericCols = columnStats
    .filter((c) => c.dtype === 'numeric')
    .slice(0, 15); // cap at 15 for legible heatmap

  if (numericCols.length < 2) return null;

  // Pre-extract column value arrays once (avoids repeated row scans)
  const colArrays = numericCols.map((col) => rows.map((r) => r[col.name]));

  const matrix = numericCols.map((_, i) =>
    numericCols.map((_, j) => {
      if (i === j) return 1;
      // Upper-triangle already computed — mirror it
      if (j < i) return null; // will be filled from [j][i]
      const r = pearsonCorrelation(colArrays[i], colArrays[j]);
      return r !== null ? +r.toFixed(4) : null;
    })
  );

  // Mirror upper triangle to lower
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = 0; j < i; j++) {
      matrix[i][j] = matrix[j][i];
    }
  }

  return {
    columns: numericCols.map((c) => c.name),
    matrix,
  };
}
