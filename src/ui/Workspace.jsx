import React, { useState } from 'react';
import useStore from '../store/store.js';
import { trackTabView } from '../analytics.js';
import OperationsPanel from './OperationsPanel.jsx';
import OverviewTab from './OverviewTab.jsx';
import PlotTab from './PlotTab.jsx';
import QualityTab from './QualityTab.jsx';
import ColumnsTab from './ColumnsTab.jsx';
import LogTab from './LogTab.jsx';
import ExportPanel from './ExportPanel.jsx';
import ThemeSwitcher from './ThemeSwitcher.jsx';
import FeedbackButton from './FeedbackButton.jsx';
import '../styles/workspace.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plot',     label: 'Plot' },
  { id: 'quality',  label: 'Quality' },
  { id: 'columns',  label: 'Columns' },
  { id: 'log',      label: 'Log' },
];

export default function Workspace() {
  const { ui, profiling, operationLog, cleanedData, setUI, reset } = useStore();
  const [exportOpen, setExportOpen] = useState(false);

  const qualityScore = profiling.qualityScore;
  const qualityClass = qualityScore >= 80 ? 'good' : qualityScore >= 50 ? 'warn' : 'bad';

  function handleTabChange(id) {
    setUI({ activeTab: id });
    trackTabView(id);
  }

  return (
    <div className="workspace-layout">
      {/* Left sidebar: operations */}
      <div className="ops-sidebar">
        <div className="sidebar-top">
          <button className="btn btn-ghost btn-sm" onClick={() => reset()} title="New file">⟵</button>
          <div>
            <div className="sidebar-filename" title={ui.filename}>{ui.filename}</div>
            <div className="sidebar-file-meta">
              {profiling.rowCount.toLocaleString()} rows · {profiling.columnCount} cols
              {ui.largeFileMode && <span className="badge badge-warning" style={{ marginLeft: 4 }}>sample</span>}
            </div>
          </div>
        </div>

        <div className="sidebar-scroll">
          <OperationsPanel />
        </div>

        <div className="sidebar-actions">
          <button
            className="btn btn-primary btn-full"
            onClick={() => setExportOpen(true)}
          >
            {ui.largeFileMode ? 'Generate Scripts' : 'Export ↓'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-panel">
        {/* Top header */}
        <div className="main-header">
          <div className="header-logo">time<span className="accent">scrub</span></div>
          <div className="header-divider" />
          <div className="header-file">{ui.filename}</div>
          <div className="header-right">
            {qualityScore !== null && (
              <div className={`quality-badge ${qualityClass}`}>
                Quality: {qualityScore}/100
              </div>
            )}
            {operationLog.length > 0 && (
              <div className="badge badge-accent">{operationLog.length} ops</div>
            )}
            <FeedbackButton />
            <ThemeSwitcher />
          </div>
        </div>

        {/* Progress strip */}
        {ui.isLoading && (
          <div className="progress-strip">
            <div className={`progress-bar-fill ${ui.progress === null ? 'indeterminate' : ''}`}
              style={ui.progress !== null ? { width: `${ui.progress}%` } : {}} />
          </div>
        )}

        {/* Tabs */}
        <div className="main-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${ui.activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
              {tab.id === 'log' && operationLog.length > 0 && (
                <span className="tab-badge">{operationLog.length}</span>
              )}
              {tab.id === 'quality' && profiling.gaps.length > 0 && (
                <span className="tab-badge" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>
                  {profiling.gaps.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab panes */}
        <div className="tab-pane">
          {ui.activeTab === 'overview' && <OverviewTab />}
          {ui.activeTab === 'plot'     && <PlotTab />}
          {ui.activeTab === 'quality'  && <QualityTab />}
          {ui.activeTab === 'columns'  && <ColumnsTab />}
          {ui.activeTab === 'log'      && <LogTab />}
        </div>
      </div>

      {/* Export drawer */}
      {exportOpen && <ExportPanel onClose={() => setExportOpen(false)} />}
    </div>
  );
}
