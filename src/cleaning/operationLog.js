import { v4 as uuidv4 } from 'uuid';

/**
 * Operation type definitions.
 * Each entry describes: the op key, human-readable name, and description template.
 */
export const OP_TYPES = {
  // Timestamp ops
  parse_datetime:        { name: 'Parse Datetime',       category: 'timestamp' },
  sort_ascending:        { name: 'Sort Ascending',        category: 'timestamp' },
  sort_descending:       { name: 'Sort Descending',       category: 'timestamp' },
  deduplicate_timestamps:{ name: 'Deduplicate Timestamps',category: 'timestamp' },
  convert_timezone:      { name: 'Convert Timezone',      category: 'timestamp' },

  // Missing value ops
  impute_ffill:          { name: 'Fill Forward',          category: 'missing' },
  impute_bfill:          { name: 'Fill Backward',         category: 'missing' },
  impute_linear:         { name: 'Linear Interpolation',  category: 'missing' },
  impute_spline:         { name: 'Spline Interpolation',  category: 'missing' },
  impute_constant:       { name: 'Fill with Constant',    category: 'missing' },
  impute_rolling_mean:   { name: 'Fill with Rolling Mean',category: 'missing' },
  drop_rows_with_nulls:  { name: 'Drop Null Rows',        category: 'missing' },

  // Outlier ops
  outlier_clip:          { name: 'Clip Outliers',         category: 'outlier' },
  outlier_replace_nan:   { name: 'Replace Outliers → NaN',category: 'outlier' },
  outlier_replace_rolling:{ name: 'Replace Outliers → Rolling Median', category: 'outlier' },
  outlier_drop:          { name: 'Drop Outlier Rows',     category: 'outlier' },
  outlier_flag:          { name: 'Flag Outliers',         category: 'outlier' },

  // Resample ops
  resample_down:         { name: 'Downsample',            category: 'resample' },
  resample_up:           { name: 'Upsample',              category: 'resample' },

  // Smoothing ops
  smooth_rolling_mean:   { name: 'Rolling Mean',          category: 'smooth' },
  smooth_ewma:           { name: 'EWMA Smoothing',        category: 'smooth' },
  smooth_savitzky_golay: { name: 'Savitzky-Golay',        category: 'smooth' },

  // Column ops
  rename_column:         { name: 'Rename Column',         category: 'columns' },
  drop_column:           { name: 'Drop Column',           category: 'columns' },
  change_dtype:          { name: 'Change Data Type',      category: 'columns' },
  derive_lag:            { name: 'Derive Lag Feature',    category: 'columns' },
  derive_diff:           { name: 'Derive Diff Feature',   category: 'columns' },
  derive_pct_change:     { name: 'Derive % Change',       category: 'columns' },
  derive_rolling_mean:   { name: 'Derive Rolling Mean',   category: 'columns' },
  derive_rolling_std:    { name: 'Derive Rolling Std',    category: 'columns' },
  derive_cumsum:         { name: 'Derive Cumulative Sum', category: 'columns' },

  // Row filter ops
  filter_date_range:     { name: 'Filter Date Range',     category: 'filter' },
  filter_value:          { name: 'Filter by Value',       category: 'filter' },
  filter_drop_nulls:     { name: 'Drop Null Rows (col)',  category: 'filter' },
};

/**
 * Create a new operation entry for the log.
 * @param {string} op - operation key from OP_TYPES
 * @param {object} params - operation parameters
 * @param {string} description - human-readable description (optional)
 */
export function createOperation(op, params, description = '') {
  const type = OP_TYPES[op] || { name: op, category: 'unknown' };
  return {
    id: uuidv4(),
    op,
    params,
    description: description || buildDescription(op, params),
    category: type.category,
    name: type.name,
    appliedAt: null, // set by store when appended
  };
}

/**
 * Build a human-readable description from op and params.
 */
