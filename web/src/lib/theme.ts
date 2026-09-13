import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mocker:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage is unavailable in some privacy modes — fall back to the OS.
  }
  return 'system';
}

let mode: ThemeMode = readMode();

function prefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches === true;
}

export function resolveTheme(value: ThemeMode = mode): ResolvedTheme {
  if (value === 'system') return prefersDark() ? 'dark' : 'light';
  return value;
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme();
}

function emit(): void {
  for (const listener of listeners) listener();
}

function paint(): void {
  document.documentElement.classList.toggle('dark', resolveTheme() === 'dark');
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Persisting the preference is best effort only.
  }
  paint();
  emit();
}

/** Called once from the entry point: syncs `system` mode with the OS setting. */
export function initTheme(): void {
  paint();
  window.matchMedia?.(DARK_QUERY).addEventListener('change', () => {
    if (mode === 'system') {
      paint();
      emit();
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return `${mode}:${resolveTheme()}`;
}

function getServerSnapshot(): string {
  return 'system:light';
}

export interface ThemeState {
  /** The stored preference — `system` follows the OS. */
  mode: ThemeMode;
  /** The palette actually painted right now. */
  resolved: ResolvedTheme;
  setThemeMode: (next: ThemeMode) => void;
}

export function useTheme(): ThemeState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [currentMode, resolved] = snapshot.split(':') as [ThemeMode, ResolvedTheme];
  return { mode: currentMode, resolved, setThemeMode };
}

/** The order the header button cycles through. */
export const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};
