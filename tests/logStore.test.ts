import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from '../server/src/db';
import { migrate } from '../server/src/db/migrate';
import {
  MAX_ENTRIES,
  clearLogs,
  hydrateLogs,
  recentLogs,
  recordLog,
} from '../server/src/services/logStore';
import { LOG_RETENTION } from '../server/src/db/logRepo';
import type { RequestLogEntry } from '../server/src/types';

beforeAll(async () => {
  await initDb();
  migrate();
});

beforeEach(() => {
  clearLogs();
});

const entry = (overrides: Partial<RequestLogEntry> = {}): Omit<RequestLogEntry, 'id' | 'at'> => ({
  method: 'GET',
  path: '/api/orders',
  ruleId: 'rule-1',
  ruleName: 'Orders',
  status: 200,
  durationMs: 12,
  matched: true,
  ...overrides,
});

describe('logStore', () => {
  it('stamps id/at and returns the newest entry first', () => {
    const first = recordLog(entry({ path: '/one' }));
    const second = recordLog(entry({ path: '/two' }));

    expect(first.id).toBeTruthy();
    expect(first.at).toBeGreaterThan(0);
    expect(second.at).toBeGreaterThanOrEqual(first.at);
    expect(recentLogs().map((item) => item.path)).toEqual(['/two', '/one']);
  });

  it('truncates oversized request and response bodies', () => {
    const long = 'x'.repeat(5000);
    const logged = recordLog(entry({ requestBody: long, responseBody: long }));

    expect(logged.requestBody).toHaveLength(4001);
    expect(logged.requestBody?.endsWith('…')).toBe(true);
    expect(logged.responseBody).toHaveLength(4001);
  });

  it('keeps the same number of entries in memory and in SQLite', () => {
    expect(MAX_ENTRIES).toBe(LOG_RETENTION);
    for (let index = 0; index < MAX_ENTRIES + 30; index += 1) {
      recordLog(entry({ path: `/req-${index}` }));
    }
    const logs = recentLogs();
    expect(logs).toHaveLength(MAX_ENTRIES);
    expect(logs[0]?.path).toBe(`/req-${MAX_ENTRIES + 29}`);
  });

  it('persists logs so they survive a restart', () => {
    recordLog(entry({ path: '/persisted' }));
    // Simulates a process restart: reload the buffer from SQLite.
    hydrateLogs();
    expect(recentLogs().map((item) => item.path)).toEqual(['/persisted']);
  });

  it('clears both the buffer and the persisted rows', () => {
    recordLog(entry());
    clearLogs();
    expect(recentLogs()).toEqual([]);

    hydrateLogs();
    expect(recentLogs()).toEqual([]);
  });
});
