import React, { useCallback, useRef, useState } from 'react';
import useStore from '../store/store.js';
import { isLargeFile, formatFileSize, detectFileType, readFileHead, detectDelimiter, LARGE_FILE_SAMPLE_ROWS } from './csvParser.js';
import { SAMPLE_DATASETS } from './sampleDatasets.js';
import { trackFileUpload, trackSampleLoad, trackUrlImport } from '../analytics.js';
import ThemeSwitcher from '../ui/ThemeSwitcher.jsx';
import FeedbackButton from '../ui/FeedbackButton.jsx';
import '../styles/upload.css';

const ACCEPTED = '.csv,.tsv,.xlsx,.xls,.json,.jsonl,.ndjson';

export default function FileUpload() {
  const { setUI, setParseConfig } = useStore();
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste' | 'url'
  const [pasteText, setPasteText] = useState('');
  const [urlText, setUrlText] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');

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

  const handleUrlImport = async () => {
    const url = urlText.trim();
    if (!url) return;
    setUrlError('');
    setUrlLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Derive filename from URL path
      const pathPart = new URL(url).pathname.split('/').pop() || 'imported_data.csv';
      const filename = pathPart.includes('.') ? pathPart : `${pathPart}.csv`;
      const file = new File([blob], filename, { type: blob.type || 'text/csv' });
      trackUrlImport(filename);
      handleFile(file);
    } catch (e) {
      const msg = e.message.includes('Failed to fetch')
        ? 'Could not fetch URL. The server may not allow cross-origin requests (CORS).'
        : `Fetch failed: ${e.message}`;
      setUrlError(msg);
    } finally {
      setUrlLoading(false);
    }
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
          <button className={`upload-tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            Upload File
          </button>
          <button className={`upload-tab ${activeTab === 'paste' ? 'active' : ''}`} onClick={() => setActiveTab('paste')}>
            Paste Data
          </button>
          <button className={`upload-tab ${activeTab === 'url' ? 'active' : ''}`} onClick={() => setActiveTab('url')}>
            From URL
          </button>
        </div>

        {activeTab === 'upload' && (
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
        )}

        {activeTab === 'paste' && (
          <div className="paste-zone">
            <textarea
              className="paste-textarea"
              placeholder="Paste CSV, TSV, or tab-separated data from Excel or Google Sheets here…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
            />
            <button
              className="btn btn-primary btn-full mt-3"
              disabled={!pasteText.trim()}
              onClick={handlePasteSubmit}
            >
              Parse Data
            </button>
          </div>
        )}

        {activeTab === 'url' && (
          <div className="paste-zone">
            <div className="text-xs text-muted mb-2">
              Enter a direct URL to a publicly accessible CSV, TSV, JSON, or Excel file.
            </div>
            <input
              type="url"
              className="form-input"
              placeholder="https://example.com/data.csv"
              value={urlText}
              onChange={(e) => { setUrlText(e.target.value); setUrlError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
              style={{ width: '100%', marginBottom: 'var(--space-2)' }}
            />
            {urlError && (
              <div className="text-xs" style={{ color: 'var(--danger)', marginBottom: 'var(--space-2)' }}>
                {urlError}
              </div>
            )}
            <button
              className="btn btn-primary btn-full"
              disabled={!urlText.trim() || urlLoading}
              onClick={handleUrlImport}
            >
              {urlLoading ? 'Fetching…' : 'Fetch & Load'}
            </button>
            <div className="text-xs text-muted mt-2">
              The server must allow cross-origin (CORS) requests. GitHub raw files, Gist, and public S3/GCS URLs work.
            </div>
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

        {/* How it works */}
        <div className="how-it-works">
          <div className="how-label">How it works</div>
          <div className="how-steps">
            {[
              {
                num: '1',
                title: 'Upload',
                desc: 'Drop a CSV, Excel, JSON, or JSONL file — or paste data directly. Large files generate processing scripts instead.',
              },
              {
                num: '2',
                title: 'Profile',
                desc: 'Instantly see frequency, gaps, outliers, quality score, correlations, stationarity, and seasonality.',
              },
              {
                num: '3',
                title: 'Clean & Export',
                desc: 'Apply operations with full undo, then download cleaned data as CSV, Excel, JSON, or Parquet — or get Python/R scripts.',
              },
            ].map(({ num, title, desc }) => (
              <div key={num} className="how-step">
                <div className="how-step-num">{num}</div>
                <div className="how-step-title">{title}</div>
                <div className="how-step-desc">{desc}</div>
              </div>
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

        {/* Footer */}
        <div className="upload-footer">
          <span>© 2025 TimeScrub</span>
          <span className="footer-sep">·</span>
          <a
            href="https://github.com/vishnuprathish/timescrub/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Changelog
          </a>
          <span className="footer-sep">·</span>
          <a
            href="https://github.com/vishnuprathish/timescrub"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            GitHub
          </a>
          <span className="footer-sep">·</span>
          <span className="footer-privacy">No data sent to any server</span>
        </div>
      </div>
    </div>
  );
}
