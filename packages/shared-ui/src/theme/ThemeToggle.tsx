import { useState, type ReactElement } from 'react';
import { parseTheme, readStoredTheme, setTheme, type Theme } from './theme';

const currentTheme = (): Theme => {
  if (typeof document === 'undefined') return 'haunted';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr ? parseTheme(attr) : readStoredTheme();
};

/**
 * Switches between the Haunted (default) and Classic themes. The visible label names the active
 * theme; `aria-pressed` is true while Haunted is on. The icon is decorative.
 */
export function ThemeToggle({ className }: { className?: string }): ReactElement {
  const [theme, setCurrent] = useState<Theme>(currentTheme);
  const haunted = theme === 'haunted';
  const toggle = (): void => {
    const next: Theme = haunted ? 'classic' : 'haunted';
    setTheme(next);
    setCurrent(next);
  };
  return (
    <button
      type="button"
      className={`touch-target ak-btn ak-btn-secondary ak-btn-sm ak-theme-toggle${className ? ` ${className}` : ''}`}
      aria-pressed={haunted}
      onClick={toggle}
      data-theme-toggle={theme}
    >
      <span aria-hidden="true">{haunted ? '🎃' : '☀'}</span>
      <span className="sr-only">Theme: </span>
      <span>{haunted ? 'Haunted' : 'Classic'}</span>
    </button>
  );
}
