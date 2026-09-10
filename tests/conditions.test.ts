import { describe, expect, it } from 'vitest';
import { matchesConditions } from '../server/src/services/conditions';
import type { MockRequestSnapshot, RuleCondition } from '../server/src/types';

const request = (overrides: Partial<MockRequestSnapshot> = {}): MockRequestSnapshot => ({
  method: 'GET',
  path: '/x',
  params: { id: '42' },
  query: { type: 'vip' },
  headers: { 'x-env': 'staging' },
  cookies: { token: 'abc' },
  body: { user: { type: 'vip', age: 20 } },
  ...overrides,
});

const cond = (partial: Partial<RuleCondition>): RuleCondition => ({
  id: 'c',
  source: 'query',
  key: 'type',
  op: 'eq',
  value: 'vip',
  ...partial,
});

describe('matchesConditions', () => {
  it('passes when there are no conditions', () => {
    expect(matchesConditions([], request())).toBe(true);
    expect(matchesConditions(undefined, request())).toBe(true);
  });

  it('evaluates every source', () => {
    expect(matchesConditions([cond({})], request())).toBe(true);
    expect(
      matchesConditions([cond({ source: 'header', key: 'X-Env', value: 'staging' })], request()),
    ).toBe(true);
    expect(
      matchesConditions([cond({ source: 'cookie', key: 'token', value: 'abc' })], request()),
    ).toBe(true);
    expect(matchesConditions([cond({ source: 'path', key: 'id', value: '42' })], request())).toBe(
      true,
    );
    expect(
      matchesConditions([cond({ source: 'body', key: 'user.type', value: 'vip' })], request()),
    ).toBe(true);
  });

  it('supports all operators', () => {
    expect(matchesConditions([cond({ op: 'ne', value: 'guest' })], request())).toBe(true);
    expect(matchesConditions([cond({ op: 'contains', value: 'vi' })], request())).toBe(true);
    expect(matchesConditions([cond({ op: 'regex', value: '^v.p$' })], request())).toBe(true);
    expect(matchesConditions([cond({ op: 'exists' })], request())).toBe(true);
    expect(
      matchesConditions(
        [cond({ source: 'body', key: 'user.age', op: 'gt', value: '18' })],
        request(),
      ),
    ).toBe(true);
    expect(
      matchesConditions(
        [cond({ source: 'body', key: 'user.age', op: 'lt', value: '18' })],
        request(),
      ),
    ).toBe(false);
  });

  it('requires every condition to pass (AND)', () => {
    expect(
      matchesConditions(
        [cond({}), cond({ source: 'header', key: 'x-env', value: 'production' })],
        request(),
      ),
    ).toBe(false);
  });

  it('fails when the key is missing', () => {
    expect(matchesConditions([cond({ key: 'missing' })], request())).toBe(false);
  });
});
