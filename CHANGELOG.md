# Changelog

All notable changes to TimeScrub are documented here.

---

## [Unreleased]

### Added
- **Parquet export** via DuckDB-WASM — export cleaned data as `.parquet` (Snappy-compressed) entirely in the browser, no server required
- **How it works** section on the landing page — 3-step visual explanation of the Upload → Profile → Clean/Export workflow

---

## [0.3.0] — 2026-02-25

### Added
- **Stationarity test (ADF)** — per-column Augmented Dickey-Fuller test in the Quality tab; shows ADF statistic, approximate p-value, and verdict (Stationary / Borderline / Non-stationary) using MacKinnon 1994 critical values
- **Correlation heatmap** — Pearson correlation matrix for all numeric columns, displayed as a Plotly RdBu heatmap in the Quality tab; handles nulls via pairwise complete observations
- **Seasonality detection** — FFT-based dominant period detection (Cooley-Tukey); result shown as a sub-line in the Frequency stat card on the Overview tab (e.g. "↺ daily")
- **Distribution plots** — histogram + box plot per numeric column in the Quality tab with before/after overlay toggle when cleaning operations have been applied

---

## [0.2.0] — 2026-02-20

### Added
- **Feedback widget** — Tally-powered feedback button in the workspace header and upload page; tracks open/submit events in Plausible
- **4 color themes** — Light (default), Dark, Midnight, Mocha; persisted in localStorage with anti-flash script
- **Plausible Analytics** — privacy-first, cookie-free event tracking for all major interactions (upload, parse, operations, exports, tab views, feedback)

---

## [0.1.0] — 2026-02-15

### Initial release

#### Ingestion
- Drag-and-drop + click file upload; paste CSV mode
- Formats: CSV/TSV (auto-detects delimiter), Excel (.xlsx/.xls), JSON, JSON Lines
- Auto-detects timestamp column, sampling frequency, and timezone
- Parse config panel: override delimiter, header, timestamp column, timezone
- 4 built-in sample datasets: sensor, weather, OHLCV, IoT with gaps
- Large file mode (>50 MB CSV / >20 MB Excel): parses a 10k-row sample for profiling, generates full scripts for local execution

#### Profiling
- Per-column stats: dtype, null%, unique count, min/max/mean/std/quartiles
- Frequency detection (mode of timestamp diffs → "hourly", "daily", "irregular", etc.)
- Gap detection relative to detected frequency
- Duplicate timestamp detection
- Outlier detection: IQR, Z-score, MAD, rolling Z-score
- Data quality score (0–100): completeness, regularity, outlier density, duplicate rate

#### Cleaning operations
- **Timestamp**: sort, deduplicate (keep first/last/mean)
- **Missing values**: forward fill, backward fill, linear interpolation, spline, constant fill, rolling mean, drop rows
- **Outliers**: clip to IQR/Z-score fence, replace with NaN, replace with rolling median, drop rows, flag-only column
- **Resample**: downsample (mean/sum/min/max/first/last), upsample + fill method
- **Smoothing**: rolling mean, EWMA, Savitzky-Golay
- **Columns**: rename, drop, type cast, derive (lag, diff, pct_change, rolling_mean, rolling_std, cumsum)
- Full operation log with per-operation undo

#### Visualization
- Multi-column time series plot (Plotly, WebGL scattergl): before/after toggle, outlier markers, gap shading
- Null heatmap (columns × time buckets)
- Gap timeline with gap list
- ACF (autocorrelation) plot with confidence intervals
- Quality score ring + dimension bars
- Column statistics table

#### Export
- Cleaned data: CSV, Excel (.xlsx), JSON
- Python (pandas) and R (tidyverse/zoo) cleaning scripts generated from operation log
- Operation log JSON (replayable)
- Quality report JSON
- Print-to-PDF quality dashboard

#### Infrastructure
- 100% browser-based, no backend, no login, no data ever leaves your machine
- Deployed on Netlify with COOP/COEP headers for SharedArrayBuffer support
- Privacy-first analytics via Plausible (no cookies)
- SEO: Open Graph, JSON-LD WebApplication schema, sitemap, robots.txt
