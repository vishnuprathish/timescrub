/**
 * Download data as a CSV file.
 * Uses Papa.unparse for consistent output.
 */
import Papa from 'papaparse';

export function downloadCSV(rows, filename = 'cleaned_data.csv') {
  if (!rows || rows.length === 0) throw new Error('No data to export');
  const csv = Papa.unparse(rows, { header: true, newline: '\r\n' });
  triggerDownload(csv, filename, 'text/csv;charset=utf-8;');
}

export function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
