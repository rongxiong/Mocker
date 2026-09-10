import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatTime(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTime(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function isValidJson(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

export interface HttpCommandInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Builds a copy-pasteable HTTPie command for the console / terminal. */
export function buildHttpie({ method, url, headers, body }: HttpCommandInput): string {
  const escape = (value: string) => value.replace(/'/g, `'\\''`);
  const parts = [`http -v --ignore-stdin ${method} '${escape(url)}'`];
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!key) continue;
    parts.push(`  '${escape(`${key}: ${value}`)}'`);
  }
  if (body) parts.push(`  --raw '${escape(body)}'`);
  return parts.join(' \\\n');
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.resolve();
}
