import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for the Workspace.
 *
 * ⌘/Ctrl+Z  — undo last operation
 * ⌘/Ctrl+E  — open export panel
 * 1–5       — switch tabs (overview / plot / quality / columns / log)
 * ?         — show keyboard shortcuts cheatsheet
 */

const TAB_KEYS = ['1', '2', '3', '4', '5'];
const TAB_IDS = ['overview', 'plot', 'quality', 'columns', 'log'];

export default function useKeyboardShortcuts({ onUndo, onExport, onTabChange, onHelp }) {
  useEffect(() => {
    function handleKeyDown(e) {
      const target = e.target;
      // Don't fire shortcuts when typing in inputs/textareas/selects
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target.isContentEditable) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z') {
        e.preventDefault();
        onUndo?.();
        return;
      }

      if (mod && e.key === 'e') {
        e.preventDefault();
        onExport?.();
        return;
      }

      if (!mod && e.key === '?') {
        e.preventDefault();
        onHelp?.();
        return;
      }

      if (!mod && TAB_KEYS.includes(e.key)) {
        const tabId = TAB_IDS[parseInt(e.key, 10) - 1];
        if (tabId) {
          e.preventDefault();
          onTabChange?.(tabId);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onExport, onTabChange, onHelp]);
}
