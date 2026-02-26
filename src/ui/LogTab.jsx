import React, { useState, useEffect } from 'react';
import useStore from '../store/store.js';
import { replayPipeline } from '../cleaning/pipeline.js';
import { computeColumnStats } from '../profiling/columnStats.js';
import { trackUndo } from '../analytics.js';
import { getRecipes, saveRecipe, deleteRecipe } from '../utils/recipes.js';

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function RecipesSection({ operationLog }) {
  const { addToast } = useStore();
  const [recipes, setRecipes] = useState(() => getRecipes());
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  function refresh() {
    setRecipes(getRecipes());
  }

  function handleSave() {
    const name = saveName.trim();
    if (!name || operationLog.length === 0) return;
    saveRecipe(name, operationLog);
    setSaveName('');
    setSaving(false);
    refresh();
    addToast('success', `Recipe "${name}" saved`);
  }

  function handleDelete(id, name) {
    deleteRecipe(id);
    refresh();
    addToast('info', `Recipe "${name}" deleted`);
  }

  function handleApply(recipe) {
    useStore.getState().applySharedOps(recipe.ops);
    addToast('success', `Applied recipe "${recipe.name}"`);
  }

  return (
    <div className="recipes-section">
      <div className="export-section-title" style={{ marginBottom: 'var(--space-2)' }}>
        Saved Recipes
      </div>

      {recipes.length === 0 ? (
        <div className="text-xs text-muted mb-2">
          No recipes saved yet. Save the current pipeline as a recipe to reuse it on other files.
        </div>
      ) : (
        <div className="recipe-list">
          {recipes.map((r) => (
            <div key={r.id} className="recipe-item">
              <div className="recipe-info">
                <span className="recipe-name">{r.name}</span>
                <span className="recipe-meta">{r.ops.length} step{r.ops.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="recipe-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleApply(r)}
                  title="Apply this recipe to current data"
                >
                  Apply
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(r.id, r.name)}
                  title="Delete recipe"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {operationLog.length > 0 && (
        saving ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Recipe name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!saveName.trim()}>
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSaving(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 'var(--space-2)' }}
            onClick={() => setSaving(true)}
          >
            + Save current pipeline as recipe
          </button>
        )
      )}
    </div>
  );
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

  return (
    <div>
      {operationLog.length === 0 ? (
        <>
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div>No cleaning operations applied yet.</div>
            <div className="text-xs text-muted">Apply operations from the left panel and they'll appear here.</div>
          </div>
          <RecipesSection operationLog={operationLog} />
        </>
      ) : (
        <>
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

          <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
            <RecipesSection operationLog={operationLog} />
          </div>
        </>
      )}
    </div>
  );
}
