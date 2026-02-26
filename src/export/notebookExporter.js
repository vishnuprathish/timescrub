/**
 * Jupyter Notebook exporter — converts an operationLog + filename into a .ipynb file.
 *
 * Uses the Python script generator as the code source, splitting on
 * "# Step N:" markers to create individual notebook cells.
 */

import { generatePythonScript } from './pythonScriptGen.js';
import { triggerDownload } from './csvExporter.js';

/**
 * Build a minimal nbformat 4 notebook cell.
 * @param {'code'|'markdown'} cell_type
 * @param {string} source
 */
function makeCell(cell_type, source) {
  const base = {
    cell_type,
    metadata: {},
    source: source.split('\n').map((line, i, arr) => (i < arr.length - 1 ? line + '\n' : line)),
  };
  if (cell_type === 'code') {
    return { ...base, outputs: [], execution_count: null };
  }
  return base;
}

/**
 * Generate and download a Jupyter notebook (.ipynb) from the operation log.
 * @param {object[]} operationLog
 * @param {string} filename - source filename (for HEADER and output filename)
 */
export function downloadNotebook(operationLog, filename = 'data.csv') {
  const script = generatePythonScript(operationLog, filename);

  // Split on "# Step N:" boundaries — keep each step as its own cell
  const stepRegex = /(?=\n# Step \d+:)/;
  const parts = script.split(stepRegex);

  const cells = [];

  // Title markdown cell
  const stem = filename.replace(/\.[^.]+$/, '');
  cells.push(makeCell('markdown', `# TimeScrub — Cleaning Pipeline\n\nGenerated for **${filename}** · ${operationLog.length} operation${operationLog.length !== 1 ? 's' : ''}`));

  // One code cell per part (header block + each step + footer)
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) {
      cells.push(makeCell('code', trimmed));
    }
  }

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: { name: 'python', version: '3.8.0' },
    },
    cells,
  };

  const json = JSON.stringify(notebook, null, 2);
  const notebookFilename = `clean_${stem}.ipynb`;
  triggerDownload(json, notebookFilename, 'application/x-ipynb+json');
}
