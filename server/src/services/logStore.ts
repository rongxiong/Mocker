import { uid } from '../defaults';
import type { RequestLogEntry } from '../types';
import {
  LOG_RETENTION,
  clearLogsInDb,
  insertLog,
  pruneLogs,
  recentLogsFromDb,
} from '../db/logRepo';

/** Matches the persisted retention so the console shows everything kept in SQLite. */
export const MAX_ENTRIES = LOG_RETENTION;
const BODY_LIMIT = 4000;

let buffer: RequestLogEntry[] = [];
let sincePrune = 0;

function truncate(value: string | undefined): string {
  if (!value) return '';
  return value.length > BODY_LIMIT ? `${value.slice(0, BODY_LIMIT)}…` : value;
}

/** Loads the persisted tail so the console keeps its history across restarts. */
export function hydrateLogs(): void {
  buffer = recentLogsFromDb(MAX_ENTRIES);
}

export function recordLog(
  entry: Omit<RequestLogEntry, 'id' | 'at'> & { requestBody?: string; responseBody?: string },
): RequestLogEntry {
  const full: RequestLogEntry = {
    ...entry,
    requestBody: truncate(entry.requestBody),
    responseBody: truncate(entry.responseBody),
    id: uid(),
    at: Date.now(),
  };
  buffer.push(full);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  insertLog(full);

  sincePrune += 1;
  if (sincePrune >= 50) {
    pruneLogs();
    sincePrune = 0;
  }
  return full;
}

export function recentLogs(): RequestLogEntry[] {
  return [...buffer].reverse();
}

export function clearLogs(): void {
  buffer = [];
  clearLogsInDb();
}
