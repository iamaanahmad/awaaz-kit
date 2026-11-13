/** Theme switching: `<html data-theme="haunted|classic">`, remembered in localStorage. */

export type Theme = 'haunted' | 'classic';
export type ThemeApp = 'order' | 'bill';

/** localStorage key, shared by the hub and both apps (same origin). */
export const THEME_STORAGE_KEY = 'awaaz-theme';
export const DEFAULT_THEME: Theme = 'haunted';

/** Colour for `<meta name="theme-color">`. Keep in sync with tokens.css and the inline snippets. */
export const THEME_META_COLOR: Record<Theme, Record<ThemeApp, string>> = {
  haunted: { order: '#0f0b14', bill: '#0f0b14' },
  classic: { order: '#e8710a', bill: '#0f766e' },
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const safeStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function parseTheme(value: unknown): Theme {
  return value === 'classic' ? 'classic' : DEFAULT_THEME;
}

export function readStoredTheme(storage: StorageLike | null = safeStorage()): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Sets data-theme and the meta theme-color on the document. Does not persist. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  root.setAttribute('data-theme', theme);
  const app = root.getAttribute('data-app') === 'bill' ? 'bill' : 'order';
  doc
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_META_COLOR[theme][app]);
}

/** Applies and remembers the theme. Storage failures (private mode) are ignored. */
export function setTheme(
  theme: Theme,
  doc: Document = document,
  storage: StorageLike | null = safeStorage(),
): void {
  applyTheme(theme, doc);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* The choice still applies for this session. */
  }
}
