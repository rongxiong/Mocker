import { all, run } from './index';
import type { RequestLogEntry } from '../types';

/**
 * Number of log entries kept in SQLite and in the in-memory buffer. The two
 * limits must stay identical, otherwise persisted rows are never surfaced.
 */
export const LOG_RETENTION = 200;

const KEEP = LOG_RETENTION;

interface LogRow {
  id: string;
  at: number;
  method: string;
  path: string;
  rule_id: string;
  rule_name: string;
  status: number;
  duration_ms: number;
  matched: number;
  request_body: string;
  response_body: string;
}

function rowToLog(row: LogRow): RequestLogEntry {
  return {
    id: row.id,
    at: Number(row.at),
    method: row.method,
    path: row.path,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    status: Number(row.status),
    durationMs: Number(row.duration_ms),
    matched: row.matched === 1,
    requestBody: row.request_body,
    responseBody: row.response_body,
  };
}

export function insertLog(entry: RequestLogEntry): void {
  run(
    `INSERT OR REPLACE INTO request_logs
      (id, at, method, path, rule_id, rule_name, status, duration_ms, matched, request_body, response_body)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    entry.id,
    entry.at,
    entry.method,
    entry.path,
    entry.ruleId,
    entry.ruleName,
    entry.status,
    entry.durationMs,
    entry.matched,
    entry.requestBody ?? '',
    entry.responseBody ?? '',
  );
}

export function recentLogsFromDb(limit = KEEP): RequestLogEntry[] {
  return all<LogRow>('SELECT * FROM request_logs ORDER BY at DESC LIMIT ?', limit).map(rowToLog);
}

export function clearLogsInDb(): void {
  run('DELETE FROM request_logs');
}

/** Keeps the table bounded so long-running sessions do not grow without limit. */
export function pruneLogs(keep = KEEP): void {
  run(
    'DELETE FROM request_logs WHERE id NOT IN (SELECT id FROM request_logs ORDER BY at DESC LIMIT ?)',
    keep,
  );
}
