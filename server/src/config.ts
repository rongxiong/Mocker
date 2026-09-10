import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function resolveDataDir(): string {
  const configured = process.env.DATA_DIR;
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'data');
}

export const DATA_DIR = resolveDataDir();
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'mocker.db');

const DEFAULT_PORT = 3001;

/** Falls back to the default port when `PORT` is missing or not a valid port number. */
export const PORT = (() => {
  const raw = process.env.PORT?.trim();
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    console.warn(`[mocker] Invalid PORT "${raw}", falling back to ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return parsed;
})();

/**
 * Bind address. Defaults to loopback because the admin API can execute arbitrary
 * JavaScript — set `HOST=0.0.0.0` explicitly to expose Mocker on the LAN.
 */
export const HOST = process.env.HOST ?? '127.0.0.1';

export function isLoopbackHost(): boolean {
  return HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
}

/** Mock entry prefix, e.g. `/mock`. Set to empty string to serve mocks from root. */
export const MOCK_PREFIX = (process.env.MOCK_PREFIX ?? '/mock').replace(/\/+$/, '');

export const ADMIN_PREFIX = '/__api';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const WEB_DIST_DIR = path.resolve(process.cwd(), 'dist/web');

export const MAX_DELAY_MS = 60_000;
export const SCRIPT_TIMEOUT_MS = 2_000;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function ensureDirs(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function machineUrls(port = PORT): string[] {
  if (isLoopbackHost()) return [`http://localhost:${port}`];
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4') {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls.length > 0 ? urls : [`http://localhost:${port}`];
}
