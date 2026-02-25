# Workflow: Timeseries Data Cleaning

## Objective

Clean a timeseries dataset — fix timestamps, fill gaps, remove outliers, resample, and export — entirely in the browser. For files too large for browser processing, generate Python/R scripts that run locally.

## Inputs

| Input | Description |
|---|---|
| File | CSV, TSV, Excel (.xlsx/.xls), JSON, JSON Lines |
| Timestamp column | User-selected or auto-detected |
| Timezone | Optional; defaults to UTC |

## File Size Thresholds

| Format | Threshold | Behavior above threshold |
|---|---|---|
| CSV / TSV | 50 MB | Large file mode: parse 10k-row sample for profiling; generate scripts |
| Excel | 20 MB | Large file mode |
| JSON | 30 MB | Large file mode |
| JSON Lines | 75 MB | Large file mode |

## Tools Used

| Step | Tool / Module |
|---|---|
| CSV parse | `src/ingestion/csvParser.js` (Papa Parse streaming) |
| Excel parse | `src/ingestion/excelParser.js` (SheetJS) |
| JSON parse | `src/ingestion/jsonParser.js` |
| Column profiling | `src/profiling/columnStats.js` |
| Frequency detection | `src/profiling/frequencyDetector.js` |
| Gap detection | `src/profiling/gapDetector.js` |
| Outlier detection | `src/profiling/outlierDetector.js` |
| Quality scoring | `src/profiling/qualityScore.js` |
| Cleaning pipeline | `src/cleaning/pipeline.js` |
| Python script gen | `src/export/pythonScriptGen.js` |
| R script gen | `src/export/rScriptGen.js` |

## UX Flow

```
1. Upload (FileUpload.jsx)
   → Detect file type and size
   → If large: set largeFileMode = true
   → Auto-detect delimiter (CSV)

2. Parse Config (ParseConfigPanel.jsx)
   → Show first 20 rows preview
   → Auto-suggest timestamp column
   → User confirms settings → click Parse

3. Profiling (runs after parse)
   → computeColumnStats: null%, dtype, min/max/mean/std per column
   → detectFrequency: mode-of-diffs on sorted timestamps
   → detectGaps: intervals > 1.5× median frequency
   → detectDuplicates: exact timestamp matches
   → detectOutliers: IQR by default on numeric columns
   → computeQualityScore: composite 0–100

4. Workspace (Workspace.jsx)
   → Overview tab: stats + quality score + issues
   → Plot tab: Plotly time series with before/after
   → Quality tab: gap timeline + null heatmap + ACF
   → Columns tab: rename/drop/derive
   → Log tab: operation history with undo

5. Cleaning (OperationsPanel.jsx)
   → User configures operations in left sidebar
   → Each "Apply" button calls applyOp()
   → applyOp: creates operation → replays full pipeline on rawData → updates cleanedData + columns + profiling
   → operationLog grows; undo removes entry and replays

6. Export (ExportPanel.jsx)
   → Download cleaned data: CSV / Excel / JSON
   → Download Python script (clean.py)
   → Download R script (clean.R)
   → Download operation log JSON
   → Download quality report JSON
```

## Operation Log Schema

Every cleaning step produces a log entry:
```js
{
  id: uuid,
  op: 'impute_linear',   // op type key (see operationLog.js OP_TYPES)
  params: { columns: ['temp'], tsColumn: 'timestamp' },
  description: 'Linear interpolation on "temp"',
  category: 'missing',
  name: 'Linear Interpolation',
  appliedAt: 1700000000000
}
```

The operation log is the source of truth for:
- Undo (remove entry, replay remaining)
- Script generation (template map in pythonScriptGen.js / rScriptGen.js)
- Replay (load JSON log → replayPipeline)

## Supported Operations

### Timestamp
- `parse_datetime` — Normalize to ISO 8601
- `sort_ascending` / `sort_descending`
- `deduplicate_timestamps` — keep first/last/mean/max/min

### Missing Values
- `impute_ffill`, `impute_bfill`
- `impute_linear` — time-weighted linear interpolation
- `impute_spline` — cubic Hermite spline
- `impute_constant` — fill with a fixed value
- `impute_rolling_mean`
- `drop_rows_with_nulls`

### Outliers
- `outlier_clip` — clip to IQR or Z-score fence
- `outlier_replace_nan` — replace with NaN (then impute)
- `outlier_replace_rolling` — replace with rolling median
- `outlier_drop` — remove rows
- `outlier_flag` — add boolean flag column

### Resample
- `resample_down` — downsample with mean/sum/min/max/first/last/median
- `resample_up` — upsample with ffill/bfill/linear fill

### Smooth
- `smooth_rolling_mean`
- `smooth_ewma` — exponentially weighted moving average
- `smooth_savitzky_golay` — polynomial smoothing

### Columns
- `rename_column`, `drop_column`, `change_dtype`
- `derive_lag`, `derive_diff`, `derive_pct_change`
- `derive_rolling_mean`, `derive_rolling_std`, `derive_cumsum`

### Filter
- `filter_date_range`, `filter_value`, `filter_drop_nulls`

## Frequency String Format

Resample and frequency fields accept strings like:
- `1sec`, `5sec`, `30sec`
- `1min`, `5min`, `15min`, `30min`
- `1H`, `2H`, `4H`, `6H`, `12H`
- `1D`, `2D`, `1W`
- `1M`, `1Y`

## Edge Cases & Known Constraints

| Situation | Behavior |
|---|---|
| No timestamp column | Outlier/imputation ops still work; gap/frequency detection disabled |
| All-null column | Imputation ops skip gracefully |
| Very large XLSX | Prompt user to use CSV export from Excel first |
| Duplicate timestamp with `keep=mean` | Numeric columns averaged; string columns take first value |
| Spline with < 2 known points | Falls back to linear interpolation |
| Savitzky-Golay with window > data length | Reduces window to fit |
| ACF on non-stationary series | Interpret with caution; always differences before ACF |

## Deployment

### GitHub Pages
```bash
npm run build
# Push /dist contents to gh-pages branch
```

### Netlify
Push to main branch. `netlify.toml` handles build command and CORS headers.

### Dev
```bash
npm run dev  # Vite dev server at http://localhost:5173
```
