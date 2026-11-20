import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'hotel-theme';

/** Storage can be unavailable (private windows, blocked site data): fall back to the system theme. */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function saveTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // not remembered, but still applied for this page
  }
}

export function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <label className="theme-select">
      <span>Theme</span>
      <select
        aria-label="Theme"
        value={theme}
        onChange={(e) => {
          const next = e.target.value as Theme;
          saveTheme(next);
          setTheme(next);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
