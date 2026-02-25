import React, { useEffect, useRef, useState } from 'react';
import useStore from '../store/store.js';
import { parseTimestamp } from '../profiling/frequencyDetector.js';

export default function PlotTab() {
  const { rawData, cleanedData, columns, parseConfig, profiling } = useStore();
  const plotRef = useRef(null);
  const [selectedCols, setSelectedCols] = useState([]);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showGaps, setShowGaps] = useState(true);
  const [showOutliers, setShowOutliers] = useState(true);

  const tsCol = parseConfig.timestampColumn;
  const numericCols = columns.filter((c) => c.dtype === 'numeric');

  // Initialize selected columns to first numeric column
  useEffect(() => {
    if (numericCols.length > 0 && selectedCols.length === 0) {
      setSelectedCols([numericCols[0].name]);
    }
  }, [numericCols.length]);

  useEffect(() => {
    renderPlot();
  }, [rawData, cleanedData, selectedCols, showOriginal, showCleaned, showGaps, showOutliers, tsCol]);

  async function renderPlot() {
    if (!plotRef.current || !rawData || selectedCols.length === 0 || !tsCol) return;

    const Plotly = (await import('plotly.js-dist-min')).default;

    const traces = [];

    for (const col of selectedCols) {
      // Original data
      if (showOriginal && rawData) {
        const x = rawData.map((r) => r[tsCol]);
        const y = rawData.map((r) => {
          const v = r[col];
          return v == null || v === '' ? null : parseFloat(v);
        });
        traces.push({
          x, y,
          type: 'scatter',
          mode: 'lines',
          name: `${col} (original)`,
          line: { color: 'rgba(85, 96, 112, 0.5)', width: 1 },
          connectgaps: false,
        });
      }

      // Cleaned data
      if (showCleaned && cleanedData) {
        const x = cleanedData.map((r) => r[tsCol]);
        const y = cleanedData.map((r) => {
          const v = r[col];
          return v == null || v === '' ? null : parseFloat(v);
        });
        traces.push({
          x, y,
          type: 'scatter',
          mode: 'lines',
          name: `${col} (cleaned)`,
          line: { color: getColColor(selectedCols.indexOf(col)), width: 2 },
          connectgaps: false,
        });
      }

      // Outlier markers
      if (showOutliers && profiling.outliers?.[col]?.length > 0) {
        const src = cleanedData || rawData;
        const outIndices = new Set(profiling.outliers[col].map((o) => o.rowIndex));
        const ox = [], oy = [];
        src.forEach((r, i) => {
          if (outIndices.has(i)) {
            ox.push(r[tsCol]);
            oy.push(parseFloat(r[col]));
          }
        });
        traces.push({
          x: ox, y: oy,
          type: 'scatter',
          mode: 'markers',
          name: `${col} outliers`,
          marker: { color: 'var(--warning, #f0a050)', size: 6, symbol: 'circle-open', line: { width: 2 } },
        });
      }
    }

    // Gap shading
    const shapes = [];
    if (showGaps && profiling.gaps?.length > 0) {
      for (const gap of profiling.gaps.slice(0, 50)) {
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: gap.start.toISOString(),
          x1: gap.end.toISOString(),
          y0: 0,
          y1: 1,
          fillcolor: 'rgba(240, 160, 80, 0.08)',
          line: { width: 0 },
        });
      }
    }

    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(21, 24, 32, 0.8)',
      font: { color: '#8892aa', family: 'system-ui, sans-serif', size: 11 },
      xaxis: {
        type: 'date',
        gridcolor: '#1c2030',
        linecolor: '#252a38',
        zerolinecolor: '#252a38',
        rangeslider: { visible: true, thickness: 0.04, bgcolor: '#111318' },
      },
      yaxis: {
        gridcolor: '#1c2030',
        linecolor: '#252a38',
        zerolinecolor: '#252a38',
      },
      legend: {
        bgcolor: 'rgba(21,24,32,0.8)',
        bordercolor: '#252a38',
        borderwidth: 1,
        font: { size: 11 },
      },
      shapes,
      margin: { t: 20, r: 20, b: 60, l: 60 },
      hovermode: 'x unified',
    };

    const config = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
      displaylogo: false,
    };

    Plotly.react(plotRef.current, traces, layout, config);
  }

  const colColors = ['#4f8ef7', '#e05090', '#50c870', '#f0a040', '#c060e0', '#50d0d0'];
  function getColColor(idx) { return colColors[idx % colColors.length]; }

  if (!tsCol) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📈</div>
        <div>No timestamp column set. Go back to parse config to set one.</div>
      </div>
    );
  }

  if (numericCols.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <div>No numeric columns found to plot.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-3)' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', flex: 1 }}>
          {numericCols.map((c, i) => (
            <button
              key={c.name}
              className={`btn btn-sm ${selectedCols.includes(c.name) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                if (selectedCols.includes(c.name)) setSelectedCols(selectedCols.filter((s) => s !== c.name));
                else setSelectedCols([...selectedCols, c.name]);
              }}
              style={selectedCols.includes(c.name) ? { background: getColColor(i), border: 'none' } : {}}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
            Original
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCleaned} onChange={(e) => setShowCleaned(e.target.checked)} />
            Cleaned
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showGaps} onChange={(e) => setShowGaps(e.target.checked)} />
            Gaps
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showOutliers} onChange={(e) => setShowOutliers(e.target.checked)} />
            Outliers
          </label>
        </div>
      </div>

      {/* Plot */}
      <div
        ref={plotRef}
        style={{ flex: 1, minHeight: 400, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
      />
    </div>
  );
}
