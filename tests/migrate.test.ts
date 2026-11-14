import { beforeAll, describe, expect, it } from 'vitest';
import { db, initDb } from '../server/src/db';
import {
  migrate,
  migrateLegacyResponses,
  migrateSequenceSwitchToSlots,
} from '../server/src/db/migrate';
import { listRules } from '../server/src/db/ruleRepo';
import { createResponseEntry } from '../server/src/defaults';

/**
 * Recreates a v2 table (flat response columns + `variants`) so the real ALTER
 * TABLE / data backfill path is exercised, not just the pure row converter.
 */
function createV2Table(): void {
  db().exec(`
    DROP TABLE IF EXISTS rules;
    CREATE TABLE rules (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL DEFAULT '',
      method             TEXT NOT NULL DEFAULT 'GET',
      path               TEXT NOT NULL DEFAULT '',
      enabled            INTEGER NOT NULL DEFAULT 1,
      description        TEXT NOT NULL DEFAULT '',
      delay_ms           INTEGER NOT NULL DEFAULT 0,
      delay_jitter_ms    INTEGER NOT NULL DEFAULT 0,
      status_code        INTEGER NOT NULL DEFAULT 200,
      headers            TEXT NOT NULL DEFAULT '[]',
      content_type       TEXT NOT NULL DEFAULT '',
      response_type      TEXT NOT NULL DEFAULT 'json',
      body               TEXT NOT NULL DEFAULT '',
      file_id            TEXT NOT NULL DEFAULT '',
      schema_json        TEXT,
      schema_root        TEXT NOT NULL DEFAULT 'object',
      schema_root_min    INTEGER NOT NULL DEFAULT 2,
      schema_root_max    INTEGER NOT NULL DEFAULT 5,
      conditions         TEXT NOT NULL DEFAULT '[]',
      conditions_enabled INTEGER NOT NULL DEFAULT 1,
      variants           TEXT NOT NULL DEFAULT '[]',
      variants_enabled   INTEGER NOT NULL DEFAULT 1,
      abort              TEXT NOT NULL DEFAULT 'none',
      envelope           TEXT NOT NULL DEFAULT 'none',
      group_name         TEXT NOT NULL DEFAULT '',
      created_at         INTEGER NOT NULL DEFAULT 0,
      updated_at         INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/** An early v3 table: `responses` plus the now-retired master switch column. */
const V3_SCHEMA = `
  DROP TABLE IF EXISTS rules;
  CREATE TABLE rules (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL DEFAULT '',
    method             TEXT NOT NULL DEFAULT 'GET',
    path               TEXT NOT NULL DEFAULT '',
    enabled            INTEGER NOT NULL DEFAULT 1,
    description        TEXT NOT NULL DEFAULT '',
    conditions         TEXT NOT NULL DEFAULT '[]',
    conditions_enabled INTEGER NOT NULL DEFAULT 1,
    abort              TEXT NOT NULL DEFAULT 'none',
    group_name         TEXT NOT NULL DEFAULT '',
    responses          TEXT NOT NULL DEFAULT '[]',
    sequence_enabled   INTEGER NOT NULL DEFAULT 1,
    created_at         INTEGER NOT NULL DEFAULT 0,
    updated_at         INTEGER NOT NULL DEFAULT 0
  );
`;

beforeAll(async () => {
  await initDb();
  migrate();
});

describe('v2 -> v3 database migration', () => {
  it('backfills every v2 row into complete response slots', () => {
    createV2Table();
    db()
      .prepare(
        `INSERT INTO rules (
          id, name, method, path, enabled, description, delay_ms, delay_jitter_ms,
          status_code, headers, content_type, response_type, body, file_id, schema_json,
          schema_root, schema_root_min, schema_root_max, conditions, conditions_enabled,
          variants, variants_enabled, abort, envelope, group_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-1',
        'Legacy rule',
        'GET',
        '/api/legacy',
        1,
        '',
        25,
        10,
        200,
        '[{"key":"X-Base","value":"1"}]',
        '',
        'json',
        '{"legacy":true}',
        '',
        '[]',
        'object',
        2,
        5,
        '[{"id":"c1","source":"query","key":"type","op":"eq","value":"vip"}]',
        1,
        '[{"id":"v1","label":"bad","statusCode":"503","delayMs":"","body":"{\\"legacy\\":false}"}]',
        0,
        'none',
        'codeData',
        'legacy',
        1,
        1,
      );

    migrate();

    const rule = listRules()[0];
    expect(rule?.id).toBe('legacy-1');
    // variants_enabled = 0 in the v2 row: only the default slot stays enabled.
    expect(rule?.responses.map((item) => item.enabled)).toEqual([true, false]);
    expect(rule?.conditions).toHaveLength(1);
    expect(rule?.responses).toHaveLength(2);
    expect(rule?.responses[0]).toMatchObject({
      statusCode: 200,
      delayMs: 25,
      delayJitterMs: 10,
      body: '{"legacy":true}',
      envelope: 'codeData',
      headers: [{ key: 'X-Base', value: '1' }],
    });
    expect(rule?.responses[1]).toMatchObject({
      id: 'v1',
      label: 'bad',
      statusCode: 503,
      delayMs: 25,
      delayJitterMs: 10,
      body: '{"legacy":false}',
      responseType: 'json',
      headers: [{ key: 'X-Base', value: '1' }],
    });
    expect(rule?.responses[1]?.enabled).toBe(false);
  });

  it('is idempotent', () => {
    migrate();
    const rule = listRules()[0];
    expect(rule?.responses).toHaveLength(2);
    expect(rule?.responses[1]?.statusCode).toBe(503);
    expect(rule?.responses.map((item) => item.enabled)).toEqual([true, false]);
  });

  it('converts an early v3 master switch into per-slot switches once', () => {
    db().exec(V3_SCHEMA);
    db()
      .prepare(
        'INSERT INTO rules (id, name, path, responses, sequence_enabled) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        'v3-old',
        'v3 rule',
        '/api/v3',
        JSON.stringify([
          createResponseEntry({ body: '{"slot":1}' }),
          createResponseEntry({ body: '{"slot":2}' }),
        ]),
        0,
      );

    migrateSequenceSwitchToSlots();
    const migrated = listRules()[0];
    expect(migrated?.responses.map((item) => item.enabled)).toEqual([true, false]);

    // The old column is flipped, so re-enabling a slot by hand is never undone.
    const reenabled = [migrated!.responses[0], { ...migrated!.responses[1], enabled: true }];
    db()
      .prepare('UPDATE rules SET responses = ? WHERE id = ?')
      .run(JSON.stringify(reenabled), 'v3-old');
    migrateSequenceSwitchToSlots();
    expect(listRules()[0]?.responses[1]?.enabled).toBe(true);
  });

  it('resumes a half-finished v2 backfill', () => {
    createV2Table();
    // Simulate a crash after ALTER TABLE but before any row was backfilled.
    db().exec("ALTER TABLE rules ADD COLUMN responses TEXT NOT NULL DEFAULT '[]'");
    db()
      .prepare(
        `INSERT INTO rules (id, name, path, body, status_code, variants, variants_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('half', 'Half migrated', '/api/half', '{"resumed":true}', 200, '[]', 1);

    migrateLegacyResponses();
    expect(listRules()[0]?.responses[0]?.body).toBe('{"resumed":true}');
  });

  it('survives a malformed responses column during the v3 switch migration', () => {
    db().exec(V3_SCHEMA);
    db()
      .prepare(
        'INSERT INTO rules (id, name, path, responses, sequence_enabled) VALUES (?, ?, ?, ?, ?)',
      )
      .run('v3-bad', 'bad row', '/api/bad', 'null', 0);

    expect(() => migrateSequenceSwitchToSlots()).not.toThrow();
    expect(listRules()[0]?.responses).toHaveLength(1);
    expect(listRules()[0]?.responses[0]?.enabled).toBe(true);
  });
});
