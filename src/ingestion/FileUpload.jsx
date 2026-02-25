import React, { useCallback, useRef, useState } from 'react';
import useStore from '../store/store.js';
import { isLargeFile, formatFileSize, detectFileType, readFileHead, detectDelimiter, LARGE_FILE_SAMPLE_ROWS } from './csvParser.js';
import { SAMPLE_DATASETS } from './sampleDatasets.js';
import { trackFileUpload, trackSampleLoad } from '../analytics.js';
import ThemeSwitcher from '../ui/ThemeSwitcher.jsx';
import FeedbackButton from '../ui/FeedbackButton.jsx';
import '../styles/upload.css';

const ACCEPTED = '.csv,.tsv,.xlsx,.xls,.json,.jsonl,.ndjson';

export default function FileUpload() {
  const { setUI, setParseConfig } = useStore();
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const handleFile = useCallback(async (file) => {
    const ext = detectFileType(file.name);
    const large = isLargeFile(file);

    // Auto-detect delimiter for CSV/TSV
    let delimiter = ',';
    if (['csv', 'tsv'].includes(ext)) {
      try {
        const head = await readFileHead(file);
        delimiter = detectDelimiter(head);
      } catch {
        delimiter = ext === 'tsv' ? '\t' : ',';
      }
    }

    trackFileUpload(file, large);

    setParseConfig({ delimiter });
    setUI({
      filename: file.name,
      fileSize: file.size,
      largeFileMode: large,
      parseStep: 'config',
      _pendingFile: file,
    });
  }, [setUI, setParseConfig]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onFileInput = (e) => { const f = e.target.files[0]; if (f) handleFile(f); };

  const handleSample = (dataset) => {
    trackSampleLoad(dataset.id);
    const blob = new Blob([dataset.csv], { type: 'text/csv' });
    const file = new File([blob], dataset.filename, { type: 'text/csv' });
    handleFile(file);
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    const blob = new Blob([pasteText], { type: 'text/csv' });
    const file = new File([blob], 'pasted_data.csv', { type: 'text/csv' });
    handleFile(file);
  };

  return (
    <div className="upload-page">
      <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FeedbackButton />
        <ThemeSwitcher />
      </div>
      <div className="upload-container">
        {/* Header */}
        <div className="upload-header">
          <div className="upload-logo">
            <span className="logo-icon">⬡</span>
            <span>time<span className="accent">scrub</span></span>
          </div>
          <p className="upload-tagline">
            Clean timeseries data in your browser.&nbsp;
            <span className="muted">No signup. No data leaves your machine.</span>
          </p>
        </div>

        {/* Tab toggle */}
        <div className="upload-tabs">
          <button className={`upload-tab ${!pasteMode ? 'active' : ''}`} onClick={() => setPasteMode(false)}>
            Upload File
          </button>
          <button className={`upload-tab ${pasteMode ? 'active' : ''}`} onClick={() => setPasteMode(true)}>
            Paste CSV
          </button>
        </div>

        {!pasteMode ? (
          <>
            {/* Drop zone */}
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="drop-icon">↑</div>
              <div className="drop-text">
                <strong>Drop a file here</strong> or <span className="link">click to browse</span>
              </div>
              <div className="drop-formats">CSV · TSV · Excel (.xlsx) · JSON · JSON Lines</div>
              <div className="drop-limit">Up to 50 MB in browser · Larger files generate Python/R scripts</div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                style={{ display: 'none' }}
                onChange={onFileInput}
              />
            </div>
          </>
        ) : (
          <div className="paste-zone">
            <textarea
              className="paste-textarea"
              placeholder="Paste your CSV data here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
            />
            <button
              className="btn btn-primary btn-full mt-3"
              disabled={!pasteText.trim()}
              onClick={handlePasteSubmit}
            >
              Parse CSV
            </button>
          </div>
        )}

        {/* Sample datasets */}
        <div className="sample-section">
          <div className="sample-label">Try a sample dataset</div>
          <div className="sample-chips">
            {SAMPLE_DATASETS.map((ds) => (
              <button key={ds.id} className="sample-chip" onClick={() => handleSample(ds)}>
                <span className="chip-icon">{ds.icon}</span>
                <span className="chip-text">
                  <span className="chip-name">{ds.name}</span>
                  <span className="chip-meta">{ds.meta}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Feature highlights */}
        <div className="feature-grid">
          {[
            { icon: '🔍', title: 'Auto-Profile', desc: 'Detects frequency, gaps, outliers, and data types automatically' },
            { icon: '🧹', title: 'Clean', desc: 'Fill gaps, clip outliers, resample, smooth — all configurable per column' },
            { icon: '📜', title: 'Export Scripts', desc: 'Get Python/R code that replicates every cleaning step, for large files or pipelines' },
            { icon: '📊', title: 'Visualize', desc: 'Interactive charts with before/after overlays, null heatmaps, and ACF plots' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="feature-card">
              <span className="feature-icon">{icon}</span>
              <div>
                <div className="feature-title">{title}</div>
                <div className="feature-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
