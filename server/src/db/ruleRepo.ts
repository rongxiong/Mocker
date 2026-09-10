import { all, get, run } from './index';
import type {
  AbortMode,
  EnvelopeType,
  HeaderEntry,
  HttpMethod,
  MockRule,
  ResponseType,
  RuleCondition,
  ResponseVariant,
  RuleConflict,
  SchemaField,
  SchemaRootType,
} from '../types';
import { createDefaultRule, uid } from '../defaults';
import { normalizePath } from '../pathUtils';
import { transaction } from './index';

interface RuleRow {
  id: string;
  name: string;
  method: string;
  path: string;
  enabled: number;
  description: string;
  delay_ms: number;
  delay_jitter_ms: number;
  status_code: number;
  headers: string;
  content_type: string;
  response_type: string;
  body: string;
  file_id: string;
  schema_json: string | null;
  schema_root: string;
  schema_root_min: number;
  schema_root_max: number;
  conditions: string;
  variants: string;
  abort: string;
  envelope: string;
  group_name: string;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToRule(row: RuleRow): MockRule {
  return {
    id: row.id,
    name: row.name,
    method: row.method as HttpMethod,
    path: row.path,
    enabled: row.enabled === 1,
    description: row.description ?? '',
    delayMs: Number(row.delay_ms ?? 0),
    delayJitterMs: Number(row.delay_jitter_ms ?? 0),
    statusCode: Number(row.status_code ?? 200),
    headers: parseJson<HeaderEntry[]>(row.headers, []),
    contentType: row.content_type ?? '',
    responseType: row.response_type as ResponseType,
    body: row.body ?? '',
    fileId: row.file_id ?? '',
    schema: parseJson<SchemaField[]>(row.schema_json, []),
    schemaRoot: (row.schema_root ?? 'object') as SchemaRootType,
    schemaRootMin: Number(row.schema_root_min ?? 2),
    schemaRootMax: Number(row.schema_root_max ?? 5),
    conditions: parseJson<RuleCondition[]>(row.conditions, []),
    variants: parseJson<ResponseVariant[]>(row.variants, []),
    abort: (row.abort ?? 'none') as AbortMode,
    envelope: (row.envelope ?? 'none') as EnvelopeType,
    group: row.group_name ?? '',
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

const SELECT = 'SELECT * FROM rules';
const FIELDS = `id, name, method, path, enabled, description, delay_ms, delay_jitter_ms,
  status_code, headers, content_type, response_type, body, file_id, schema_json,
  schema_root, schema_root_min, schema_root_max, conditions, variants, abort, envelope, group_name,
  created_at, updated_at`;

function valuesOf(rule: MockRule): unknown[] {
  return [
    rule.id,
    rule.name,
    rule.method,
    rule.path,
    rule.enabled,
    rule.description,
    rule.delayMs,
    rule.delayJitterMs,
    rule.statusCode,
    JSON.stringify(rule.headers ?? []),
    rule.contentType ?? '',
    rule.responseType,
    rule.body ?? '',
    rule.fileId ?? '',
    JSON.stringify(rule.schema ?? []),
    rule.schemaRoot ?? 'object',
    rule.schemaRootMin ?? 2,
    rule.schemaRootMax ?? 5,
    JSON.stringify(rule.conditions ?? []),
    JSON.stringify(rule.variants ?? []),
    rule.abort ?? 'none',
    rule.envelope ?? 'none',
    rule.group ?? '',
    rule.createdAt,
    rule.updatedAt,
  ];
}

export function listRules(): MockRule[] {
  return all<RuleRow>(`${SELECT} ORDER BY created_at DESC`).map(rowToRule);
}

export function getRule(id: string): MockRule | undefined {
  const row = get<RuleRow>(`${SELECT} WHERE id = ?`, id);
  return row ? rowToRule(row) : undefined;
}

export function countRules(): number {
  const row = get<{ c: number }>('SELECT COUNT(*) AS c FROM rules');
  return Number(row?.c ?? 0);
}

/** Rules sharing the same method + path shadow each other; the first match wins. */
export function findConflicts(rules: MockRule[] = listRules()): RuleConflict[] {
  const groups = new Map<string, MockRule[]>();
  for (const rule of rules) {
    const key = `${rule.method.toUpperCase()} ${normalizePath(rule.path)}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  const conflicts: RuleConflict[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Mirrors `matchAll`: conditional rules win over catch-all ones regardless of
    // creation order; between equals the newest (first in list order) is used.
    const active = group.find((rule) => (rule.conditions?.length ?? 0) > 0) ?? group[0]!;
    conflicts.push({ key, ids: group.map((rule) => rule.id), activeId: active.id });
  }
  return conflicts;
}

export function insertRule(rule: MockRule): MockRule {
  const placeholders = valuesOf(rule)
    .map(() => '?')
    .join(',');
  run(`INSERT INTO rules (${FIELDS}) VALUES (${placeholders})`, ...valuesOf(rule));
  bumpVersion();
  return rule;
}

export function updateRule(id: string, patch: Partial<MockRule>): MockRule | undefined {
  const current = getRule(id);
  if (!current) return undefined;
  const next: MockRule = { ...current, ...patch, id: current.id, updatedAt: Date.now() };
  run(
    `UPDATE rules SET name=?, method=?, path=?, enabled=?, description=?, delay_ms=?, delay_jitter_ms=?,
      status_code=?, headers=?, content_type=?, response_type=?, body=?, file_id=?, schema_json=?,
      schema_root=?, schema_root_min=?, schema_root_max=?, conditions=?, variants=?, abort=?,
      envelope=?, group_name=?, updated_at=?
     WHERE id=?`,
    next.name,
    next.method,
    next.path,
    next.enabled,
    next.description,
    next.delayMs,
    next.delayJitterMs,
    next.statusCode,
    JSON.stringify(next.headers ?? []),
    next.contentType ?? '',
    next.responseType,
    next.body ?? '',
    next.fileId ?? '',
    JSON.stringify(next.schema ?? []),
    next.schemaRoot ?? 'object',
    next.schemaRootMin ?? 2,
    next.schemaRootMax ?? 5,
    JSON.stringify(next.conditions ?? []),
    JSON.stringify(next.variants ?? []),
    next.abort ?? 'none',
    next.envelope ?? 'none',
    next.group ?? '',
    next.updatedAt,
    id,
  );
  bumpVersion();
  return next;
}

export function deleteRule(id: string): boolean {
  const result = run('DELETE FROM rules WHERE id = ?', id);
  bumpVersion();
  return result.changes > 0;
}

export function deleteAllRules(): void {
  run('DELETE FROM rules');
  bumpVersion();
}

export interface InsertManyResult {
  /** rows that did not exist yet */
  inserted: number;
  /** rows that were overwritten because the id already existed */
  updated: number;
}

export function insertMany(rules: MockRule[]): InsertManyResult {
  const existing = new Set(all<{ id: string }>('SELECT id FROM rules').map((row) => row.id));
  let updated = 0;
  // One transaction for the whole batch: much faster than a commit per row and
  // it keeps a failed import from leaving a half-written rule set behind.
  transaction(() => {
    for (const rule of rules) {
      const placeholders = valuesOf(rule)
        .map(() => '?')
        .join(',');
      if (existing.has(rule.id)) updated += 1;
      run(`INSERT OR REPLACE INTO rules (${FIELDS}) VALUES (${placeholders})`, ...valuesOf(rule));
    }
  });
  bumpVersion();
  return { inserted: rules.length - updated, updated };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Imported variants may miss fields entirely; fill them so `applyVariant` is safe. */
function normalizeVariant(input: unknown, index: number): ResponseVariant {
  const source = (input ?? {}) as Partial<ResponseVariant>;
  return {
    id: text(source.id) || uid(),
    label: text(source.label) || `Variant ${index + 1}`,
    statusCode: text(source.statusCode),
    delayMs: text(source.delayMs),
    body: text(source.body),
  };
}

function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Imported rules are normalised so partially-defined payloads stay usable. */
export function normalizeRule(input: Partial<MockRule>): MockRule {
  const base = createDefaultRule();
  return {
    ...base,
    ...input,
    id: input.id ?? base.id,
    statusCode: toNumber(input.statusCode, base.statusCode),
    delayMs: toNumber(input.delayMs, base.delayMs),
    delayJitterMs: toNumber(input.delayJitterMs, base.delayJitterMs),
    headers: Array.isArray(input.headers) ? input.headers : [],
    schema: Array.isArray(input.schema) ? input.schema : base.schema,
    conditions: Array.isArray(input.conditions) ? input.conditions : [],
    variants: Array.isArray(input.variants) ? input.variants.map(normalizeVariant) : [],
    schemaRoot: input.schemaRoot ?? 'object',
    schemaRootMin: toNumber(input.schemaRootMin, 2),
    schemaRootMax: toNumber(input.schemaRootMax, 5),
    abort: input.abort ?? 'none',
    envelope: input.envelope ?? 'none',
    group: input.group ?? '',
    createdAt: input.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

let version = 0;

export function bumpVersion(): void {
  version += 1;
}

export function ruleVersion(): number {
  return version;
}