function buildDescription(op, params) {
  switch (op) {
    case 'parse_datetime':
      return `Parse "${params.column}" as datetime (${params.timezone || 'UTC'})`;
    case 'sort_ascending':
    case 'sort_descending':
      return `Sort by "${params.column}" ${op.includes('asc') ? '↑' : '↓'}`;
    case 'deduplicate_timestamps':
      return `Deduplicate timestamps, keep ${params.keep}`;
    case 'convert_timezone':
      return `Convert "${params.column}" to ${params.toTimezone}`;
    case 'impute_ffill':
    case 'impute_bfill':
      return `Fill missing in ${fmtCols(params)} via ${op === 'impute_ffill' ? 'forward' : 'backward'} fill`;
    case 'impute_linear':
      return `Linear interpolation on ${fmtCols(params)}`;
    case 'impute_spline':
      return `Spline interpolation on ${fmtCols(params)}`;
    case 'impute_constant':
      return `Fill missing in ${fmtCols(params)} with ${params.value}`;
    case 'impute_rolling_mean':
      return `Fill missing in ${fmtCols(params)} with rolling mean (window=${params.window})`;
    case 'drop_rows_with_nulls':
      return `Drop rows with nulls in ${params.columns?.length === 0 ? 'any column' : fmtCols(params)}`;
    case 'outlier_clip':
      return `Clip outliers in ${fmtCols(params)} (${params.method}, ${params.threshold ?? params.multiplier})`;
    case 'outlier_replace_nan':
      return `Replace outliers → NaN in ${fmtCols(params)} (${params.method})`;
    case 'outlier_replace_rolling':
      return `Replace outliers → rolling median in ${fmtCols(params)}`;
    case 'outlier_drop':
      return `Drop rows with outliers in ${fmtCols(params)} (${params.method})`;
    case 'outlier_flag':
      return `Flag outliers in ${fmtCols(params)} → "${params.flagColumn || params.column + '_outlier'}"`;
    case 'resample_down':
      return `Downsample to ${params.frequency} (${params.aggregation})`;
    case 'resample_up':
      return `Upsample to ${params.frequency} (fill: ${params.fillMethod})`;
    case 'smooth_rolling_mean':
      return `Rolling mean on ${fmtCols(params)} (window=${params.window})`;
    case 'smooth_ewma':
      return `EWMA on ${fmtCols(params)} (alpha=${params.alpha})`;
    case 'smooth_savitzky_golay':
      return `Savitzky-Golay on ${fmtCols(params)} (window=${params.window}, poly=${params.polyOrder})`;
    case 'rename_column':
      return `Rename "${params.from}" → "${params.to}"`;
    case 'drop_column':
      return `Drop column "${params.column}"`;
    case 'change_dtype':
      return `Cast "${params.column}" to ${params.dtype}`;
    case 'derive_lag':
      return `Derive lag(${params.n}) of "${params.column}" → "${params.outputColumn}"`;
    case 'derive_diff':
      return `Derive diff(${params.n}) of "${params.column}" → "${params.outputColumn}"`;
    case 'derive_pct_change':
      return `Derive pct_change(${params.n}) of "${params.column}" → "${params.outputColumn}"`;
    case 'derive_rolling_mean':
      return `Derive rolling_mean(${params.window}) of "${params.column}" → "${params.outputColumn}"`;
    case 'derive_rolling_std':
      return `Derive rolling_std(${params.window}) of "${params.column}" → "${params.outputColumn}"`;
    case 'derive_cumsum':
      return `Derive cumsum of "${params.column}" → "${params.outputColumn}"`;
    case 'filter_date_range':
      return `Filter rows: ${params.start} → ${params.end}`;
    case 'filter_value':
      return `Filter rows: ${params.column} ${params.operator} ${params.value}`;
    case 'filter_drop_nulls':
      return `Drop rows where "${params.column}" is null`;
    default:
      return op;
  }
}

function fmtCols(params) {
  if (params.columns && params.columns.length > 0) {
    return params.columns.length === 1
      ? `"${params.columns[0]}"`
      : `${params.columns.length} columns`;
  }
  if (params.column) return `"${params.column}"`;
  return 'all columns';
}
