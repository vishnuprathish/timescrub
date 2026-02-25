/**
 * Execute the full cleaning pipeline by replaying an operationLog on a dataset.
 * Each operation calls the appropriate cleaning function.
 */

import { sortByTimestamp, deduplicateTimestamps, normalizeTimestamps, filterDateRange, filterByValue } from './timestampOps.js';
import { ffill, bfill, linearInterpolate, splineInterpolate, fillConstant, fillRollingMean, dropNullRows } from './imputationOps.js';
import { clipOutliers, replaceOutliersWithNull, replaceOutliersWithRollingMedian, dropOutlierRows, flagOutliers } from './outlierOps.js';
import { downsample, upsample } from './resampleOps.js';
import { rollingMean, ewma, savitzkyGolay } from './smoothingOps.js';
import { renameColumn, dropColumns, changeDtype, deriveLag, deriveDiff, derivePctChange, deriveRollingMean, deriveRollingStd, deriveCumsum, dropRowsWhereNull } from './columnOps.js';

/**
 * Apply a single operation to rows.
 * @param {object[]} rows
 * @param {object} operation - { op, params }
 * @returns {object[]} updated rows
 */
export function applyOperation(rows, operation) {
  const { op, params } = operation;

  switch (op) {
    // Timestamp ops
    case 'parse_datetime':
      return normalizeTimestamps(rows, params.column, params.timezone);
    case 'sort_ascending':
      return sortByTimestamp(rows, params.column, 'asc');
    case 'sort_descending':
      return sortByTimestamp(rows, params.column, 'desc');
    case 'deduplicate_timestamps':
      return deduplicateTimestamps(rows, params.column, params.keep);
    case 'convert_timezone':
      return rows; // Timezone conversion applied during normalization; no-op here

    // Imputation ops
    case 'impute_ffill':
      return ffill(rows, params.columns);
    case 'impute_bfill':
      return bfill(rows, params.columns);
    case 'impute_linear':
      return linearInterpolate(rows, params.columns, params.tsColumn);
    case 'impute_spline':
      return splineInterpolate(rows, params.columns);
    case 'impute_constant':
      return fillConstant(rows, params.columns, params.value);
    case 'impute_rolling_mean':
      return fillRollingMean(rows, params.columns, params.window);
    case 'drop_rows_with_nulls':
      return dropNullRows(rows, params.columns || []);

    // Outlier ops
    case 'outlier_clip':
      return clipOutliers(rows, params.columns, params.method, params);
    case 'outlier_replace_nan':
      return replaceOutliersWithNull(rows, params.columns, params.method, params);
    case 'outlier_replace_rolling':
      return replaceOutliersWithRollingMedian(rows, params.columns, params.method, params, params.window);
    case 'outlier_drop':
      return dropOutlierRows(rows, params.columns, params.method, params);
    case 'outlier_flag':
      return flagOutliers(rows, params.columns, params.method, params);

    // Resample ops
    case 'resample_down':
      return downsample(rows, params.tsColumn, params.frequency, params.aggregation, params.numericColumns || []);
    case 'resample_up':
      return upsample(rows, params.tsColumn, params.frequency, params.fillMethod);

    // Smooth ops
    case 'smooth_rolling_mean':
      return rollingMean(rows, params.columns, params.window, params.inplace, params.suffix);
    case 'smooth_ewma':
      return ewma(rows, params.columns, params.alpha, params.inplace, params.suffix);
    case 'smooth_savitzky_golay':
      return savitzkyGolay(rows, params.columns, params.window, params.polyOrder, params.inplace, params.suffix);

    // Column ops
    case 'rename_column':
      return renameColumn(rows, params.from, params.to);
    case 'drop_column':
      return dropColumns(rows, [params.column]);
    case 'change_dtype':
      return changeDtype(rows, params.column, params.dtype);
    case 'derive_lag':
      return deriveLag(rows, params.column, params.n, params.outputColumn);
    case 'derive_diff':
      return deriveDiff(rows, params.column, params.n, params.outputColumn);
    case 'derive_pct_change':
      return derivePctChange(rows, params.column, params.n, params.outputColumn);
    case 'derive_rolling_mean':
      return deriveRollingMean(rows, params.column, params.window, params.outputColumn);
    case 'derive_rolling_std':
      return deriveRollingStd(rows, params.column, params.window, params.outputColumn);
    case 'derive_cumsum':
      return deriveCumsum(rows, params.column, params.outputColumn);

    // Filter ops
    case 'filter_date_range':
      return filterDateRange(rows, params.column, params.start, params.end);
    case 'filter_value':
      return filterByValue(rows, params.column, params.operator, params.value);
    case 'filter_drop_nulls':
      return dropRowsWhereNull(rows, params.column);

    default:
      console.warn(`Unknown operation: ${op}`);
      return rows;
  }
}

/**
 * Replay a full operation log on a dataset.
 * @param {object[]} rawRows - original data
 * @param {object[]} operationLog - ordered list of operations
 * @returns {object[]}
 */
export function replayPipeline(rawRows, operationLog) {
  return operationLog.reduce((rows, op) => applyOperation(rows, op), rawRows);
}
