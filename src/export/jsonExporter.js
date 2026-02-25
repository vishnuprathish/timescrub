import { triggerDownload } from './csvExporter.js';

export function downloadJSON(rows, filename = 'cleaned_data.json') {
  if (!rows || rows.length === 0) throw new Error('No data to export');
  const json = JSON.stringify(rows, null, 2);
  triggerDownload(json, filename, 'application/json');
}

export function downloadOperationLog(operationLog, filename = 'operation_log.json') {
  const json = JSON.stringify(operationLog, null, 2);
  triggerDownload(json, filename, 'application/json');
}

export function downloadQualityReport(profiling, filename = 'quality_report.json') {
  const json = JSON.stringify(profiling, null, 2);
  triggerDownload(json, filename, 'application/json');
}
