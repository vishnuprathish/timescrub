import React from 'react';

const SHORTCUTS = [
  { keys: ['⌘', 'Z'], label: 'Undo last operation' },
  { keys: ['⌘', 'E'], label: 'Open export panel' },
  { keys: ['1'], label: 'Go to Overview tab' },
  { keys: ['2'], label: 'Go to Plot tab' },
  { keys: ['3'], label: 'Go to Quality tab' },
  { keys: ['4'], label: 'Go to Columns tab' },
  { keys: ['5'], label: 'Go to Log tab' },
  { keys: ['?'], label: 'Show this help' },
];

export default function KeyboardShortcutsModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Keyboard Shortcuts</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <table className="shortcuts-table">
            <tbody>
              {SHORTCUTS.map(({ keys, label }) => (
                <tr key={label}>
                  <td className="shortcut-keys">
                    {keys.map((k, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="shortcut-plus">+</span>}
                        <kbd className="kbd">{k}</kbd>
                      </React.Fragment>
                    ))}
                  </td>
                  <td className="shortcut-label">{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-muted mt-3" style={{ textAlign: 'center' }}>
            Shortcuts are disabled when typing in input fields.
          </div>
        </div>
      </div>
    </div>
  );
}
