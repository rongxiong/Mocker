import { db, transaction } from './index';
import { normalizeResponses, normalizeRule } from '../defaults';
import type { RuleInput } from '../types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rules (
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
  created_at         INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rules_method ON rules(method);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS request_logs (
  id           TEXT PRIMARY KEY,
  at           INTEGER NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT '',
  path         TEXT NOT NULL DEFAULT '',
  rule_id      TEXT NOT NULL DEFAULT '',
  rule_name    TEXT NOT NULL DEFAULT '',
  status       INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  matched      INTEGER NOT NULL DEFAULT 0,
  request_body TEXT NOT NULL DEFAULT '',
  response_body TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_request_logs_at ON request_logs(at);
`;

type Row = Record<string, unknown>;

function columnsOf(table: string): string[] {
  return (db().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  );
}

function ensureColumn(table: string, column: string, ddl: string): void {
  if (!columnsOf(table).includes(column)) {
    db().exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * The condition and variant switches started out as a single `advanced_enabled`
 * flag. Carry its value over to the split columns so a rule whose advanced
 * settings were already parked stays parked, then leave the old column unused.
 */
function splitAdvancedSwitch(): void {
  const columns = columnsOf('rules');
  const legacy = columns.includes('advanced_enabled');
  for (const column of ['conditions_enabled', 'variants_enabled']) {
    const created = !columns.includes(column);
    ensureColumn('rules', column, `${column} INTEGER NOT NULL DEFAULT 1`);
    if (created && legacy) {
      db().exec(`UPDATE rules SET ${column} = advanced_enabled`);
    }
  }
}

/** Converts one pre-v3 row (flat response columns + `variants`) into the new model. */
export function legacyRowToInput(row: Row): RuleInput {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    method: String(row.method ?? 'GET'),
    path: String(row.path ?? ''),
    enabled: row.enabled !== 0,
    description: String(row.description ?? ''),
    group: String(row.group_name ?? ''),
    conditions: parseJson(row.conditions, []),
    conditionsEnabled: row.conditions_enabled !== 0,
    abort: String(row.abort ?? 'none'),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    statusCode: Number(row.status_code ?? 200),
    headers: parseJson(row.headers, []),
    contentType: String(row.content_type ?? ''),
    responseType: String(row.response_type ?? 'json'),
    body: String(row.body ?? ''),
    fileId: String(row.file_id ?? ''),
    schema: parseJson(row.schema_json, []),
    schemaRoot: String(row.schema_root ?? 'object'),
    schemaRootMin: Number(row.schema_root_min ?? 2),
    schemaRootMax: Number(row.schema_root_max ?? 5),
    delayMs: Number(row.delay_ms ?? 0),
    delayJitterMs: Number(row.delay_jitter_ms ?? 0),
    envelope: String(row.envelope ?? 'none'),
    variants: parseJson(row.variants, []),
    variantsEnabled: row.variants_enabled !== 0,
  } as RuleInput;
}

/**
 * v2 stored the response in flat columns plus an optional list of partial
 * overrides. v3 keeps a single `responses` JSON column where every slot holds
 * a complete config. Legacy columns are left in place (unused) so the migration
 * is non-destructive; empty `responses` rows keep being backfilled on every
 * start until they are filled, which makes an interrupted migration resumable.
 */
export function migrateLegacyResponses(): void {
  ensureColumn('rules', 'responses', "responses TEXT NOT NULL DEFAULT '[]'");
  // Only legacy tables have the flat `body` column. Backfill every row whose
  // responses column is still empty, so a crash mid-migration can be resumed.
  if (!columnsOf('rules').includes('body')) return;

  const rows = db()
    .prepare("SELECT * FROM rules WHERE responses IS NULL OR responses = '[]'")
    .all() as Row[];
  const update = db().prepare('UPDATE rules SET responses = ? WHERE id = ?');
  transaction(() => {
    for (const row of rows) {
      const rule = normalizeRule(legacyRowToInput(row));
      update.run(JSON.stringify(rule.responses), row.id);
    }
  });
}

/**
 * Early v3 had a master "sequence enabled" switch. Per-slot switches replace
 * it: a rule whose master switch was off keeps only its default slot enabled.
 * The old column is flipped to 1 afterwards so this runs exactly once.
 */
export function migrateSequenceSwitchToSlots(): void {
  if (!columnsOf('rules').includes('sequence_enabled')) return;
  const rows = db()
    .prepare('SELECT id, responses FROM rules WHERE sequence_enabled = 0')
    .all() as Row[];
  const update = db().prepare('UPDATE rules SET responses = ?, sequence_enabled = 1 WHERE id = ?');
  transaction(() => {
    for (const row of rows) {
      const parsed: unknown = parseJson<unknown>(row.responses, []);
      // Never let a malformed JSON column crash startup: normalise it to a
      // complete slot (at least one) before writing it back.
      const slots = normalizeResponses(Array.isArray(parsed) ? parsed : []);
      const next = slots.map((slot, index) => (index === 0 ? slot : { ...slot, enabled: false }));
      update.run(JSON.stringify(next), row.id);
    }
  });
}

export function migrate(): void {
  db().exec(SCHEMA);

  const legacyTable = columnsOf('rules').includes('body');
  if (legacyTable) {
    // Older schemas may predate these columns; the row reader tolerates NULLs.
    ensureColumn('rules', 'conditions', "conditions TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('rules', 'variants', "variants TEXT NOT NULL DEFAULT '[]'");
    ensureColumn('rules', 'abort', "abort TEXT NOT NULL DEFAULT 'none'");
    ensureColumn('rules', 'group_name', "group_name TEXT NOT NULL DEFAULT ''");
    splitAdvancedSwitch();
  }

  migrateLegacyResponses();
  migrateSequenceSwitchToSlots();
}
