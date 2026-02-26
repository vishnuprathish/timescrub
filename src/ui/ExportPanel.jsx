import React, { useState, useMemo } from 'react';
import useStore from '../store/store.js';
import { trackExport } from '../analytics.js';
import { downloadCSV } from '../export/csvExporter.js';
import { downloadExcel } from '../export/excelExporter.js';
import { downloadJSON, downloadOperationLog, downloadQualityReport } from '../export/jsonExporter.js';
import { generatePythonScript } from '../export/pythonScriptGen.js';
import { generateRScript } from '../export/rScriptGen.js';
import { triggerDownload } from '../export/csvExporter.js';
import { downloadParquet } from '../export/parquetExporter.js';
import { downloadNotebook } from '../export/notebookExporter.js';

export default function ExportPanel({ onClose }) {
  const { cleanedData, rawData, operationLog, profiling, ui } = useStore();
  const [scriptLang, setScriptLang] = useState('python');
  const [scriptVisible, setScriptVisible] = useState(false);
  const [parquetLoading, setParquetLoading] = useState(false);

  const data = cleanedData || rawData;
  const filename = ui.filename || 'data.csv';
  const hasCleanedData = !!cleanedData && !ui.largeFileMode;

  const pythonScript = useMemo(
    () => generatePythonScript(operationLog, filename),
    [operationLog, filename]
  );

  const rScript = useMemo(
    () => generateRScript(operationLog, filename),
    [operationLog, filename]
  );

  const currentScript = scriptLang === 'python' ? pythonScript : rScript;
  const scriptFilename = scriptLang === 'python' ? 'clean.py' : 'clean.R';

  function handleDownloadScript() {
    triggerDownload(currentScript, scriptFilename, 'text/plain');
    trackExport(scriptLang);
  }

  return (
    <div className="export-panel-overlay" onClick={onClose}>
      <div className="export-panel" onClick={(e) => e.stopPropagation()}>
        <div className="export-panel-header">
          <h3>Export</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="export-panel-body">
          {/* Data export */}
          {hasCleanedData ? (
            <div>
              <div className="export-section-title">Download Data</div>
              <div className="export-btn-group">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    try { downloadCSV(data, `cleaned_${filename.replace(/\.[^.]+$/, '.csv')}`); trackExport('csv'); }
                    catch (e) { useStore.getState().addToast('error', e.message); }
                  }}
                >
                  CSV
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    try { downloadExcel(data, `cleaned_${filename.replace(/\.[^.]+$/, '.xlsx')}`); trackExport('excel'); }
                    catch (e) { useStore.getState().addToast('error', e.message); }
                  }}
                >
                  Excel (.xlsx)
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    try { downloadJSON(data, `cleaned_${filename.replace(/\.[^.]+$/, '.json')}`); trackExport('json'); }
                    catch (e) { useStore.getState().addToast('error', e.message); }
                  }}
                >
                  JSON
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={parquetLoading}
                  onClick={async () => {
                    setParquetLoading(true);
                    try {
                      await downloadParquet(data, `cleaned_${filename.replace(/\.[^.]+$/, '.parquet')}`);
                      trackExport('parquet');
                    } catch (e) {
                      useStore.getState().addToast('error', `Parquet export failed: ${e.message}`);
                    } finally {
                      setParquetLoading(false);
                    }
                  }}
                >
                  {parquetLoading ? 'Exporting…' : 'Parquet'}
                </button>
              </div>
              {parquetLoading && (
                <div className="text-xs text-muted mt-1">Loading DuckDB-WASM from CDN…</div>
              )}
              <div className="text-xs text-muted mt-2">
                {data?.length.toLocaleString()} rows · {data?.length > 0 ? Object.keys(data[0]).length : 0} columns
                {operationLog.length > 0 && ` · ${operationLog.length} cleaning ops applied`}
              </div>
            </div>
          ) : (
            <div className="large-file-banner">
              <span className="banner-icon">⚠</span>
              <div className="banner-text">
                {ui.largeFileMode
                  ? 'Large file mode: download the cleaning scripts below and run them on your machine.'
                  : 'No cleaned data available yet. Apply operations first.'}
              </div>
            </div>
          )}

          {/* Script export */}
          <div>
            <div className="export-section-title">Cleaning Scripts</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <button
                className={`btn btn-sm ${scriptLang === 'python' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setScriptLang('python')}
              >
                Python
              </button>
              <button
                className={`btn btn-sm ${scriptLang === 'r' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setScriptLang('r')}
              >
                R
              </button>
            </div>

            {operationLog.length === 0 ? (
              <div className="text-xs text-muted">No operations to generate script from. Apply cleaning operations first.</div>
            ) : (
              <>
                <div className="text-xs text-muted mb-2">
                  Script includes <strong>{operationLog.length}</strong> cleaning step{operationLog.length > 1 ? 's' : ''}
                </div>

                <div className="export-btn-group mb-3">
                  <button className="btn btn-primary" onClick={handleDownloadScript}>
                    Download {scriptFilename}
                  </button>
                  {scriptLang === 'python' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => { downloadNotebook(operationLog, filename); trackExport('notebook'); }}
                      title="Download as Jupyter notebook (.ipynb)"
                    >
                      Notebook (.ipynb)
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setScriptVisible((v) => !v)}
                  >
                    {scriptVisible ? 'Hide' : 'Preview'}
                  </button>
                </div>

                {scriptVisible && (
                  <div className="code-preview">{currentScript}</div>
                )}
              </>
            )}
          </div>

          {/* Operation log */}
          <div>
            <div className="export-section-title">Operation Log</div>
            <div className="export-btn-group">
              <button
                className="btn btn-secondary"
                onClick={() => { downloadOperationLog(operationLog, 'operation_log.json'); trackExport('log'); }}
                disabled={operationLog.length === 0}
              >
                Download JSON
              </button>
            </div>
            <div className="text-xs text-muted mt-2">
              Replay this log on a new file with the same structure.
            </div>
          </div>

          {/* Quality report */}
          <div>
            <div className="export-section-title">Quality Report</div>
            <div className="export-btn-group">
              <button
                className="btn btn-secondary"
                onClick={() => { downloadQualityReport(profiling, 'quality_report.json'); trackExport('report'); }}
              >
                Download JSON
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                Print to PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
