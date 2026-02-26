import React, { useState } from 'react';
import useStore from '../store/store.js';
import { buildShareUrl } from '../utils/shareUrl.js';
import { trackShare } from '../analytics.js';

export default function ShareButton() {
  const operationLog = useStore((s) => s.operationLog);
  const addToast = useStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  if (operationLog.length === 0) return null;

  async function handleClick() {
    const url = buildShareUrl(operationLog);
    if (!url) {
      addToast('error', 'Failed to build share URL');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare(operationLog.length);
    } catch {
      // Fallback: prompt
      window.prompt('Copy this URL to share your pipeline:', url);
    }
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={handleClick}
      title="Share pipeline URL"
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}
    >
      <span style={{ fontSize: 12 }}>{copied ? '✓' : '⤴'}</span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
        {copied ? 'Copied!' : 'Share'}
      </span>
    </button>
  );
}
