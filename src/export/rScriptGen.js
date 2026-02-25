/**
 * Generate an R (tidyverse/zoo/lubridate) script from an operationLog.
 */

const HEADER = (filename, opCount, date) => `# ============================================================
# Timeseries Cleaner — Generated R Script
# Generated: ${date}
# Source file: ${filename}
# Operations: ${opCount}
# ============================================================
# Requirements:
#   install.packages(c("tidyverse", "lubridate", "zoo", "xts"))
# Usage: Rscript clean.R
# ============================================================

library(dplyr)
library(lubridate)
library(zoo)
library(tidyr)

INPUT_FILE <- "${filename}"
OUTPUT_FILE <- paste0("cleaned_", "${filename}")

# --- Load ---
df <- read.csv(INPUT_FILE, stringsAsFactors = FALSE)
cat(sprintf("Loaded: %d rows × %d columns\\n", nrow(df), ncol(df)))
`;

const FOOTER = `
# --- Save ---
write.csv(df, OUTPUT_FILE, row.names = FALSE)
cat(sprintf("Saved: %d rows × %d columns → %s\\n", nrow(df), ncol(df), OUTPUT_FILE))
`;

const TEMPLATES = {
  parse_datetime: ({ column, timezone = 'UTC' }) =>
    `# Parse datetime: ${column}\n` +
    `df$${safeCol(column)} <- ymd_hms(df$${safeCol(column)}, tz = "${timezone}")`,

  sort_ascending: ({ column }) =>
    `# Sort ascending by ${column}\ndf <- df %>% arrange(${safeCol(column)})`,

  sort_descending: ({ column }) =>
    `# Sort descending by ${column}\ndf <- df %>% arrange(desc(${safeCol(column)}))`,

  deduplicate_timestamps: ({ column, keep }) => {
    if (keep === 'first') return `# Deduplicate (keep first)\ndf <- df %>% distinct(${safeCol(column)}, .keep_all = TRUE)`;
    if (keep === 'last') return `# Deduplicate (keep last)\ndf <- df %>% group_by(${safeCol(column)}) %>% slice_tail(n=1) %>% ungroup()`;
    if (keep === 'mean') return `# Deduplicate (keep mean)\ndf <- df %>% group_by(${safeCol(column)}) %>% summarise(across(where(is.numeric), mean, na.rm=TRUE)) %>% ungroup()`;
    return `# Deduplicate (keep max)\ndf <- df %>% group_by(${safeCol(column)}) %>% summarise(across(where(is.numeric), max, na.rm=TRUE)) %>% ungroup()`;
  },

  impute_ffill: ({ columns }) =>
    `# Forward fill: ${columns.join(', ')}\n` +
    columns.map((c) => `df$${safeCol(c)} <- na.locf(df$${safeCol(c)}, na.rm = FALSE)`).join('\n'),

  impute_bfill: ({ columns }) =>
    `# Backward fill: ${columns.join(', ')}\n` +
    columns.map((c) => `df$${safeCol(c)} <- na.locf(df$${safeCol(c)}, fromLast = TRUE, na.rm = FALSE)`).join('\n'),

  impute_linear: ({ columns }) =>
    `# Linear interpolation: ${columns.join(', ')}\n` +
    columns.map((c) => `df$${safeCol(c)} <- na.approx(df$${safeCol(c)}, na.rm = FALSE)`).join('\n'),

  impute_spline: ({ columns }) =>
    `# Spline interpolation: ${columns.join(', ')}\n` +
    columns.map((c) => `df$${safeCol(c)} <- na.spline(df$${safeCol(c)})`).join('\n'),

  impute_constant: ({ columns, value }) =>
    `# Fill with constant (${value}): ${columns.join(', ')}\n` +
    columns.map((c) => `df$${safeCol(c)}[is.na(df$${safeCol(c)})] <- ${isNaN(Number(value)) ? `"${value}"` : value}`).join('\n'),

  impute_rolling_mean: ({ columns, window }) =>
    `# Fill with rolling mean (window=${window}): ${columns.join(', ')}\n` +
    columns.map((c) =>
      `df$${safeCol(c)} <- ifelse(is.na(df$${safeCol(c)}),\n` +
      `  rollmean(df$${safeCol(c)}, ${window}, fill=NA, na.rm=TRUE, align="center"),\n` +
      `  df$${safeCol(c)})`
    ).join('\n'),

  drop_rows_with_nulls: ({ columns }) =>
    columns && columns.length > 0
      ? `# Drop rows with nulls in: ${columns.join(', ')}\ndf <- df %>% drop_na(${columns.map(safeCol).join(', ')})`
      : `# Drop rows with any null\ndf <- df %>% drop_na()`,

  outlier_clip: ({ columns, method = 'iqr', multiplier = 1.5, threshold = 3.0 }) => {
    if (method === 'iqr') {
      return columns.map((c) =>
        `# Clip outliers (IQR): ${c}\n` +
        `q <- quantile(df$${safeCol(c)}, c(0.25, 0.75), na.rm=TRUE)\n` +
        `iqr <- q[2] - q[1]\n` +
        `df$${safeCol(c)} <- pmin(pmax(df$${safeCol(c)}, q[1]-${multiplier}*iqr), q[2]+${multiplier}*iqr)`
      ).join('\n');
    }
    return columns.map((c) =>
      `# Clip outliers (Z-score): ${c}\n` +
      `m <- mean(df$${safeCol(c)}, na.rm=TRUE); s <- sd(df$${safeCol(c)}, na.rm=TRUE)\n` +
      `df$${safeCol(c)} <- pmin(pmax(df$${safeCol(c)}, m-${threshold}*s), m+${threshold}*s)`
    ).join('\n');
  },

  outlier_replace_nan: ({ columns, method = 'iqr', multiplier = 1.5 }) =>
    columns.map((c) =>
      `# Replace outliers → NA: ${c}\n` +
      `q <- quantile(df$${safeCol(c)}, c(0.25, 0.75), na.rm=TRUE)\n` +
      `iqr <- q[2] - q[1]\n` +
      `df$${safeCol(c)}[df$${safeCol(c)} < q[1]-${multiplier}*iqr | df$${safeCol(c)} > q[2]+${multiplier}*iqr] <- NA`
    ).join('\n'),

  outlier_flag: ({ columns, multiplier = 1.5 }) =>
    columns.map((c) =>
      `# Flag outliers: ${c}\n` +
      `q <- quantile(df$${safeCol(c)}, c(0.25, 0.75), na.rm=TRUE)\n` +
      `iqr <- q[2] - q[1]\n` +
      `df$${safeCol(c)}_outlier <- as.integer(df$${safeCol(c)} < q[1]-${multiplier}*iqr | df$${safeCol(c)} > q[2]+${multiplier}*iqr)`
    ).join('\n'),

  resample_down: ({ tsColumn, frequency, aggregation = 'mean' }) =>
    `# Downsample to ${frequency} (${aggregation})\n` +
    `# Note: requires xts package for resampling\nlibrary(xts)\n` +
    `ts_xts <- xts(df[,!names(df) %in% "${tsColumn}"], order.by=as.POSIXct(df$${safeCol(tsColumn)}))\n` +
    `ts_resampled <- apply.${resamplePeriod(frequency)}(ts_xts, ${aggregation})\n` +
    `df <- data.frame(${tsColumn}=index(ts_resampled), coredata(ts_resampled))`,

  smooth_rolling_mean: ({ columns, window, inplace = false, suffix = '_smooth' }) =>
    columns.map((c) =>
      `# Rolling mean (window=${window}): ${c}\n` +
      `df$${inplace ? safeCol(c) : safeCol(c) + suffix} <- rollmean(df$${safeCol(c)}, ${window}, fill=NA, align="center")`
    ).join('\n'),

  smooth_ewma: ({ columns, alpha, inplace = false, suffix = '_ewma' }) =>
    columns.map((c) =>
      `# EWMA (alpha=${alpha}): ${c}\n` +
      `df$${inplace ? safeCol(c) : safeCol(c) + suffix} <- as.numeric(EMA(df$${safeCol(c)}, n=round(2/${alpha}-1)))`
    ).join('\n'),

  rename_column: ({ from, to }) =>
    `# Rename column\ndf <- df %>% rename(${safeCol(to)} = ${safeCol(from)})`,

  drop_column: ({ column }) =>
    `# Drop column: ${column}\ndf$${safeCol(column)} <- NULL`,

  derive_lag: ({ column, n, outputColumn }) =>
    `# Lag feature: ${column}\ndf$${safeCol(outputColumn || `${column}_lag${n}`)} <- lag(df$${safeCol(column)}, ${n})`,

  derive_diff: ({ column, n, outputColumn }) =>
    `# Diff feature: ${column}\ndf$${safeCol(outputColumn || `${column}_diff${n}`)} <- c(rep(NA, ${n}), diff(df$${safeCol(column)}, lag=${n}))`,

  derive_pct_change: ({ column, n, outputColumn }) =>
    `# Pct change: ${column}\n` +
    `df$${safeCol(outputColumn || `${column}_pct${n}`)} <- c(rep(NA, ${n}), diff(df$${safeCol(column)}, lag=${n}) / head(df$${safeCol(column)}, -${n}) * 100)`,

  derive_rolling_mean: ({ column, window, outputColumn }) =>
    `# Rolling mean: ${column}\ndf$${safeCol(outputColumn || `${column}_rmean${window}`)} <- rollmean(df$${safeCol(column)}, ${window}, fill=NA)`,

  derive_rolling_std: ({ column, window, outputColumn }) =>
    `# Rolling std: ${column}\ndf$${safeCol(outputColumn || `${column}_rstd${window}`)} <- rollapply(df$${safeCol(column)}, ${window}, sd, fill=NA)`,

  derive_cumsum: ({ column, outputColumn }) =>
    `# Cumulative sum: ${column}\ndf$${safeCol(outputColumn || `${column}_cumsum`)} <- cumsum(ifelse(is.na(df$${safeCol(column)}), 0, df$${safeCol(column)}))`,

  filter_date_range: ({ column, start, end }) =>
    `# Filter date range\ndf$${safeCol(column)} <- as.POSIXct(df$${safeCol(column)})\n` +
    `df <- df %>% filter(${safeCol(column)} >= as.POSIXct("${start}") & ${safeCol(column)} <= as.POSIXct("${end}"))`,

  filter_value: ({ column, operator, value }) => {
    const rVal = isNaN(Number(value)) ? `"${value}"` : value;
    return `# Filter rows: ${column} ${operator} ${value}\ndf <- df %>% filter(${safeCol(column)} ${operator} ${rVal})`;
  },

  filter_drop_nulls: ({ column }) =>
    `# Drop rows where ${column} is NA\ndf <- df %>% drop_na(${safeCol(column)})`,
};

/**
 * Generate complete R script.
 */
export function generateRScript(operationLog, filename = 'data.csv') {
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

/** Sanitize a column name for use as R variable (replace spaces/dots with underscores). */
function safeCol(name) {
  if (!name) return 'col';
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Map a frequency string to an xts apply.X period name. */
function resamplePeriod(freq) {
  if (/D/i.test(freq)) return 'daily';
  if (/W/i.test(freq)) return 'weekly';
  if (/M/i.test(freq)) return 'monthly';
  if (/H/i.test(freq)) return 'hourly';
  return 'minutes';
}
