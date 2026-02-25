import React, { useState } from 'react';
import useStore from '../store/store.js';
import { createOperation } from '../cleaning/operationLog.js';
import { trackOperation } from '../analytics.js';
import { replayPipeline } from '../cleaning/pipeline.js';
import { computeColumnStats } from '../profiling/columnStats.js';
import { detectFrequency, extractTimestamps } from '../profiling/frequencyDetector.js';
import { detectGaps, detectDuplicates } from '../profiling/gapDetector.js';
import { detectOutliers } from '../profiling/outlierDetector.js';
import { computeQualityScore } from '../profiling/qualityScore.js';

// Re-run profiling on the cleaned dataset after each apply
function reprofiling(rows, columns, tsCol, existingProfiling) {
  const columnStats = computeColumnStats(rows, columns);
  const timestamps = tsCol ? extractTimestamps(rows, tsCol) : [];
  const freq = detectFrequency(timestamps);
  const gaps = tsCol && freq.medianMs ? detectGaps(timestamps, freq.medianMs) : [];
  const duplicates = tsCol ? detectDuplicates(rows, tsCol) : [];
  const numericCols = columnStats.filter((s) => s.dtype === 'numeric');
  const outliers = {};
  for (const col of numericCols.slice(0, 10)) {
    outliers[col.name] = detectOutliers(rows.map((r) => r[col.name]), { method: 'iqr' });
  }
  const timeRange = timestamps.length > 0
    ? { min: new Date(Math.min(...timestamps)), max: new Date(Math.max(...timestamps)) }
    : existingProfiling.timeRange;
  const { score, dimensions } = computeQualityScore({ columnStats, regularity: freq.regularity, outliers, duplicates, rowCount: rows.length });
  return { ...existingProfiling, columnStats, gaps, duplicates, outliers, qualityScore: score, qualityDimensions: dimensions, timeRange, detectedFrequency: freq.label, detectedFrequencyMs: freq.medianMs };
}

function SectionHeader({ title, badge, badgeVariant = 'accent', open, onToggle }) {
  return (
    <div className={`op-section-header ${open ? 'open' : ''}`} onClick={onToggle}>
      <span>{title}</span>
      {badge != null && <span className={`op-section-badge ${badgeVariant}`}>{badge}</span>}
      <span className="section-chevron">▶</span>
    </div>
  );
}

function ColMultiSelect({ columns, selected, onChange }) {
  return (
    <div className="col-select-wrap">
      {columns.map((c) => (
        <label key={c.name} className="col-select-item">
          <input
            type="checkbox"
            checked={selected.includes(c.name)}
            onChange={(e) => {
              if (e.target.checked) onChange([...selected, c.name]);
              else onChange(selected.filter((s) => s !== c.name));
            }}
          />
          <span className="text-mono">{c.name}</span>
          <span className="text-muted text-xs">({c.dtype})</span>
        </label>
      ))}
    </div>
  );
}

