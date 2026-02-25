import { useState, useEffect } from 'react';

export const THEMES = [
  { id: 'light',    label: 'Light',    swatch: '#2563eb' },
  { id: 'dark',     label: 'Dark',     swatch: '#4f8ef7' },
  { id: 'midnight', label: 'Midnight', swatch: '#a78bfa' },
  { id: 'mocha',    label: 'Mocha',    swatch: '#f59e0b' },
];

const STORAGE_KEY = 'timescrub-theme';
const DEFAULT = 'light';

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
}

export function useTheme() {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(id) {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeState(id);
  }

  return { theme, setTheme };
}
