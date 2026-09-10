import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRule } from '../server/src/defaults';
import type { MockRule } from '../server/src/types';

const state = vi.hoisted(() => ({ rules: [] as MockRule[], version: 0 }));

vi.mock('../server/src/db/ruleRepo', () => ({
  listRules: () => state.rules,
  ruleVersion: () => state.version,
}));

import { invalidate, matchAll, matchRequest } from '../server/src/services/matcher';

function setRules(...rules: MockRule[]): void {
  state.rules = rules;
  state.version += 1;
}

function rule(overrides: Partial<MockRule>): MockRule {
  return createDefaultRule({ id: overrides.id ?? `rule-${state.rules.length + 1}`, ...overrides });
}

describe('matchAll', () => {
  beforeEach(() => {
    setRules();
    invalidate();
  });

  it('matches method + path and extracts params', () => {
    setRules(rule({ path: '/api/users/:id' }));
    const [match] = matchAll('GET', '/api/users/42');
    expect(match?.rule.path).toBe('/api/users/:id');
    expect(match?.params).toEqual({ id: '42' });
  });

  it('decodes params', () => {
    setRules(rule({ path: '/api/users/:id' }));
    expect(matchAll('GET', '/api/users/hello%20world')[0]?.params.id).toBe('hello world');
  });

  it('is case-insensitive on the method and ignores trailing slashes', () => {
    setRules(rule({ path: '/api/orders' }));
    expect(matchAll('get', '/api/orders/')).toHaveLength(1);
  });

  it('matches rules stored with a trailing slash', () => {
    setRules(rule({ path: '/api/orders/' }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(1);
    expect(matchAll('GET', '/api/orders/')).toHaveLength(1);
  });

  it('normalizes rules stored without a leading slash', () => {
    setRules(rule({ path: 'api/orders' }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(1);
  });

  it('skips disabled rules', () => {
    setRules(rule({ path: '/api/orders', enabled: false }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(0);
  });

  it('returns no match for a different method', () => {
    setRules(rule({ method: 'GET', path: '/api/orders' }));
    expect(matchAll('POST', '/api/orders')).toHaveLength(0);
  });

  it('returns every candidate in list order', () => {
    const first = rule({ id: 'a', path: '/api/:rest' });
    const second = rule({ id: 'b', path: '/api/orders' });
    setRules(first, second);
    expect(matchAll('GET', '/api/orders').map((item) => item.rule.id)).toEqual(['a', 'b']);
  });

  it('falls back to GET rules for HEAD requests', () => {
    setRules(rule({ method: 'GET', path: '/api/orders' }));
    expect(matchAll('HEAD', '/api/orders')).toHaveLength(1);
    expect(matchAll('HEAD', '/api/missing')).toHaveLength(0);
  });

  it('prefers a dedicated HEAD rule', () => {
    setRules(
      rule({ id: 'get', method: 'GET', path: '/api/orders' }),
      rule({ id: 'head', method: 'HEAD', path: '/api/orders' }),
    );
    expect(matchAll('HEAD', '/api/orders').map((item) => item.rule.id)).toEqual(['head']);
  });

  it('ignores rules with a broken path pattern', () => {
    setRules(rule({ path: '/api/((' }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(0);
  });
});

describe('matchRequest', () => {
  beforeEach(() => {
    setRules();
    invalidate();
  });

  it('returns the first match or null', () => {
    setRules(rule({ path: '/api/orders' }));
    expect(matchRequest('GET', '/api/orders')?.rule.path).toBe('/api/orders');
    expect(matchRequest('GET', '/api/missing')).toBeNull();
  });
});

describe('rule cache', () => {
  beforeEach(() => {
    setRules();
    invalidate();
  });

  it('reuses the compiled list while the version is unchanged', () => {
    setRules(rule({ id: 'a', path: '/api/orders' }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(1);

    // Simulates a write that does not bump the version: the cache stays valid.
    state.rules = [rule({ id: 'b', path: '/api/orders' })];
    expect(matchAll('GET', '/api/orders')[0]?.rule.id).toBe('a');

    invalidate();
    expect(matchAll('GET', '/api/orders')[0]?.rule.id).toBe('b');
  });

  it('refreshes when the rule version changes', () => {
    setRules(rule({ id: 'a', path: '/api/orders' }));
    expect(matchAll('GET', '/api/orders')).toHaveLength(1);

    state.rules = [...state.rules, rule({ id: 'b', path: '/api/users' })];
    state.version += 1;
    expect(matchAll('GET', '/api/users')).toHaveLength(1);
  });
});
