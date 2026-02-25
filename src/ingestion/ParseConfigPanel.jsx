import React, { useState, useEffect, useCallback } from 'react';
import useStore from '../store/store.js';
import { trackParseComplete, trackLargeFile, trackParseError } from '../analytics.js';
import { parseCSV, LARGE_FILE_SAMPLE_ROWS } from './csvParser.js';
import { parseExcel } from './excelParser.js';
import { parseJSON } from './jsonParser.js';
import { computeColumnStats, detectDatetimeColumns, estimateMemory } from '../profiling/columnStats.js';
import { detectFrequency, extractTimestamps } from '../profiling/frequencyDetector.js';
import { detectGaps, detectDuplicates } from '../profiling/gapDetector.js';
import { detectOutliers } from '../profiling/outlierDetector.js';
import { computeQualityScore } from '../profiling/qualityScore.js';

export default function ParseConfigPanel() {
  const {
    ui, parseConfig, setUI, setParseConfig, setRawData, setColumns, setProfiling, addToast, reset
  } = useStore();

  const [preview, setPreview] = useState([]);
  const [previewCols, setPreviewCols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dtCandidates, setDtCandidates] = useState([]);

  const file = ui._pendingFile;

  // Generate preview on mount / delimiter change
  useEffect(() => {
    if (!file) return;
    generatePreview();
  }, [file, parseConfig.delimiter, parseConfig.hasHeader]);

  async function generatePreview() {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let result;
      if (['csv', 'tsv'].includes(ext)) {
        result = await parseCSV(file, { delimiter: parseConfig.delimiter, hasHeader: parseConfig.hasHeader, maxRows: 20 });
      } else if (['xlsx', 'xls'].includes(ext)) {
        result = await parseExcel(file, { hasHeader: parseConfig.hasHeader, maxRows: 20 });
      } else {
        result = await parseJSON(file, { maxRows: 20 });
      }

      setPreview(result.data);
      const cols = result.meta.fields.map((name) => ({ name }));
      setPreviewCols(cols);

      const candidates = detectDatetimeColumns(cols, result.data);
      setDtCandidates(candidates);
      if (candidates.length > 0 && !parseConfig.timestampColumn) {
        setParseConfig({ timestampColumn: candidates[0] });
      }
    } catch (err) {
      console.error('Preview error:', err);
    }
  }

  async function handleParse() {
    if (!file) return;
    setLoading(true);
    setUI({ isLoading: true, loadingMessage: 'Parsing file…', progress: null });

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const maxRows = ui.largeFileMode ? LARGE_FILE_SAMPLE_ROWS : undefined;

      let result;
      if (['csv', 'tsv'].includes(ext)) {
        result = await parseCSV(file, { delimiter: parseConfig.delimiter, hasHeader: parseConfig.hasHeader, maxRows },
          (p) => setUI({ progress: p * 0.5 })
        );
      } else if (['xlsx', 'xls'].includes(ext)) {
        result = await parseExcel(file, { hasHeader: parseConfig.hasHeader, maxRows });
      } else {
        result = await parseJSON(file, { maxRows });
      }

      const rows = result.data;
      const cols = result.meta.fields.map((name) => ({ name, dtype: 'string' }));

      setUI({ loadingMessage: 'Profiling dataset…', progress: 55 });

      // Column stats
      const columnStats = computeColumnStats(rows, cols);

      // Update column dtypes from stats
      columnStats.forEach((s, i) => { cols[i].dtype = s.dtype; });

      // Frequency / gap / duplicate detection
      const tsCol = parseConfig.timestampColumn;
      const timestamps = tsCol ? extractTimestamps(rows, tsCol) : [];
      const freqResult = detectFrequency(timestamps);
      const gaps = tsCol && freqResult.medianMs
        ? detectGaps(timestamps, freqResult.medianMs)
        : [];
      const duplicates = tsCol ? detectDuplicates(rows, tsCol) : [];

      // Outlier detection on numeric columns
      const numericCols = columnStats.filter((s) => s.dtype === 'numeric');
      const outliers = {};
      for (const col of numericCols.slice(0, 10)) { // limit to 10 cols for speed
        const vals = rows.map((r) => r[col.name]);
        outliers[col.name] = detectOutliers(vals, { method: 'iqr' });
      }

      setUI({ progress: 85 });

      const timeRange = timestamps.length > 0
        ? { min: new Date(Math.min(...timestamps)), max: new Date(Math.max(...timestamps)) }
        : { min: null, max: null };

      const { score, dimensions } = computeQualityScore({
        columnStats,
        regularity: freqResult.regularity,
        outliers,
        duplicates,
        rowCount: rows.length,
      });

      setProfiling({
        rowCount: rows.length,
        columnCount: cols.length,
        memoryEstimateBytes: estimateMemory(rows, cols),
        timeRange,
        detectedFrequency: freqResult.label,
        detectedFrequencyMs: freqResult.medianMs,
        columnStats,
        gaps,
        duplicates,
        outliers,
        qualityScore: score,
        qualityDimensions: dimensions,
      });

      setColumns(cols);
      setRawData(rows);

      trackParseComplete(rows.length, cols.length, freqResult.label, !!tsCol);
      if (ui.largeFileMode) trackLargeFile(fileExt, file.size);

      setUI({
        isLoading: false,
        progress: 100,
        parseStep: 'workspace',
        activeTab: 'overview',
      });

      addToast('success', `Loaded ${rows.length.toLocaleString()} rows × ${cols.length} columns`);
    } catch (err) {
      console.error('Parse error:', err);
      trackParseError(fileExt, err.message);
      setUI({ isLoading: false, progress: null });
      addToast('error', `Parse failed: ${err.message}`);
      setLoading(false);
    }
  }

  const fileExt = file?.name.split('.').pop().toLowerCase();
  const isCSV = ['csv', 'tsv'].includes(fileExt);

  return (
    <div className="parse-config-page">
      <div className="parse-config-container">
        <div className="parse-config-header">
          <button className="btn btn-ghost btn-sm" onClick={() => reset()}>← Back</button>
          <div className="parse-filename">{ui.filename}</div>
          <div className="parse-filesize text-muted text-xs">
            {(ui.fileSize / 1024 / 1024).toFixed(1)} MB
            {ui.largeFileMode && <span className="badge badge-warning ml-2">Large file — sample only</span>}
          </div>
        </div>

        {ui.largeFileMode && (
          <div className="large-file-banner">
            <span className="banner-icon">⚠</span>
            <div>
              <strong>Large file detected</strong>
              <div className="banner-text">
                This file exceeds the browser processing limit. We'll parse a sample of{' '}
                <strong>{LARGE_FILE_SAMPLE_ROWS.toLocaleString()} rows</strong> for profiling.
                After you configure your cleaning steps, we'll generate Python and R scripts
                to process the full file on your machine.
              </div>
            </div>
          </div>
        )}

        <div className="parse-config-body">
          {/* Config controls */}
          <div className="parse-config-controls">
            <h3 className="mb-3">Parse Settings</h3>

            {isCSV && (
              <div className="form-row">
                <label>Delimiter</label>
                <select
                  value={parseConfig.delimiter}
                  onChange={(e) => setParseConfig({ delimiter: e.target.value })}
                >
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab (\t)</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
            )}

            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={parseConfig.hasHeader}
                  onChange={(e) => setParseConfig({ hasHeader: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                First row is header
              </label>
            </div>

            <div className="form-row">
              <label>Timestamp Column</label>
              <select
                value={parseConfig.timestampColumn || ''}
                onChange={(e) => setParseConfig({ timestampColumn: e.target.value || null })}
              >
                <option value="">(none)</option>
                {previewCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}{dtCandidates[0] === c.name ? ' ★' : ''}
                  </option>
                ))}
              </select>
              <div className="text-xs text-muted mt-1">★ = auto-detected candidate</div>
            </div>

            <div className="form-row">
              <label>Timezone</label>
              <select
                value={parseConfig.timezone}
                onChange={(e) => setParseConfig({ timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <button
                className="btn btn-primary btn-full"
                onClick={handleParse}
                disabled={loading}
              >
                {loading ? 'Parsing…' : ui.largeFileMode ? 'Parse Sample & Continue' : 'Parse File'}
              </button>
            </div>
          </div>

          {/* Data preview */}
          <div className="parse-preview">
            <div className="section-title">Preview (first 20 rows)</div>
            {preview.length > 0 ? (
              <div className="data-table-wrap" style={{ maxHeight: 320 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {previewCols.map((c) => (
                        <th key={c.name}>
                          {c.name}
                          {c.name === parseConfig.timestampColumn && (
                            <span className="badge badge-accent" style={{ marginLeft: 4 }}>ts</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        {previewCols.map((c) => (
                          <td key={c.name} className={row[c.name] == null || row[c.name] === '' ? 'null-cell' : ''}>
                            {row[c.name] == null || row[c.name] === '' ? 'null' : String(row[c.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <div>Loading preview…</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="parse-loading-overlay">
          <div className="parse-loading-box">
            <div className="parse-loading-msg">{ui.loadingMessage || 'Parsing…'}</div>
            <div className="progress-bar-wrap" style={{ width: 280 }}>
              <div
                className={`progress-bar-fill ${ui.progress === null ? 'indeterminate' : ''}`}
                style={ui.progress !== null ? { width: `${ui.progress}%` } : {}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Sydney', 'Pacific/Auckland',
];
