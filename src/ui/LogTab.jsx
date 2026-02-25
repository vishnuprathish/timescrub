import React from 'react';
import useStore from '../store/store.js';
import { replayPipeline } from '../cleaning/pipeline.js';
import { computeColumnStats } from '../profiling/columnStats.js';
import { trackUndo } from '../analytics.js';

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogTab() {
  const {
    operationLog, rawData, columns, profiling, parseConfig,
    removeOperation, setCleanedData, setColumns, setProfiling, addToast,
  } = useStore();

  function handleUndo(opId) {
    const undoneOp = operationLog.find((o) => o.id === opId);
    if (undoneOp) trackUndo(undoneOp.op);
    // Remove op from log and replay remaining
    const newLog = operationLog.filter((o) => o.id !== opId);
    const newData = replayPipeline(rawData, newLog);

    const newColNames = newData.length > 0 ? Object.keys(newData[0]) : [];
    const updatedCols = newColNames.map((name) => {
      const existing = columns.find((c) => c.name === name);
      return existing || { name, dtype: 'string' };
    });

    setCleanedData(newData);
    setColumns(updatedCols);
    removeOperation(opId);

    const newStats = computeColumnStats(newData, updatedCols);
    setProfiling({ ...profiling, columnStats: newStats, rowCount: newData.length, columnCount: updatedCols.length });

    addToast('info', 'Operation removed');
  }

  function handleReset() {
    setCleanedData(rawData);
    setColumns(columns);
    useStore.getState().clearOperations();
    addToast('info', 'All operations cleared');
  }

  if (operationLog.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div>No cleaning operations applied yet.</div>
        <div className="text-xs text-muted">Apply operations from the left panel and they'll appear here.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3>Operation Log ({operationLog.length} steps)</h3>
        <button className="btn btn-danger btn-sm" onClick={handleReset}>
          Clear All
        </button>
      </div>

      <div className="op-log-list">
        {operationLog.map((op, i) => (
          <div key={op.id} className="op-log-item">
            <span className="op-index">{i + 1}</span>
            <span className="op-name">{op.op}</span>
            <span className="op-desc">{op.description}</span>
            <span className="op-time">{formatTime(op.appliedAt)}</span>
            <button
              className="btn btn-ghost btn-sm"
              title="Undo this operation"
              onClick={() => handleUndo(op.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-muted">
        Removing an operation replays all remaining operations from scratch.
      </div>
    </div>
  );
}