export default function OperationsPanel() {
  const {
    rawData, cleanedData, columns, profiling, parseConfig, operationLog,
    setCleanedData, setProfiling, setColumns, appendOperation, setUI, addToast, ui
  } = useStore();

  const tsCol = parseConfig.timestampColumn;
  const numericCols = columns.filter((c) => c.dtype === 'numeric');
  const open = ui.sidebarSection;
  const setOpen = (section, val) => useStore.getState().setSidebarSection(section, val);

  // --- Timestamp section state ---
  const [tsDedupeKeep, setTsDedupeKeep] = useState('last');

  // --- Missing section state ---
  const [imputeSelectedCols, setImputeSelectedCols] = useState([]);
  const [imputeStrategy, setImputeStrategy] = useState('linear');
  const [imputeConstVal, setImputeConstVal] = useState('0');
  const [imputeWindow, setImputeWindow] = useState(5);

  // --- Outlier section state ---
  const [outCols, setOutCols] = useState([]);
  const [outMethod, setOutMethod] = useState('iqr');
  const [outMultiplier, setOutMultiplier] = useState(1.5);
  const [outThreshold, setOutThreshold] = useState(3.0);
  const [outAction, setOutAction] = useState('clip');

  // --- Resample section state ---
  const [resFreq, setResFreq] = useState('1H');
  const [resDirection, setResDirection] = useState('down');
  const [resAgg, setResAgg] = useState('mean');
  const [resFill, setResFill] = useState('ffill');

  // --- Smooth section state ---
  const [smoothCols, setSmoothCols] = useState([]);
  const [smoothMethod, setSmoothMethod] = useState('rolling_mean');
  const [smoothWindow, setSmoothWindow] = useState(5);
  const [smoothAlpha, setSmoothAlpha] = useState(0.3);
  const [smoothInplace, setSmoothInplace] = useState(false);

  function applyOp(op) {
    try {
      const newLog = [...operationLog, { ...op, appliedAt: Date.now() }];
      const newData = replayPipeline(rawData, newLog);

      // Update columns if new columns were added (e.g., derive ops)
      const newColNames = newData.length > 0 ? Object.keys(newData[0]) : [];
      const updatedCols = newColNames.map((name) => {
        const existing = columns.find((c) => c.name === name);
        return existing || { name, dtype: 'string' };
      });

      setCleanedData(newData);
      setColumns(updatedCols);
      appendOperation(op);

      const newProfiling = reprofiling(newData, updatedCols, tsCol, profiling);
      setProfiling(newProfiling);

      trackOperation(op.op, op.category);
      addToast('success', op.description || op.name);
    } catch (err) {
      addToast('error', `Operation failed: ${err.message}`);
      console.error(err);
    }
  }

  // --- Apply handlers ---
  function applySort(dir) {
    if (!tsCol) return addToast('error', 'No timestamp column set');
    applyOp(createOperation(dir === 'asc' ? 'sort_ascending' : 'sort_descending', { column: tsCol }));
  }

  function applyDeduplicate() {
    if (!tsCol) return addToast('error', 'No timestamp column set');
    applyOp(createOperation('deduplicate_timestamps', { column: tsCol, keep: tsDedupeKeep }));
  }

  function applyNormalizeTs() {
    if (!tsCol) return addToast('error', 'No timestamp column set');
    applyOp(createOperation('parse_datetime', { column: tsCol, timezone: parseConfig.timezone }));
  }

  function applyImputation() {
    if (imputeSelectedCols.length === 0) return addToast('error', 'Select at least one column');
    const opMap = {
      ffill: 'impute_ffill',
      bfill: 'impute_bfill',
      linear: 'impute_linear',
      spline: 'impute_spline',
      constant: 'impute_constant',
      rolling_mean: 'impute_rolling_mean',
      drop: 'drop_rows_with_nulls',
    };
    const op = opMap[imputeStrategy] || 'impute_linear';
    const params = {
      columns: imputeSelectedCols,
      tsColumn: tsCol,
      value: imputeStrategy === 'constant' ? imputeConstVal : undefined,
      window: imputeStrategy === 'rolling_mean' ? imputeWindow : undefined,
    };
    applyOp(createOperation(op, params));
  }

  function applyOutlier() {
    if (outCols.length === 0) return addToast('error', 'Select at least one column');
    const opMap = {
      clip: 'outlier_clip',
      replace_nan: 'outlier_replace_nan',
      replace_rolling: 'outlier_replace_rolling',
      drop: 'outlier_drop',
      flag: 'outlier_flag',
    };
    const params = {
      columns: outCols,
      method: outMethod,
      multiplier: outMethod === 'iqr' ? outMultiplier : undefined,
      threshold: outMethod !== 'iqr' ? outThreshold : undefined,
    };
    applyOp(createOperation(opMap[outAction], params));
  }

  function applyResample() {
    const op = resDirection === 'down' ? 'resample_down' : 'resample_up';
    if (!tsCol) return addToast('error', 'No timestamp column set');
    const numCols = numericCols.map((c) => c.name);
    const params = resDirection === 'down'
      ? { tsColumn: tsCol, frequency: resFreq, aggregation: resAgg, numericColumns: numCols }
      : { tsColumn: tsCol, frequency: resFreq, fillMethod: resFill };
    applyOp(createOperation(op, params));
  }

  function applySmooth() {
    if (smoothCols.length === 0) return addToast('error', 'Select at least one column');
    const opMap = {
      rolling_mean: 'smooth_rolling_mean',
      ewma: 'smooth_ewma',
      savitzky_golay: 'smooth_savitzky_golay',
    };
    const params = {
      columns: smoothCols,
      window: smoothWindow,
      alpha: smoothAlpha,
      inplace: smoothInplace,
    };
    applyOp(createOperation(opMap[smoothMethod], params));
  }

  const dupCount = profiling.duplicates?.length || 0;
  const gapCount = profiling.gaps?.length || 0;
  const outCount = Object.values(profiling.outliers || {}).reduce((s, a) => s + a.length, 0);

  return (
    <div>
      {/* Timestamp section */}
      <div className="op-section">
        <SectionHeader
          title="Timestamp"
          badge={dupCount > 0 ? dupCount + ' dups' : null}
          badgeVariant="warning"
          open={open.timestamp}
          onToggle={() => setOpen('timestamp', !open.timestamp)}
        />
        {open.timestamp && (
          <div className="op-section-body">
            {!tsCol ? (
              <div className="text-xs text-muted">No timestamp column set. Go back to configure.</div>
            ) : (
              <>
                <div className="text-xs text-muted">Column: <span className="text-mono">{tsCol}</span></div>
                <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={applyNormalizeTs}>
                    Normalize to ISO 8601
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => applySort('asc')}>
                    Sort ↑
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => applySort('desc')}>
                    Sort ↓
                  </button>
                </div>

                <div>
                  <label>Deduplicate — keep</label>
                  <div className="flex gap-2 items-center">
                    <select value={tsDedupeKeep} onChange={(e) => setTsDedupeKeep(e.target.value)}>
                      <option value="last">Last</option>
                      <option value="first">First</option>
                      <option value="mean">Mean</option>
                      <option value="max">Max</option>
                      <option value="min">Min</option>
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={applyDeduplicate}>
                      Apply
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Missing Values section */}
      <div className="op-section">
        <SectionHeader
          title="Missing Values"
          badge={gapCount > 0 ? gapCount + ' gaps' : null}
          badgeVariant="warning"
          open={open.missing}
          onToggle={() => setOpen('missing', !open.missing)}
        />
        {open.missing && (
          <div className="op-section-body">
            <div>
              <label>Columns</label>
              <ColMultiSelect
                columns={numericCols}
                selected={imputeSelectedCols}
                onChange={setImputeSelectedCols}
              />
            </div>

            <div>
              <label>Strategy</label>
              <select value={imputeStrategy} onChange={(e) => setImputeStrategy(e.target.value)}>
                <option value="ffill">Forward fill</option>
                <option value="bfill">Backward fill</option>
                <option value="linear">Linear interpolation</option>
                <option value="spline">Spline interpolation</option>
                <option value="constant">Constant value</option>
                <option value="rolling_mean">Rolling mean</option>
                <option value="drop">Drop null rows</option>
              </select>
            </div>

            {imputeStrategy === 'constant' && (
              <div className="form-row">
                <label>Fill value</label>
                <input
                  type="text"
                  value={imputeConstVal}
                  onChange={(e) => setImputeConstVal(e.target.value)}
                />
              </div>
            )}

            {imputeStrategy === 'rolling_mean' && (
              <div className="form-row">
                <label>Window</label>
                <input
                  type="number"
                  value={imputeWindow}
                  min={2}
                  onChange={(e) => setImputeWindow(parseInt(e.target.value))}
                />
              </div>
            )}

            <button className="btn btn-secondary btn-sm btn-full" onClick={applyImputation}>
              Apply Imputation
            </button>
          </div>
        )}
      </div>

      {/* Outliers section */}
      <div className="op-section">
        <SectionHeader
          title="Outliers"
          badge={outCount > 0 ? outCount : null}
          badgeVariant="warning"
          open={open.outliers}
          onToggle={() => setOpen('outliers', !open.outliers)}
        />
        {open.outliers && (
          <div className="op-section-body">
            <div>
              <label>Columns</label>
              <ColMultiSelect columns={numericCols} selected={outCols} onChange={setOutCols} />
            </div>

            <div className="form-grid">
              <div>
                <label>Method</label>
                <select value={outMethod} onChange={(e) => setOutMethod(e.target.value)}>
                  <option value="iqr">IQR</option>
                  <option value="zscore">Z-score</option>
                  <option value="mad">Modified Z (MAD)</option>
                  <option value="rolling_zscore">Rolling Z-score</option>
                </select>
              </div>
              <div>
                {outMethod === 'iqr' ? (
                  <>
                    <label>Multiplier</label>
                    <input
                      type="number"
                      value={outMultiplier}
                      step={0.1}
                      min={0.1}
                      onChange={(e) => setOutMultiplier(parseFloat(e.target.value))}
                    />
                  </>
                ) : (
                  <>
                    <label>Threshold</label>
                    <input
                      type="number"
                      value={outThreshold}
                      step={0.1}
                      min={0.1}
                      onChange={(e) => setOutThreshold(parseFloat(e.target.value))}
                    />
                  </>
                )}
              </div>
            </div>

            <div>
              <label>Action</label>
              <select value={outAction} onChange={(e) => setOutAction(e.target.value)}>
                <option value="clip">Clip to fence</option>
                <option value="replace_nan">Replace with NaN</option>
                <option value="replace_rolling">Replace with rolling median</option>
                <option value="drop">Drop rows</option>
                <option value="flag">Flag (add column)</option>
              </select>
            </div>

            <button className="btn btn-secondary btn-sm btn-full" onClick={applyOutlier}>
              Apply Outlier Treatment
            </button>
          </div>
        )}
      </div>

      {/* Resample section */}
      <div className="op-section">
        <SectionHeader
          title="Resample"
          open={open.resample}
          onToggle={() => setOpen('resample', !open.resample)}
        />
        {open.resample && (
          <div className="op-section-body">
            <div className="form-grid">
              <div>
                <label>Direction</label>
                <select value={resDirection} onChange={(e) => setResDirection(e.target.value)}>
                  <option value="down">Downsample</option>
                  <option value="up">Upsample</option>
                </select>
              </div>
              <div>
                <label>Frequency</label>
                <input
                  type="text"
                  value={resFreq}
                  placeholder="1H, 15min, 1D…"
                  onChange={(e) => setResFreq(e.target.value)}
                />
              </div>
            </div>

            {resDirection === 'down' ? (
              <div>
                <label>Aggregation</label>
                <select value={resAgg} onChange={(e) => setResAgg(e.target.value)}>
                  <option value="mean">Mean</option>
                  <option value="sum">Sum</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="first">First</option>
                  <option value="last">Last</option>
                  <option value="median">Median</option>
                </select>
              </div>
            ) : (
              <div>
                <label>Fill method</label>
                <select value={resFill} onChange={(e) => setResFill(e.target.value)}>
                  <option value="ffill">Forward fill</option>
                  <option value="bfill">Backward fill</option>
                  <option value="linear">Linear interpolation</option>
                  <option value="null">Leave as null</option>
                </select>
              </div>
            )}

            <button className="btn btn-secondary btn-sm btn-full" onClick={applyResample}>
              Apply Resample
            </button>
          </div>
        )}
      </div>

      {/* Smooth section */}
      <div className="op-section">
        <SectionHeader
          title="Smooth"
          open={open.smooth}
          onToggle={() => setOpen('smooth', !open.smooth)}
        />
        {open.smooth && (
          <div className="op-section-body">
            <div>
              <label>Columns</label>
              <ColMultiSelect columns={numericCols} selected={smoothCols} onChange={setSmoothCols} />
            </div>

            <div>
              <label>Method</label>
              <select value={smoothMethod} onChange={(e) => setSmoothMethod(e.target.value)}>
                <option value="rolling_mean">Rolling Mean</option>
                <option value="ewma">EWMA</option>
                <option value="savitzky_golay">Savitzky-Golay</option>
              </select>
            </div>

            <div className="form-grid">
              {smoothMethod !== 'ewma' && (
                <div>
                  <label>Window</label>
                  <input type="number" value={smoothWindow} min={2} onChange={(e) => setSmoothWindow(parseInt(e.target.value))} />
                </div>
              )}
              {smoothMethod === 'ewma' && (
                <div>
                  <label>Alpha</label>
                  <input type="number" value={smoothAlpha} step={0.05} min={0.01} max={1} onChange={(e) => setSmoothAlpha(parseFloat(e.target.value))} />
                </div>
              )}
            </div>

            <label>
              <input type="checkbox" checked={smoothInplace} onChange={(e) => setSmoothInplace(e.target.checked)} style={{ marginRight: 6 }} />
              Overwrite column (no suffix)
            </label>

            <button className="btn btn-secondary btn-sm btn-full" onClick={applySmooth}>
              Apply Smoothing
            </button>
          </div>
        )}
      </div>

      {/* Columns section */}
      <div className="op-section">
        <SectionHeader
          title="Columns"
          open={open.columns}
          onToggle={() => setOpen('columns', !open.columns)}
        />
        {open.columns && (
          <div className="op-section-body">
            <div className="text-xs text-muted">
              Use the <strong>Columns</strong> tab to rename, drop, or derive features.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
