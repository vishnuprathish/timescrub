import React, { useState } from 'react';
import { THEMES, useTheme } from '../hooks/useTheme.js';

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        title="Switch theme"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 6px' }}
      >
        <span
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: current.swatch,
            border: '1.5px solid var(--border-strong)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
          {current.label}
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>▾</span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: 6, zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110,
          }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: t.id === theme ? 'var(--bg-hover)' : 'none',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px', cursor: 'pointer', width: '100%',
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: t.swatch,
                  border: t.id === theme
                    ? '2px solid var(--accent)'
                    : '1.5px solid var(--border-strong)',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 'var(--font-size-xs)',
                  color: t.id === theme ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
