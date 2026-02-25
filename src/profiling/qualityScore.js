/**
 * Compute a composite data quality score (0–100) and dimension breakdowns.
 *
 * Dimensions:
 * - Completeness (40%): inverse of average null fraction across numeric columns
 * - Regularity (25%): how regular the timestamp spacing is
 * - Outlier density (20%): inverse of outlier fraction
 * - Duplicate rate (15%): inverse of duplicate fraction
 */
export function computeQualityScore({
  columnStats = [],
  regularity = 1,
  outliers = {},
  duplicates = [],
  rowCount = 0,
}) {
  // --- Completeness ---
  const numericCols = columnStats.filter((c) => c.dtype === 'numeric');
  let completeness = 1;
  if (numericCols.length > 0) {
    const avgNullPct = numericCols.reduce((s, c) => s + c.nullPct, 0) / numericCols.length;
    completeness = 1 - avgNullPct / 100;
  } else if (columnStats.length > 0) {
    const avgNullPct = columnStats.reduce((s, c) => s + c.nullPct, 0) / columnStats.length;
    completeness = 1 - avgNullPct / 100;
  }

  // --- Regularity --- (already a 0-1 fraction from frequencyDetector)
  const regularityScore = Math.max(0, Math.min(1, regularity));

  // --- Outlier density ---
  let outlierScore = 1;
  if (rowCount > 0) {
    const totalOutlierRows = new Set(
      Object.values(outliers).flatMap((arr) => arr.map((o) => o.rowIndex))
    ).size;
    const outlierFraction = totalOutlierRows / rowCount;
    outlierScore = Math.max(0, 1 - outlierFraction * 10); // 10% outliers → score = 0
  }

  // --- Duplicate rate ---
  let duplicateScore = 1;
  if (rowCount > 0) {
    const duplicateRows = duplicates.reduce((s, d) => s + d.count - 1, 0);
    const duplicateFraction = duplicateRows / rowCount;
    duplicateScore = Math.max(0, 1 - duplicateFraction * 5);
  }

  // Weighted composite
  const composite =
    completeness * 0.4 +
    regularityScore * 0.25 +
    outlierScore * 0.2 +
    duplicateScore * 0.15;

  const score = Math.round(composite * 100);

  return {
    score,
    dimensions: {
      completeness: Math.round(completeness * 100),
      regularity: Math.round(regularityScore * 100),
      outlierDensity: Math.round(outlierScore * 100),
      duplicateRate: Math.round(duplicateScore * 100),
    },
  };
}

/**
 * Generate a human-readable list of issues based on profiling data.
 */
export function generateIssues({
  columnStats = [],
  gaps = [],
  duplicates = [],
  outliers = {},
  rowCount = 0,
  detectedFrequency = null,
}) {
  const issues = [];

  // High null columns
  const highNullCols = columnStats.filter((c) => c.nullPct > 20);
  if (highNullCols.length > 0) {
    issues.push({
      severity: highNullCols.some((c) => c.nullPct > 50) ? 'danger' : 'warning',
      icon: '⚠',
      text: `<strong>${highNullCols.length} column${highNullCols.length > 1 ? 's' : ''}</strong> have >20% missing values: ${highNullCols.slice(0, 3).map((c) => c.name).join(', ')}${highNullCols.length > 3 ? ` +${highNullCols.length - 3} more` : ''}`,
    });
  }

  // Gaps
  const totalGapRows = gaps.reduce((s, g) => s + g.missingCount, 0);
  if (gaps.length > 0) {
    issues.push({
      severity: totalGapRows > rowCount * 0.1 ? 'danger' : 'warning',
      icon: '⏳',
      text: `<strong>${gaps.length} time gap${gaps.length > 1 ? 's' : ''}</strong> detected (${totalGapRows.toLocaleString()} missing intervals). Largest: ${formatDuration(Math.max(...gaps.map((g) => g.durationMs)))}`,
    });
  }

  // Duplicates
  if (duplicates.length > 0) {
    const dupRows = duplicates.reduce((s, d) => s + d.count - 1, 0);
    issues.push({
      severity: 'warning',
      icon: '♊',
      text: `<strong>${duplicates.length} duplicate timestamp${duplicates.length > 1 ? 's' : ''}</strong> found (${dupRows} extra rows)`,
    });
  }

  // Outliers
  const outCols = Object.entries(outliers).filter(([, arr]) => arr.length > 0);
  if (outCols.length > 0) {
    const totalOut = new Set(outCols.flatMap(([, arr]) => arr.map((o) => o.rowIndex))).size;
    issues.push({
      severity: totalOut > rowCount * 0.05 ? 'warning' : 'info',
      icon: '📈',
      text: `<strong>${totalOut} outlier${totalOut > 1 ? 's' : ''}</strong> detected across ${outCols.length} column${outCols.length > 1 ? 's' : ''}`,
    });
  }

  // Irregular frequency
  if (detectedFrequency === 'irregular') {
    issues.push({
      severity: 'info',
      icon: '📅',
      text: `<strong>Irregular sampling frequency</strong> detected. Consider resampling to a regular grid.`,
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: 'info',
      icon: '✅',
      text: `No significant issues detected. Dataset looks clean!`,
    });
  }

  return issues;
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}
