import { db } from './index';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rules (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL DEFAULT '',
  method         TEXT NOT NULL DEFAULT 'GET',
  path           TEXT NOT NULL DEFAULT '',
  enabled        INTEGER NOT NULL DEFAULT 1,
  description    TEXT NOT NULL DEFAULT '',
  delay_ms       INTEGER NOT NULL DEFAULT 0,
  delay_jitter_ms INTEGER NOT NULL DEFAULT 0,
  status_code    INTEGER NOT NULL DEFAULT 200,
  headers        TEXT NOT NULL DEFAULT '[]',
  content_type   TEXT NOT NULL DEFAULT '',
  response_type  TEXT NOT NULL DEFAULT 'json',
  body           TEXT NOT NULL DEFAULT '',
  file_id        TEXT NOT NULL DEFAULT '',
  schema_json    TEXT,
  schema_root    TEXT NOT NULL DEFAULT 'object',
  schema_root_min INTEGER NOT NULL DEFAULT 2,
  schema_root_max INTEGER NOT NULL DEFAULT 5,
  conditions     TEXT NOT NULL DEFAULT '[]',
  variants       TEXT NOT NULL DEFAULT '[]',
  abort          TEXT NOT NULL DEFAULT 'none',
  envelope       TEXT NOT NULL DEFAULT 'none',
  group_name     TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL DEFAULT 0
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

export function migrate(): void {
  db().exec(SCHEMA);

  ensureColumn('rules', 'delay_jitter_ms', 'delay_jitter_ms INTEGER NOT NULL DEFAULT 0');
  ensureColumn('rules', 'schema_root', "schema_root TEXT NOT NULL DEFAULT 'object'");
  ensureColumn('rules', 'schema_root_min', 'schema_root_min INTEGER NOT NULL DEFAULT 2');
  ensureColumn('rules', 'schema_root_max', 'schema_root_max INTEGER NOT NULL DEFAULT 5');
  ensureColumn('rules', 'conditions', "conditions TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('rules', 'variants', "variants TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('rules', 'abort', "abort TEXT NOT NULL DEFAULT 'none'");
  ensureColumn('rules', 'envelope', "envelope TEXT NOT NULL DEFAULT 'none'");
  ensureColumn('rules', 'group_name', "group_name TEXT NOT NULL DEFAULT ''");
}
