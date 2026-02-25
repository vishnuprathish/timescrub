import React, { useState } from 'react';
import useStore from '../store/store.js';
import { createOperation } from '../cleaning/operationLog.js';
import { replayPipeline } from '../cleaning/pipeline.js';
import { computeColumnStats } from '../profiling/columnStats.js';

export default function ColumnsTab() {
  const {
    rawData, cleanedData, columns, profiling, parseConfig,
    setCleanedData, setColumns, appendOperation, setProfiling, addToast,
  } = useStore();

  const [pendingRenames, setPendingRenames] = useState({});
  const [deriveConfig, setDeriveConfig] = useState({
    type: 'lag',
    column: columns[0]?.name || '',
    n: 1,
    window: 5,
    outputColumn: '',
  });

  const operationLog = useStore((s) => s.operationLog);

  function applyOp(op) {
    try {
      const newLog = [...operationLog, { ...op, appliedAt: Date.now() }];
      const newData = replayPipeline(rawData, newLog);
      const newColNames = newData.length > 0 ? Object.keys(newData[0]) : [];
      const updatedCols = newColNames.map((name) => {
        const existing = columns.find((c) => c.name === name);
        return existing || { name, dtype: 'string' };
      });
      setCleanedData(newData);
      setColumns(updatedCols);
      appendOperation(op);
      const newStats = computeColumnStats(newData, updatedCols);
      setProfiling({ ...profiling, columnStats: newStats, rowCount: newData.length, columnCount: updatedCols.length });
      addToast('success', op.description || op.name);
    } catch (err) {
      addToast('error', `Failed: ${err.message}`);
    }
  }

  function handleRenameSubmit(oldName) {
    const newName = pendingRenames[oldName];
    if (!newName || newName === oldName) return;
    applyOp(createOperation('rename_column', { from: oldName, to: newName }));
    setPendingRenames((p) => { const next = { ...p }; delete next[oldName]; return next; });
  }

  function handleDrop(colName) {
    applyOp(createOperation('drop_column', { column: colName }));
  }

  function handleChangeDtype(colName, dtype) {
    applyOp(createOperation('change_dtype', { column: colName, dtype }));
  }

  function handleDerive() {
    const { type, column, n, window, outputColumn } = deriveConfig;
    if (!column) return addToast('error', 'Select a column');
    const opMap = {
      lag: 'derive_lag',
      diff: 'derive_diff',
      pct_change: 'derive_pct_change',
      rolling_mean: 'derive_rolling_mean',
      rolling_std: 'derive_rolling_std',
      cumsum: 'derive_cumsum',
    };
    const params = { column, n: parseInt(n), window: parseInt(window), outputColumn: outputColumn || undefined };
    applyOp(createOperation(opMap[type], params));
  }

  const currentData = cleanedData || rawData;
  const currentCols = columns;

  return (
    <div>
      {/* Column manager table */}
      <div className="flex items-center justify-between mb-3">
        <h3>Columns ({currentCols.length})</h3>
        <div className="text-xs text-muted">Click a name to rename it</div>
      </div>

      <div className="data-table-wrap mb-5">
        <table className="col-manager-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Name</th>
              <th style={{ width: '10%' }}>Type</th>
              <th style={{ width: '10%' }}>Null %</th>
              <th style={{ width: '20%' }}>Sample values</th>
              <th style={{ width: '15%' }}>Cast to</th>
              <th style={{ width: '15%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentCols.map((col) => {
              const stats = profiling.columnStats?.find((s) => s.name === col.name);
              return (
                <tr key={col.name}>
                  <td>
                    <input
                      className="col-name-input"
                      value={pendingRenames[col.name] ?? col.name}
                      onChange={(e) => setPendingRenames((p) => ({ ...p, [col.name]: e.target.value }))}
                      onBlur={() => handleRenameSubmit(col.name)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(col.name)}
                    />
                  </td>
                  <td>
                    <span className={`badge badge-${col.dtype === 'numeric' ? 'accent' : col.dtype === 'datetime' ? 'success' : 'muted'}`}>
                      {col.dtype}
                    </span>
                  </td>
                  <td className={`text-xs ${(stats?.nullPct || 0) > 20 ? 'text-warning' : 'text-muted'}`}>
                    {stats ? `${stats.nullPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="text-xs text-muted text-mono" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stats?.sampleValues?.slice(0, 2).join(', ') || '—'}
                  </td>
                  <td>
                    <select
                      style={{ width: '100%' }}
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) handleChangeDtype(col.name, e.target.value); }}
                    >
                      <option value="">—</option>
                      <option value="numeric">numeric</option>
                      <option value="string">string</option>
                      <option value="boolean">boolean</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDrop(col.name)}
                      title={`Drop ${col.name}`}
                      disabled={col.name === parseConfig.timestampColumn}
                    >
                      Drop
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Derive features */}
      <h3 className="mb-3">Derive Feature</h3>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <div className="form-grid mb-3">
          <div>
            <label>Feature type</label>
            <select value={deriveConfig.type} onChange={(e) => setDeriveConfig((c) => ({ ...c, type: e.target.value }))}>
              <option value="lag">Lag</option>
              <option value="diff">Diff</option>
              <option value="pct_change">% Change</option>
              <option value="rolling_mean">Rolling Mean</option>
              <option value="rolling_std">Rolling Std</option>
              <option value="cumsum">Cumulative Sum</option>
            </select>
          </div>
          <div>
            <label>Source column</label>
            <select value={deriveConfig.column} onChange={(e) => setDeriveConfig((c) => ({ ...c, column: e.target.value }))}>
              {currentCols.filter((c) => c.dtype === 'numeric').map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid mb-3">
          {['lag', 'diff', 'pct_change'].includes(deriveConfig.type) && (
            <div>
              <label>n (periods)</label>
              <input
                type="number"
                value={deriveConfig.n}
                min={1}
                onChange={(e) => setDeriveConfig((c) => ({ ...c, n: e.target.value }))}
              />
            </div>
          )}
          {['rolling_mean', 'rolling_std'].includes(deriveConfig.type) && (
            <div>
              <label>Window</label>
              <input
                type="number"
                value={deriveConfig.window}
                min={2}
                onChange={(e) => setDeriveConfig((c) => ({ ...c, window: e.target.value }))}
              />
            </div>
          )}
          <div>
            <label>Output column (optional)</label>
            <input
              type="text"
              value={deriveConfig.outputColumn}
              placeholder="auto"
              onChange={(e) => setDeriveConfig((c) => ({ ...c, outputColumn: e.target.value }))}
            />
          </div>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={handleDerive}>
          Add Feature
        </button>
      </div>
    </div>
  );
}
