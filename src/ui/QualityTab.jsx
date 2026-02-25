import React, { useEffect, useRef } from 'react';
import useStore from '../store/store.js';

function GapTimeline({ gaps, timeRange }) {
  if (!gaps || gaps.length === 0) {
    return <div className="empty-state" style={{ padding: 'var(--space-5)' }}><div>No gaps detected ✓</div></div>;
  }

  const minT = timeRange?.min ? new Date(timeRange.min).getTime() : null;
  const maxT = timeRange?.max ? new Date(timeRange.max).getTime() : null;
  if (!minT || !maxT) return null;
  const totalMs = maxT - minT;

  return (
    <div style={{ padding: 'var(--space-3) 0' }}>
      <div style={{ position: 'relative', height: 20, background: 'var(--success-dim)', borderRadius: 3, overflow: 'hidden' }}>
        {/* Green base = data present */}
        {gaps.map((gap, i) => {
          const left = ((gap.start.getTime() - minT) / totalMs) * 100;
          const width = ((gap.durationMs) / totalMs) * 100;
          return (
            <div
              key={i}
              title={`Gap: ${gap.start.toISOString()} → ${gap.end.toISOString()} (${gap.missingCount} missing)`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                height: '100%',
                background: 'var(--danger)',
                opacity: 0.8,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
        <span>{new Date(minT).toLocaleDateString()}</span>
        <span style={{ color: 'var(--success)' }}>■ Data</span>
        <span style={{ color: 'var(--danger)' }}>■ Gap</span>
        <span>{new Date(maxT).toLocaleDateString()}</span>
      </div>

      {/* Gap list */}
      <div className="data-table-wrap mt-3">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Missing rows</th>
            </tr>
          </thead>
          <tbody>
            {gaps.slice(0, 20).map((gap, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="text-mono">{gap.start.toISOString()}</td>
                <td className="text-mono">{gap.end.toISOString()}</td>
                <td>{formatDuration(gap.durationMs)}</td>
                <td className="text-warning">{gap.missingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

function AcfPlot({ data, column, maxLag = 40 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!data || !column || !ref.current) return;
    const vals = data.map((r) => parseFloat(r[column])).filter((v) => !isNaN(v));
    if (vals.length < 5) return;

    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    if (variance === 0) return;

    const acf = [];
    const lags = Math.min(maxLag, Math.floor(vals.length / 4));
    for (let lag = 0; lag <= lags; lag++) {
      let cov = 0;
      for (let i = lag; i < vals.length; i++) {
        cov += (vals[i] - mean) * (vals[i - lag] - mean);
      }
      acf.push(cov / (vals.length * variance));
    }

    const confInterval = 1.96 / Math.sqrt(vals.length);

    const renderPlotly = async () => {
      const Plotly = (await import('plotly.js-dist-min')).default;
      const x = acf.map((_, i) => i);
      Plotly.react(ref.current, [
        {
          x, y: acf,
          type: 'bar',
          marker: { color: acf.map((v) => Math.abs(v) > confInterval ? 'var(--accent, #4f8ef7)' : 'var(--text-muted, #556070)') },
          name: 'ACF',
        },
        { x: [0, lags], y: [confInterval, confInterval], type: 'scatter', mode: 'lines', line: { dash: 'dash', color: 'var(--warning, #f0a050)', width: 1 }, showlegend: false },
        { x: [0, lags], y: [-confInterval, -confInterval], type: 'scatter', mode: 'lines', line: { dash: 'dash', color: 'var(--warning, #f0a050)', width: 1 }, showlegend: false },
      ], {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(21,24,32,0.8)',
        font: { color: '#8892aa', size: 11 },
        xaxis: { title: 'Lag', gridcolor: '#1c2030', linecolor: '#252a38', zerolinecolor: '#252a38' },
        yaxis: { title: 'ACF', gridcolor: '#1c2030', linecolor: '#252a38', zerolinecolor: '#252a38', range: [-1.1, 1.1] },
        margin: { t: 10, r: 20, b: 40, l: 50 },
        showlegend: false,
      }, { responsive: true, displayModeBar: false, displaylogo: false });
    };

    renderPlotly();
  }, [data, column]);

  return <div ref={ref} style={{ height: 220 }} />;
}

function NullHeatmapChart({ matrix, buckets, columnNames }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !matrix || matrix.length === 0) return;

    const renderPlotly = async () => {
      const Plotly = (await import('plotly.js-dist-min')).default;
      const xLabels = buckets.map((d) => d.toISOString().slice(0, 10));
      Plotly.react(ref.current, [{
        z: matrix,
        x: xLabels,
        y: columnNames,
        type: 'heatmap',
        colorscale: [[0, 'var(--success-dim, #1a4a30)'], [0.5, 'var(--warning-dim, #4a3010)'], [1, 'var(--danger, #e05050)']],
        zmin: 0, zmax: 1,
        colorbar: { title: 'Null %', thickness: 12, tickfont: { size: 10, color: '#8892aa' } },
      }], {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'rgba(21,24,32,0.8)',
        font: { color: '#8892aa', size: 11 },
        xaxis: { title: 'Time', gridcolor: '#1c2030', linecolor: '#252a38' },
        yaxis: { gridcolor: '#1c2030', linecolor: '#252a38' },
        margin: { t: 10, r: 80, b: 60, l: 100 },
      }, { responsive: true, displayModeBar: false, displaylogo: false });
    };

    renderPlotly();
  }, [matrix, buckets, columnNames]);

  return <div ref={ref} style={{ height: 220 }} />;
}

export default function QualityTab() {
  const { profiling, cleanedData, columns, parseConfig } = useStore();
  const { gaps, duplicates, outliers, timeRange, columnStats } = profiling;
  const tsCol = parseConfig.timestampColumn;

  const numericCols = columns.filter((c) => c.dtype === 'numeric');
  const [acfCol, setAcfCol] = React.useState(() => numericCols[0]?.name || null);

  const [nullHeatmap, setNullHeatmap] = React.useState(null);
  React.useEffect(() => {
    if (!cleanedData || !tsCol || numericCols.length === 0) return;
    import('../profiling/gapDetector.js').then(({ computeNullHeatmap }) => {
      const result = computeNullHeatmap(cleanedData, tsCol, numericCols.map((c) => c.name), 40);
      setNullHeatmap(result);
    });
  }, [cleanedData, tsCol, numericCols.length]);

  return (
    <div>
      {/* Gap timeline */}
      <h3 className="mb-3">Gap Timeline</h3>
      <div className="bg-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <GapTimeline gaps={gaps} timeRange={timeRange} />
      </div>

      {/* Null heatmap */}
      <h3 className="mb-3">Null Heatmap</h3>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        {nullHeatmap && nullHeatmap.matrix.length > 0 ? (
          <NullHeatmapChart matrix={nullHeatmap.matrix} buckets={nullHeatmap.buckets} columnNames={nullHeatmap.columns} />
        ) : (
          <div className="empty-state"><div>No null data to display</div></div>
        )}
      </div>

      {/* Duplicate list */}
      {duplicates.length > 0 && (
        <>
          <h3 className="mb-3">Duplicate Timestamps ({duplicates.length})</h3>
          <div className="data-table-wrap mb-5">
            <table className="data-table">
              <thead>
                <tr><th>Timestamp</th><th>Count</th></tr>
              </thead>
              <tbody>
                {duplicates.slice(0, 20).map((d, i) => (
                  <tr key={i}>
                    <td className="text-mono">{d.timestamp.toISOString()}</td>
                    <td className="text-warning">{d.count}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ACF plot */}
      {numericCols.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <h3>Autocorrelation (ACF)</h3>
            <select
              value={acfCol || ''}
              onChange={(e) => setAcfCol(e.target.value)}
              style={{ width: 160 }}
            >
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            {acfCol && <AcfPlot data={cleanedData || []} column={acfCol} />}
          </div>
        </>
      )}

      {/* Outlier summary */}
      {Object.keys(outliers).length > 0 && (
        <>
          <h3 className="mb-3">Outlier Summary</h3>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Column</th><th>Outliers</th><th>% of rows</th></tr>
              </thead>
              <tbody>
                {Object.entries(outliers).filter(([, arr]) => arr.length > 0).map(([col, arr]) => (
                  <tr key={col}>
                    <td className="text-mono">{col}</td>
                    <td className="text-warning">{arr.length}</td>
                    <td className="text-muted">{profiling.rowCount > 0 ? ((arr.length / profiling.rowCount) * 100).toFixed(2) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
