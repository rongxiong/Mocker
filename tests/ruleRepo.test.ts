import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initDb, transaction } from '../server/src/db';
import { migrate } from '../server/src/db/migrate';
import {
  bumpVersion,
  countRules,
  deleteAllRules,
  deleteRule,
  findConflicts,
  getRule,
  insertMany,
  insertRule,
  listRules,
  normalizeRule,
  ruleVersion,
  updateRule,
} from '../server/src/db/ruleRepo';
import { createDefaultRule, createResponseEntry } from '../server/src/defaults';
import { legacyRowToInput } from '../server/src/db/migrate';
import type { MockRule, RuleInput } from '../server/src/types';

beforeAll(async () => {
  await initDb();
  migrate();
});

beforeEach(() => {
  deleteAllRules();
});

const makeRule = (overrides: RuleInput = {}): MockRule =>
  createDefaultRule({ id: `rule-${Math.random().toString(36).slice(2, 8)}`, ...overrides });

describe('rule CRUD', () => {
  it('inserts, reads and counts rules', () => {
    const rule = makeRule({ name: 'User detail', path: '/api/users/:id' });
    insertRule(rule);

    expect(countRules()).toBe(1);
    expect(getRule(rule.id)).toMatchObject({ name: 'User detail', path: '/api/users/:id' });
    expect(listRules()).toHaveLength(1);
  });

  it('returns undefined for unknown ids', () => {
    expect(getRule('missing')).toBeUndefined();
  });

  it('updates only the patched fields and refreshes updatedAt', () => {
    const rule = makeRule({ name: 'before', createdAt: 1, updatedAt: 1 });
    insertRule(rule);

    const updated = updateRule(rule.id, {
      name: 'after',
      responses: [createResponseEntry({ statusCode: 404 })],
    });
    expect(updated?.name).toBe('after');
    expect(updated?.responses[0]?.statusCode).toBe(404);
    expect(updated?.updatedAt).toBeGreaterThan(rule.updatedAt);
    expect(getRule(rule.id)?.name).toBe('after');
  });

  it('folds legacy flat response patches into the default slot', () => {
    const rule = makeRule();
    insertRule(rule);
    const updated = updateRule(rule.id, { delayMs: 42 });
    expect(updated?.responses[0]?.delayMs).toBe(42);
    expect(getRule(rule.id)?.responses[0]?.delayMs).toBe(42);
  });

  it('returns undefined when updating an unknown rule', () => {
    expect(updateRule('missing', { name: 'x' })).toBeUndefined();
  });

  it('reports whether a delete removed a row', () => {
    const rule = makeRule();
    insertRule(rule);
    expect(deleteRule(rule.id)).toBe(true);
    expect(deleteRule(rule.id)).toBe(false);
    expect(countRules()).toBe(0);
  });

  it('round-trips complete response slots in the JSON column', () => {
    const rule = makeRule({
      responses: [
        createResponseEntry({
          statusCode: 201,
          headers: [{ key: 'X-Token', value: 'abc' }],
          schema: [{ id: 'f1', name: 'id', type: 'int', min: 1, max: 2 }],
          envelope: 'codeData',
          conditions: [{ id: 's1', source: 'header', key: 'x-env', op: 'eq', value: 'vip' }],
          conditionsEnabled: false,
        }),
        createResponseEntry({ label: '失败', statusCode: 500, body: '{}', enabled: false }),
      ],
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
      conditionsEnabled: false,
      abort: 'close',
      group: 'users',
    });
    insertRule(rule);

    const stored = getRule(rule.id);
    expect(stored?.responses).toHaveLength(2);
    expect(stored?.responses[0]).toMatchObject({
      statusCode: 201,
      headers: [{ key: 'X-Token', value: 'abc' }],
      schema: [{ id: 'f1', name: 'id', type: 'int', min: 1, max: 2 }],
      envelope: 'codeData',
      conditions: [{ id: 's1', source: 'header', key: 'x-env', op: 'eq', value: 'vip' }],
      conditionsEnabled: false,
    });
    expect(stored?.responses[0]?.enabled).toBe(true);
    expect(stored?.responses[1]?.conditions).toEqual([]);
    expect(stored?.responses[1]?.conditionsEnabled).toBe(true);
    expect(stored?.responses[1]).toMatchObject({
      label: '失败',
      statusCode: 500,
      body: '{}',
      enabled: false,
    });
    expect(stored?.conditions).toEqual([
      { id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' },
    ]);
    expect(stored?.abort).toBe('close');
    expect(stored?.conditionsEnabled).toBe(false);
    expect(stored?.group).toBe('users');
  });

  it('replaces existing rows on insertMany and reports the counts', () => {
    const rule = makeRule({ id: 'shared', name: 'first' });
    insertRule(rule);
    const result = insertMany([{ ...rule, name: 'second' }, makeRule({ id: 'fresh' })]);

    expect(result).toEqual({ inserted: 1, updated: 1 });
    expect(countRules()).toBe(2);
    expect(getRule('shared')?.name).toBe('second');
  });

  it('rolls back a failed batch import', () => {
    const keep = makeRule({ id: 'keep' });
    insertRule(keep);

    expect(() =>
      transaction(() => {
        deleteAllRules();
        insertMany([makeRule({ id: 'new' })]);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(countRules()).toBe(1);
    expect(getRule('keep')?.id).toBe('keep');
  });
});

describe('findConflicts', () => {
  it('groups rules that share method + path', () => {
    const first = makeRule({ id: 'a', method: 'GET', path: '/api/orders' });
    const second = makeRule({ id: 'b', method: 'GET', path: '/api/orders/' });
    const other = makeRule({ id: 'c', method: 'POST', path: '/api/orders' });

    const conflicts = findConflicts([first, second, other]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ key: 'GET /api/orders', ids: ['a', 'b'], activeId: 'a' });
  });

  it('returns no conflicts for unique rules', () => {
    expect(findConflicts([makeRule({ id: 'a' }), makeRule({ id: 'b', path: '/other' })])).toEqual(
      [],
    );
  });

  it('marks the conditional rule as active, matching the matcher priority', () => {
    const plain = makeRule({ id: 'plain', path: '/api/users' });
    const conditional = makeRule({
      id: 'vip',
      path: '/api/users',
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });

    // Newest first, which is the order `listRules()` returns.
    const conflicts = findConflicts([conditional, plain]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.activeId).toBe('vip');
  });

  it('treats a rule with the condition switch off as a catch-all', () => {
    const plain = makeRule({ id: 'plain', path: '/api/orders' });
    const parked = makeRule({
      id: 'parked',
      path: '/api/orders',
      conditionsEnabled: false,
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });

    // Parked conditions no longer make the rule specific, so the catch-all wins.
    const conflicts = findConflicts([plain, parked]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.activeId).toBe('plain');
  });
});

describe('normalizeRule', () => {
  it('fills defaults for partial payloads', () => {
    const rule = normalizeRule({ name: 'imported' });
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe('imported');
    expect(rule.method).toBe('GET');
    expect(rule.responses).toHaveLength(1);
    expect(rule.responses[0]?.responseType).toBe('json');
    expect(rule.responses[0]?.enabled).toBe(true);
    expect(rule.responses[0]?.headers).toEqual([]);
    expect(rule.conditions).toEqual([]);
    expect(rule.conditionsEnabled).toBe(true);
    expect(rule.responses[0]?.schema.length).toBeGreaterThan(0);
    expect(rule.abort).toBe('none');
    expect(rule.createdAt).toBeGreaterThan(0);
  });

  it('keeps provided ids and drops malformed collections', () => {
    const rule = normalizeRule({
      id: 'keep-me',
      headers: 'not-an-array' as unknown as RuleInput['headers'],
      schema: 'nope' as unknown as RuleInput['schema'],
    });
    expect(rule.id).toBe('keep-me');
    expect(rule.responses[0]?.headers).toEqual([]);
    expect(Array.isArray(rule.responses[0]?.schema)).toBe(true);
  });

  it('converts a v2 database row into full response slots', () => {
    const rule = normalizeRule(
      legacyRowToInput({
        id: 'legacy',
        name: 'v2 rule',
        method: 'GET',
        path: '/api/legacy',
        enabled: 1,
        description: '',
        group_name: '',
        status_code: 200,
        headers: '[]',
        content_type: '',
        response_type: 'json',
        body: '{"base":true}',
        file_id: '',
        schema_json: '[]',
        schema_root: 'object',
        schema_root_min: 2,
        schema_root_max: 5,
        delay_ms: 30,
        delay_jitter_ms: 10,
        envelope: 'none',
        conditions: '[]',
        conditions_enabled: 1,
        variants: '[{"id":"v1","label":"bad","statusCode":"500","delayMs":"","body":"{}"}]',
        variants_enabled: 1,
        abort: 'none',
        created_at: 1,
        updated_at: 1,
      }),
    );

    expect(rule.responses).toHaveLength(2);
    expect(rule.responses[0]).toMatchObject({
      statusCode: 200,
      delayMs: 30,
      delayJitterMs: 10,
      body: '{"base":true}',
    });
    expect(rule.responses[1]).toMatchObject({
      id: 'v1',
      label: 'bad',
      statusCode: 500,
      delayMs: 30,
      delayJitterMs: 10,
      body: '{}',
    });
    expect(rule.responses.every((item) => item.enabled)).toBe(true);
  });

  it('maps a disabled v2 sequence switch to disabled slots', () => {
    const rule = normalizeRule(
      legacyRowToInput({
        id: 'legacy-off',
        method: 'GET',
        path: '/api/off',
        variants: '[{"id":"v1","statusCode":"500","body":"{}"}]',
        variants_enabled: 0,
      }),
    );

    expect(rule.responses).toHaveLength(2);
    expect(rule.responses.map((item) => item.enabled)).toEqual([true, false]);
  });

  it('fills missing fields inside imported response slots', () => {
    const rule = normalizeRule({
      responses: [{ id: 'slot-1', statusCode: 500 }, { label: 'broken' }],
    } as unknown as RuleInput);

    expect(rule.responses).toHaveLength(2);
    expect(rule.responses[0]).toMatchObject({
      id: 'slot-1',
      statusCode: 500,
      responseType: 'json',
    });
    expect(rule.responses[1]?.id).toBeTruthy();
    expect(Array.isArray(rule.responses[1]?.schema)).toBe(true);
  });

  it('coerces numeric fields coming from hand-written JSON', () => {
    const rule = normalizeRule({
      statusCode: '404' as unknown as number,
      delayMs: '10' as unknown as number,
    });
    expect(rule.responses[0]?.statusCode).toBe(404);
    expect(rule.responses[0]?.delayMs).toBe(10);
  });
});

describe('rule version', () => {
  it('bumps on every write so the matcher cache is invalidated', () => {
    const before = ruleVersion();
    const rule = makeRule();
    insertRule(rule);
    updateRule(rule.id, { name: 'x' });
    deleteRule(rule.id);
    expect(ruleVersion()).toBe(before + 3);

    const manual = ruleVersion();
    bumpVersion();
    expect(ruleVersion()).toBe(manual + 1);
  });
});
