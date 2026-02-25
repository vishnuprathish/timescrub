/**
 * Generate a Python/pandas script that replicates an operationLog.
 * Each operation type maps to a code template.
 */

const HEADER = (filename, opCount, date) => `# ============================================================
# Timeseries Cleaner — Generated Python Script
# Generated: ${date}
# Source file: ${filename}
# Operations: ${opCount}
# ============================================================
# Requirements: pip install pandas numpy
# Usage: python clean.py
# ============================================================

import pandas as pd
import numpy as np

INPUT_FILE = "${filename}"
OUTPUT_FILE = "cleaned_${filename}"

# --- Load ---
df = pd.read_csv(INPUT_FILE)
print(f"Loaded: {len(df)} rows × {len(df.columns)} columns")
`;

const FOOTER = `
# --- Save ---
df.to_csv(OUTPUT_FILE, index=False)
print(f"Saved: {len(df)} rows × {len(df.columns)} columns → {OUTPUT_FILE}")
`;

/**
 * Map each op type to a Python code template.
 * Template functions receive the operation params.
 */
const TEMPLATES = {
  parse_datetime: ({ column, timezone = 'UTC' }) =>
    `# Parse datetime: ${column}\n` +
    `df["${column}"] = pd.to_datetime(df["${column}"], utc=True)\n` +
    (timezone !== 'UTC' ? `df["${column}"] = df["${column}"].dt.tz_convert("${timezone}")\n` : ''),

  sort_ascending: ({ column }) =>
    `# Sort ascending by ${column}\n` +
    `df = df.sort_values("${column}").reset_index(drop=True)`,

  sort_descending: ({ column }) =>
    `# Sort descending by ${column}\n` +
    `df = df.sort_values("${column}", ascending=False).reset_index(drop=True)`,

  deduplicate_timestamps: ({ column, keep }) =>
    `# Deduplicate timestamps (keep ${keep})\n` +
    `df = df.drop_duplicates(subset=["${column}"], keep="${keep === 'mean' ? 'first' : keep}")` +
    (keep === 'mean' ? `  # Note: for mean aggregation, use groupby instead:\n# df = df.groupby("${column}").mean().reset_index()` : ''),

  impute_ffill: ({ columns }) =>
    `# Forward fill: ${columns.join(', ')}\n` +
    `df[${JSON.stringify(columns)}] = df[${JSON.stringify(columns)}].ffill()`,

  impute_bfill: ({ columns }) =>
    `# Backward fill: ${columns.join(', ')}\n` +
    `df[${JSON.stringify(columns)}] = df[${JSON.stringify(columns)}].bfill()`,

  impute_linear: ({ columns, tsColumn }) => {
    const setIndex = tsColumn ? `df = df.set_index("${tsColumn}")\n` : '';
    const resetIndex = tsColumn ? `df = df.reset_index()\n` : '';
    return (
      `# Linear interpolation: ${columns.join(', ')}\n` +
      setIndex +
      columns.map((c) => `df["${c}"] = df["${c}"].interpolate(method="${tsColumn ? 'time' : 'linear'}")`).join('\n') + '\n' +
      resetIndex
    );
  },

  impute_spline: ({ columns }) =>
    `# Spline interpolation: ${columns.join(', ')}\n` +
    columns.map((c) => `df["${c}"] = df["${c}"].interpolate(method="spline", order=3)`).join('\n'),

  impute_constant: ({ columns, value }) =>
    `# Fill with constant (${value}): ${columns.join(', ')}\n` +
    `df[${JSON.stringify(columns)}] = df[${JSON.stringify(columns)}].fillna(${JSON.stringify(value)})`,

  impute_rolling_mean: ({ columns, window }) =>
    `# Fill with rolling mean (window=${window}): ${columns.join(', ')}\n` +
    columns.map((c) => `df["${c}"] = df["${c}"].fillna(df["${c}"].rolling(${window}, min_periods=1, center=True).mean())`).join('\n'),

  drop_rows_with_nulls: ({ columns }) =>
    columns && columns.length > 0
      ? `# Drop rows with nulls in: ${columns.join(', ')}\ndf = df.dropna(subset=${JSON.stringify(columns)})`
      : `# Drop rows with any null\ndf = df.dropna()`,

  outlier_clip: ({ columns, method, multiplier = 1.5, threshold = 3.0 }) => {
    if (method === 'iqr') {
      return (
        `# Clip outliers (IQR x${multiplier}): ${columns.join(', ')}\n` +
        columns.map((c) =>
          `Q1_${c} = df["${c}"].quantile(0.25)\n` +
          `Q3_${c} = df["${c}"].quantile(0.75)\n` +
          `IQR_${c} = Q3_${c} - Q1_${c}\n` +
          `df["${c}"] = df["${c}"].clip(lower=Q1_${c} - ${multiplier}*IQR_${c}, upper=Q3_${c} + ${multiplier}*IQR_${c})`
        ).join('\n')
      );
    }
    return (
      `# Clip outliers (Z-score >${threshold}): ${columns.join(', ')}\n` +
      columns.map((c) =>
        `mean_${c}, std_${c} = df["${c}"].mean(), df["${c}"].std()\n` +
        `df["${c}"] = df["${c}"].clip(lower=mean_${c}-${threshold}*std_${c}, upper=mean_${c}+${threshold}*std_${c})`
      ).join('\n')
    );
  },

  outlier_replace_nan: ({ columns, method, multiplier = 1.5, threshold = 3.0 }) => {
    if (method === 'iqr') {
      return (
        `# Replace outliers → NaN (IQR x${multiplier}): ${columns.join(', ')}\n` +
        columns.map((c) =>
          `Q1, Q3 = df["${c}"].quantile([0.25, 0.75])\n` +
          `IQR = Q3 - Q1\n` +
          `df.loc[(df["${c}"] < Q1 - ${multiplier}*IQR) | (df["${c}"] > Q3 + ${multiplier}*IQR), "${c}"] = np.nan`
        ).join('\n')
      );
    }
    return (
      `# Replace outliers → NaN (Z-score >${threshold}): ${columns.join(', ')}\n` +
      columns.map((c) =>
        `z_${c} = (df["${c}"] - df["${c}"].mean()) / df["${c}"].std()\n` +
        `df.loc[z_${c}.abs() > ${threshold}, "${c}"] = np.nan`
      ).join('\n')
    );
  },

  outlier_flag: ({ columns, method, multiplier = 1.5 }) =>
    `# Flag outliers: ${columns.join(', ')}\n` +
    columns.map((c) =>
      `Q1, Q3 = df["${c}"].quantile([0.25, 0.75])\n` +
      `IQR = Q3 - Q1\n` +
      `df["${c}_outlier"] = ((df["${c}"] < Q1 - ${multiplier}*IQR) | (df["${c}"] > Q3 + ${multiplier}*IQR)).astype(int)`
    ).join('\n'),

  resample_down: ({ tsColumn, frequency, aggregation = 'mean' }) =>
    `# Downsample to ${frequency} (${aggregation})\n` +
    `df = df.set_index("${tsColumn}")\n` +
    `df.index = pd.to_datetime(df.index)\n` +
    `df = df.resample("${frequency}").${aggregation}().reset_index()`,

  resample_up: ({ tsColumn, frequency, fillMethod = 'ffill' }) =>
    `# Upsample to ${frequency} (${fillMethod})\n` +
    `df = df.set_index("${tsColumn}")\n` +
    `df.index = pd.to_datetime(df.index)\n` +
    `df = df.resample("${frequency}").${fillMethod === 'ffill' ? 'ffill' : fillMethod === 'bfill' ? 'bfill' : 'interpolate'}().reset_index()`,

  smooth_rolling_mean: ({ columns, window, inplace = false, suffix = '_smooth' }) =>
    `# Rolling mean (window=${window}): ${columns.join(', ')}\n` +
    columns.map((c) =>
      inplace
        ? `df["${c}"] = df["${c}"].rolling(${window}, center=True).mean()`
        : `df["${c}${suffix}"] = df["${c}"].rolling(${window}, center=True).mean()`
    ).join('\n'),

  smooth_ewma: ({ columns, alpha, inplace = false, suffix = '_ewma' }) =>
    `# EWMA smoothing (alpha=${alpha}): ${columns.join(', ')}\n` +
    columns.map((c) =>
      inplace
        ? `df["${c}"] = df["${c}"].ewm(alpha=${alpha}).mean()`
        : `df["${c}${suffix}"] = df["${c}"].ewm(alpha=${alpha}).mean()`
    ).join('\n'),

  smooth_savitzky_golay: ({ columns, window, polyOrder = 2, inplace = false, suffix = '_sg' }) =>
    `# Savitzky-Golay (window=${window}, poly=${polyOrder}): ${columns.join(', ')}\n` +
    `from scipy.signal import savgol_filter  # pip install scipy\n` +
    columns.map((c) =>
      inplace
        ? `df["${c}"] = savgol_filter(df["${c}"].fillna(method="ffill"), ${window}, ${polyOrder})`
        : `df["${c}${suffix}"] = savgol_filter(df["${c}"].fillna(method="ffill"), ${window}, ${polyOrder})`
    ).join('\n'),

  rename_column: ({ from, to }) =>
    `# Rename column\ndf = df.rename(columns={"${from}": "${to}"})`,

  drop_column: ({ column }) =>
    `# Drop column: ${column}\ndf = df.drop(columns=["${column}"], errors="ignore")`,

  change_dtype: ({ column, dtype }) => {
    const casts = { numeric: 'float', string: 'str', boolean: 'int' };
    return `# Cast ${column} to ${dtype}\ndf["${column}"] = df["${column}"].astype(${casts[dtype] || dtype})`;
  },

  derive_lag: ({ column, n, outputColumn }) =>
    `# Lag feature: ${column}\ndf["${outputColumn || `${column}_lag${n}`}"] = df["${column}"].shift(${n})`,

  derive_diff: ({ column, n, outputColumn }) =>
    `# Diff feature: ${column}\ndf["${outputColumn || `${column}_diff${n}`}"] = df["${column}"].diff(${n})`,

  derive_pct_change: ({ column, n, outputColumn }) =>
    `# Pct change: ${column}\ndf["${outputColumn || `${column}_pct${n}`}"] = df["${column}"].pct_change(${n}) * 100`,

  derive_rolling_mean: ({ column, window, outputColumn }) =>
    `# Rolling mean: ${column}\ndf["${outputColumn || `${column}_rmean${window}`}"] = df["${column}"].rolling(${window}).mean()`,

  derive_rolling_std: ({ column, window, outputColumn }) =>
    `# Rolling std: ${column}\ndf["${outputColumn || `${column}_rstd${window}`}"] = df["${column}"].rolling(${window}).std()`,

  derive_cumsum: ({ column, outputColumn }) =>
    `# Cumulative sum: ${column}\ndf["${outputColumn || `${column}_cumsum`}"] = df["${column}"].cumsum()`,

  filter_date_range: ({ column, start, end }) =>
    `# Filter date range: ${start} → ${end}\n` +
    `df["${column}"] = pd.to_datetime(df["${column}"])\n` +
    `df = df[(df["${column}"] >= "${start}") & (df["${column}"] <= "${end}")]`,

  filter_value: ({ column, operator, value }) => {
    const ops = { '=': '==', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
    const pyOp = ops[operator] || '==';
    const pyVal = isNaN(Number(value)) ? `"${value}"` : value;
    return `# Filter rows: ${column} ${operator} ${value}\ndf = df[df["${column}"] ${pyOp} ${pyVal}]`;
  },

  filter_drop_nulls: ({ column }) =>
    `# Drop rows where ${column} is null\ndf = df.dropna(subset=["${column}"])`,
};

/**
 * Generate a complete Python script from an operation log.
 * @param {object[]} operationLog
 * @param {string} filename - source filename
 * @returns {string}
 */
export function generatePythonScript(operationLog, filename = 'data.csv') {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [HEADER(filename, operationLog.length, date)];

  operationLog.forEach((entry, i) => {
    const template = TEMPLATES[entry.op];
    if (template) {
      lines.push(`\n# Step ${i + 1}: ${entry.description || entry.name}`);
      lines.push(template(entry.params));
    } else {
      lines.push(`\n# Step ${i + 1}: ${entry.op} (no template available)`);
    }
  });

  lines.push(FOOTER);
  return lines.join('\n');
}
