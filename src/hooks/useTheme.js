import { useState, useEffect } from 'react';

export const THEMES = [
  { id: 'dark',     label: 'Dark',     swatch: '#151820' },
  { id: 'light',    label: 'Light',    swatch: '#f4f5f7' },
  { id: 'midnight', label: 'Midnight', swatch: '#0d1020' },
  { id: 'mocha',    label: 'Mocha',    swatch: '#181410' },
];

const STORAGE_KEY = 'timescrub-theme';
const DEFAULT = 'dark';

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
