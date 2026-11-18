import { describe, expect, it } from 'vitest';
import { applyRuleOrder, reconcileOrder, reorderIds } from '../web/src/lib/ruleOrder';
import type { MockRule } from '../server/src/types';

const rulesOf = (ids: string[]): MockRule[] =>
  ids.map(
    (id) =>
      ({
        id,
        name: id,
        method: 'GET',
        path: `/${id}`,
        enabled: true,
        description: '',
        group: '',
        conditionsEnabled: true,
        conditions: [],
        abort: 'none',
        responses: [],
        createdAt: 0,
        updatedAt: 0,
      }) as MockRule,
  );

describe('applyRuleOrder', () => {
  it('sorts rules by the persisted id order', () => {
    const rules = rulesOf(['a', 'b', 'c']);
    expect(applyRuleOrder(rules, ['c', 'a', 'b']).map((rule) => rule.id)).toEqual(['c', 'a', 'b']);
  });

  it('floats unknown rules to the top while preserving their incoming order', () => {
    const rules = rulesOf(['a', 'b', 'c']);
    const ordered = applyRuleOrder(rules, ['b']);
    expect(ordered.map((rule) => rule.id)).toEqual(['a', 'c', 'b']);
  });

  it('ignores stale ids and tolerates an empty order', () => {
    const rules = rulesOf(['a', 'b']);
    expect(applyRuleOrder(rules, ['gone', 'a', 'b']).map((rule) => rule.id)).toEqual(['a', 'b']);
    expect(applyRuleOrder(rules, []).map((rule) => rule.id)).toEqual(['a', 'b']);
  });
});

describe('reconcileOrder', () => {
  it('drops stale ids and prepends newly seen rules', () => {
    const rules = rulesOf(['a', 'c', 'd']);
    expect(reconcileOrder(rules, ['stale', 'c', 'a'])).toEqual(['d', 'c', 'a']);
  });

  it('keeps a valid order untouched', () => {
    const rules = rulesOf(['a', 'b']);
    expect(reconcileOrder(rules, ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('reorderIds', () => {
  it('moves an id onto another within the visible subset', () => {
    // a dragged onto c -> b, a, c
    expect(reorderIds(['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
    // c dragged onto a -> c, a, b
    expect(reorderIds(['a', 'b', 'c'], ['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('keeps filtered-out rules at their global positions', () => {
    // visible subset is [a, c] while b stays hidden between them
    expect(reorderIds(['a', 'b', 'c'], ['a', 'c'], 'c', 'a')).toEqual(['c', 'b', 'a']);
  });

  it('refuses cross-subset drops and no-op moves', () => {
    expect(reorderIds(['a', 'b'], ['a'], 'b', 'a')).toEqual(['a', 'b']);
    expect(reorderIds(['a', 'b'], ['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });

  it('appends visible ids that are missing from the persisted order', () => {
    expect(reorderIds(['a'], ['a', 'b'], 'b', 'a')).toEqual(['b', 'a']);
  });
});
