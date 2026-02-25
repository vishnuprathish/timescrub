import React from 'react';
import useStore from '../store/store.js';

const ICONS = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };

export default function Toast() {
  const { ui, dismissToast } = useStore();

  return (
    <div className="toast-container">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => dismissToast(t.id)}>
          <span>{ICONS[t.type] || '·'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
