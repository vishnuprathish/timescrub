/**
 * Parquet export via DuckDB-WASM.
 *
 * DuckDB itself and its WASM bundle are loaded from jsDelivr CDN on first use
 * so they don't bloat the initial JS bundle. They're cached by the browser
 * after the first export.
 *
 * Flow:
 *   cleaned data (JS objects)
 *     → JSON Lines (registered in DuckDB's virtual filesystem)
 *     → DuckDB table (read_json_auto)
 *     → Parquet file (COPY … FORMAT PARQUET, COMPRESSION SNAPPY)
 *     → Uint8Array (copyFileToBuffer)
 *     → blob download
 *
 * SharedArrayBuffer: if COOP/COEP headers are present (production) DuckDB
 * selects the faster "eh" bundle; otherwise it falls back to the "mvp" bundle
 * which runs without SharedArrayBuffer.
 */
export async function downloadParquet(data, filename) {
  if (!data || data.length === 0) throw new Error('No data to export');

  // Lazy-load DuckDB — only fetched when this function is called
  const duckdb = await import('@duckdb/duckdb-wasm');

  // jsDelivr bundles: WASM loaded from CDN, not included in our app bundle
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  );
  const worker = new Worker(workerUrl);

  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? null);

  const conn = await db.connect();

  try {
    // Serialise to JSON Lines and register as a virtual file
    const jsonl = data.map((r) => JSON.stringify(r)).join('\n');
    await db.registerFileText('input.jsonl', jsonl);

    await conn.query(
      "CREATE TABLE export_data AS SELECT * FROM read_json_auto('/input.jsonl')"
    );
    await conn.query(
      "COPY export_data TO '/output.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)"
    );

    const buf = await db.copyFileToBuffer('/output.parquet');

    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    await conn.close();
    try { await db.dropFile('input.jsonl'); } catch { /* ignore */ }
    try { await db.dropFile('output.parquet'); } catch { /* ignore */ }
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
}
