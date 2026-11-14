import { all, get, run } from './index';
import type {
  AbortMode,
  HttpMethod,
  MockRule,
  ResponseEntry,
  RuleCondition,
  RuleConflict,
  RuleInput,
} from '../types';
import {
  coerceRulePatch,
  normalizeResponses,
  normalizeRule as normalizeRuleInput,
} from '../defaults';
import { hasEffectiveConditions } from '../services/conditions';
import { normalizePath } from '../pathUtils';
import { transaction } from './index';

export { normalizeRuleInput as normalizeRule };

interface RuleRow {
  id: string;
  name: string;
  method: string;
  path: string;
  enabled: number;
  description: string;
  conditions: string;
  conditions_enabled: number;
  abort: string;
  group_name: string;
  responses: string;
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
    conditionsEnabled: row.conditions_enabled !== 0,
    conditions: parseJson<RuleCondition[]>(row.conditions, []),
    abort: (row.abort ?? 'none') as AbortMode,
    responses: normalizeResponses(parseJson<ResponseEntry[]>(row.responses, [])),
    group: row.group_name ?? '',
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

const SELECT = 'SELECT * FROM rules';
const FIELDS = `id, name, method, path, enabled, description, conditions, conditions_enabled,
  abort, responses, group_name, created_at, updated_at`;

function valuesOf(rule: MockRule): unknown[] {
  return [
    rule.id,
    rule.name,
    rule.method,
    rule.path,
    rule.enabled ? 1 : 0,
    rule.description,
    JSON.stringify(rule.conditions ?? []),
    rule.conditionsEnabled === false ? 0 : 1,
    rule.abort ?? 'none',
    JSON.stringify(normalizeResponses(rule.responses)),
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
    const active = group.find((rule) => hasEffectiveConditions(rule)) ?? group[0]!;
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

export function updateRule(id: string, patch: RuleInput): MockRule | undefined {
  const current = getRule(id);
  if (!current) return undefined;
  const next: MockRule = {
    ...current,
    ...coerceRulePatch(patch, current),
    id: current.id,
    updatedAt: Date.now(),
  };
  run(
    `UPDATE rules SET name=?, method=?, path=?, enabled=?, description=?, conditions=?,
      conditions_enabled=?, abort=?, responses=?, group_name=?, updated_at=?
     WHERE id=?`,
    next.name,
    next.method,
    next.path,
    next.enabled ? 1 : 0,
    next.description,
    JSON.stringify(next.conditions ?? []),
    next.conditionsEnabled === false ? 0 : 1,
    next.abort ?? 'none',
    JSON.stringify(normalizeResponses(next.responses)),
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

// `normalizeRule` lives in `defaults.ts` (pure model logic, no DB dependency)
// and is re-exported here so the admin routes keep their existing import.

let version = 0;

export function bumpVersion(): void {
  version += 1;
}

export function ruleVersion(): number {
  return version;
}
