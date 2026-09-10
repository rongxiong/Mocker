import { all, get, run } from './index';

export const SETTING_KEYS = ['proxyTarget'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export function getSetting(key: SettingKey, fallback = ''): string {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? fallback;
}

export function setSetting(key: SettingKey, value: string): void {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export function allSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const result: Record<string, string> = {};
  for (const key of SETTING_KEYS) result[key] = '';
  for (const row of rows) result[row.key] = row.value;
  return result;
}
