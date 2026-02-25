import React from 'react';
import useStore from '../store/store.js';
import { generateIssues } from '../profiling/qualityScore.js';

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function QualityRing({ score }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';

  return (
    <svg width={100} height={100} className="quality-ring-svg">
      <circle cx={50} cy={50} r={r} fill="none" stroke="var(--bg-panel)" strokeWidth={8} />
      <circle
        cx={50} cy={50} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={50} y={46} textAnchor="middle" fill={color} fontSize={20} fontWeight={700}>{score}</text>
      <text x={50} y={60} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>/ 100</text>
    </svg>
  );
}

function QualityDimBar({ label, value }) {
  const color = value >= 80 ? 'var(--success)' : value >= 50 ? 'var(--warning)' : 'var(--danger)';
  const cls = value >= 80 ? '' : value >= 50 ? 'warning' : 'danger';
  return (
    <div className="quality-dim">
      <span className="dim-label">{label}</span>
      <div className="quality-bar-wrap">
        <div className={`quality-bar ${cls}`} style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="dim-val">{value}</span>
    </div>
  );
}

export default function OverviewTab() {
  const { profiling, parseConfig, ui } = useStore();
  const {
    rowCount, columnCount, memoryEstimateBytes, timeRange,
    detectedFrequency, detectedFrequencyMs,
    columnStats, gaps, duplicates, outliers,
    qualityScore, qualityDimensions
  } = profiling;

  const issues = generateIssues({ columnStats, gaps, duplicates, outliers, rowCount, detectedFrequency });

  const totalNullRows = columnStats.reduce((s, c) => s + c.nullCount, 0);
  const outCount = Object.values(outliers || {}).reduce((s, a) => s + a.length, 0);

  return (
    <div>
      {ui.largeFileMode && (
        <div className="large-file-banner mb-4">
          <span className="banner-icon">⚠</span>
          <div className="banner-text">
            Showing stats for a <strong>sample of {rowCount.toLocaleString()} rows</strong>.
            Full dataset stats unavailable in browser mode. Use the generated scripts for full analysis.
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card accent">
          <div className="stat-label">Rows</div>
          <div className="stat-value">{rowCount.toLocaleString()}</div>
          {ui.largeFileMode && <div className="stat-sub">sample only</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Columns</div>
          <div className="stat-value">{columnCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Frequency</div>
          <div className="stat-value" style={{ fontSize: 'var(--font-size-md)' }}>
            {detectedFrequency || '—'}
          </div>
          {detectedFrequencyMs && (
            <div className="stat-sub">{(detectedFrequencyMs / 1000).toFixed(0)}s median</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Memory</div>
          <div className="stat-value" style={{ fontSize: 'var(--font-size-md)' }}>
            {fmtBytes(memoryEstimateBytes)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Date Range</div>
          <div className="stat-value" style={{ fontSize: 12 }}>
            {fmtDate(timeRange.min)}
          </div>
          <div className="stat-sub">→ {fmtDate(timeRange.max)}</div>
        </div>
        <div className={`stat-card ${gaps.length > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Gaps</div>
          <div className="stat-value">{gaps.length}</div>
          {gaps.length > 0 && (
            <div className="stat-sub">{gaps.reduce((s, g) => s + g.missingCount, 0)} missing</div>
          )}
        </div>
        <div className={`stat-card ${duplicates.length > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Duplicates</div>
          <div className="stat-value">{duplicates.length}</div>
        </div>
        <div className={`stat-card ${outCount > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Outliers</div>
          <div className="stat-value">{outCount}</div>
        </div>
        <div className={`stat-card ${totalNullRows > 0 ? (totalNullRows > rowCount * 0.2 ? 'danger' : 'warning') : 'success'}`}>
          <div className="stat-label">Null Cells</div>
          <div className="stat-value">{totalNullRows.toLocaleString()}</div>
        </div>
      </div>

      {/* Quality score */}
      {qualityScore !== null && (
        <>
          <h3 className="mb-3">Data Quality</h3>
          <div className="quality-score-ring mb-4">
            <QualityRing score={qualityScore} />
            <div className="quality-breakdown">
              <QualityDimBar label="Completeness" value={qualityDimensions.completeness} />
              <QualityDimBar label="Regularity" value={qualityDimensions.regularity} />
              <QualityDimBar label="Outlier density" value={qualityDimensions.outlierDensity} />
              <QualityDimBar label="Duplicate rate" value={qualityDimensions.duplicateRate} />
            </div>
          </div>
        </>
      )}

      {/* Issues */}
      <h3 className="mb-3">Issues</h3>
      <div className="issues-list mb-5">
        {issues.map((issue, i) => (
          <div key={i} className={`issue-item ${issue.severity}`}>
            <span className="issue-icon">{issue.icon}</span>
            <span className="issue-text" dangerouslySetInnerHTML={{ __html: issue.text }} />
          </div>
        ))}
      </div>

      {/* Column stats table */}
      <h3 className="mb-3">Column Statistics</h3>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Non-null</th>
              <th>Null %</th>
              <th>Unique</th>
              <th>Min</th>
              <th>Max</th>
              <th>Mean</th>
              <th>Std</th>
            </tr>
          </thead>
          <tbody>
            {columnStats.map((col) => {
              const nullClass = col.nullPct > 50 ? 'danger' : col.nullPct > 20 ? 'medium' : 'low';
              return (
                <tr key={col.name}>
                  <td className="text-mono">{col.name}</td>
                  <td><span className={`badge badge-${col.dtype === 'numeric' ? 'accent' : col.dtype === 'datetime' ? 'success' : 'muted'}`}>{col.dtype}</span></td>
                  <td>{(col.total - col.nullCount).toLocaleString()}</td>
                  <td>
                    <div className="null-bar-wrap">
                      <div className="null-bar-bg">
                        <div className={`null-bar-fill ${nullClass}`} style={{ width: `${col.nullPct}%` }} />
                      </div>
                      <span className="text-xs text-muted">{col.nullPct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td>{col.uniqueCount}</td>
                  <td className="text-mono">{col.min != null ? col.min.toFixed(3) : '—'}</td>
                  <td className="text-mono">{col.max != null ? col.max.toFixed(3) : '—'}</td>
                  <td className="text-mono">{col.mean != null ? col.mean.toFixed(3) : '—'}</td>
                  <td className="text-mono">{col.std != null ? col.std.toFixed(3) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
