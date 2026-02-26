/**
 * Share URL utilities — encode/decode operationLog to/from URL hash.
 * No server required. Max ~2KB encoded for typical pipelines.
 *
 * Format: #ops=<base64url(JSON)>
 * Slim op shape: { op, params, description }  (id + appliedAt stripped)
 */

const HASH_KEY = 'ops';

/** Encode an operationLog to a URL-safe base64 string. */
export function encodeOps(operationLog) {
  const slim = operationLog.map(({ op, params, description }) => ({ op, params, description }));
  try {
    return btoa(encodeURIComponent(JSON.stringify(slim)));
  } catch {
    return null;
  }
}

/** Decode a base64 string back to a slim op array, or return null on failure. */
export function decodeOps(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

/** Build a shareable URL for the current page + encoded ops. */
export function buildShareUrl(operationLog) {
  const encoded = encodeOps(operationLog);
  if (!encoded) return null;
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${encoded}`;
  return url.toString();
}

/**
 * Read pending shared ops from the URL hash.
 * Called once on app mount — returns the slim op array or null.
 * Clears the hash after reading so it doesn't persist.
 */
export function consumeSharedOps() {
  const hash = window.location.hash.slice(1); // strip leading #
  if (!hash.startsWith(`${HASH_KEY}=`)) return null;

  const encoded = hash.slice(HASH_KEY.length + 1);
  const ops = decodeOps(encoded);

  // Clear hash without triggering a navigation
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  return ops && ops.length > 0 ? ops : null;
}
