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
import { createDefaultRule } from '../server/src/defaults';
import type { MockRule } from '../server/src/types';

beforeAll(async () => {
  await initDb();
  migrate();
});

beforeEach(() => {
  deleteAllRules();
});

const makeRule = (overrides: Partial<MockRule> = {}): MockRule =>
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
    const rule = makeRule({ name: 'before', statusCode: 200, createdAt: 1, updatedAt: 1 });
    insertRule(rule);

    const updated = updateRule(rule.id, { name: 'after', statusCode: 404 });
    expect(updated?.name).toBe('after');
    expect(updated?.statusCode).toBe(404);
    expect(updated?.updatedAt).toBeGreaterThan(rule.updatedAt);
    expect(getRule(rule.id)?.name).toBe('after');
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

  it('round-trips nested JSON columns', () => {
    const rule = makeRule({
      headers: [{ key: 'X-Token', value: 'abc' }],
      schema: [{ id: 'f1', name: 'id', type: 'int', min: 1, max: 2 }],
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
      variants: [{ id: 'v1', label: 'ok', statusCode: '201', delayMs: '0', body: '{}' }],
      abort: 'close',
      envelope: 'codeData',
      group: 'users',
    });
    insertRule(rule);

    const stored = getRule(rule.id);
    expect(stored?.headers).toEqual([{ key: 'X-Token', value: 'abc' }]);
    expect(stored?.schema).toEqual([{ id: 'f1', name: 'id', type: 'int', min: 1, max: 2 }]);
    expect(stored?.conditions).toEqual([
      { id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' },
    ]);
    expect(stored?.variants).toEqual([
      { id: 'v1', label: 'ok', statusCode: '201', delayMs: '0', body: '{}' },
    ]);
    expect(stored?.abort).toBe('close');
    expect(stored?.envelope).toBe('codeData');
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
});

describe('normalizeRule', () => {
  it('fills defaults for partial payloads', () => {
    const rule = normalizeRule({ name: 'imported' });
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe('imported');
    expect(rule.method).toBe('GET');
    expect(rule.responseType).toBe('json');
    expect(rule.headers).toEqual([]);
    expect(rule.conditions).toEqual([]);
    expect(rule.variants).toEqual([]);
    expect(rule.schema.length).toBeGreaterThan(0);
    expect(rule.abort).toBe('none');
    expect(rule.envelope).toBe('none');
    expect(rule.createdAt).toBeGreaterThan(0);
  });

  it('keeps provided ids and drops malformed collections', () => {
    const rule = normalizeRule({
      id: 'keep-me',
      headers: 'not-an-array' as unknown as MockRule['headers'],
      schema: 'nope' as unknown as MockRule['schema'],
    });
    expect(rule.id).toBe('keep-me');
    expect(rule.headers).toEqual([]);
    expect(Array.isArray(rule.schema)).toBe(true);
  });

  it('fills missing variant fields so applyVariant never sees undefined', () => {
    const rule = normalizeRule({
      variants: [
        { id: 'v1' },
        { label: 'broken', statusCode: '500' },
      ] as unknown as MockRule['variants'],
    });

    expect(rule.variants).toEqual([
      { id: 'v1', label: 'Variant 1', statusCode: '', delayMs: '', body: '' },
      { id: expect.any(String), label: 'broken', statusCode: '500', delayMs: '', body: '' },
    ]);
  });

  it('coerces numeric fields coming from hand-written JSON', () => {
    const rule = normalizeRule({
      statusCode: '404' as unknown as number,
      delayMs: '10' as unknown as number,
    });
    expect(rule.statusCode).toBe(404);
    expect(rule.delayMs).toBe(10);
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
