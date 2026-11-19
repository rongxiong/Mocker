import { beforeEach, describe, expect, it } from 'vitest';
import {
  nextResponseIndex,
  resetSequence,
  resolveResponseIndex,
  selectResponseIndexes,
} from '../server/src/services/sequence';
import {
  coerceRulePatch,
  createDefaultRule,
  createResponseEntry,
  enabledResponseIndexes,
  firstEnabledResponse,
  normalizeResponse,
  normalizeRule,
  primaryResponse,
  responseAt,
} from '../server/src/defaults';
import type { MockRequestSnapshot, RuleCondition, RuleInput } from '../server/src/types';

describe('nextResponseIndex', () => {
  beforeEach(() => resetSequence());

  it('cycles through all response slots', () => {
    expect(nextResponseIndex('r1', 3)).toBe(0);
    expect(nextResponseIndex('r1', 3)).toBe(1);
    expect(nextResponseIndex('r1', 3)).toBe(2);
    expect(nextResponseIndex('r1', 3)).toBe(0);
  });

  it('keeps counters per rule', () => {
    nextResponseIndex('a', 2);
    expect(nextResponseIndex('b', 2)).toBe(0);
  });

  it('always returns the first slot for a single response', () => {
    expect(nextResponseIndex('c', 1)).toBe(0);
    expect(nextResponseIndex('c', 0)).toBe(0);
  });

  it('resets one rule or all rules', () => {
    nextResponseIndex('a', 2);
    resetSequence('a');
    expect(nextResponseIndex('a', 2)).toBe(0);
    nextResponseIndex('b', 2);
    resetSequence();
    expect(nextResponseIndex('b', 2)).toBe(0);
  });
});

describe('response slots', () => {
  const rule = createDefaultRule({
    responses: [
      createResponseEntry({ statusCode: 200, body: '{"n":1}' }),
      createResponseEntry({ statusCode: 500, body: '{"n":2}', responseType: 'html' }),
    ],
  });

  it('picks a full config per index without any inheritance at runtime', () => {
    expect(responseAt(rule, 0).statusCode).toBe(200);
    expect(responseAt(rule, 1)).toMatchObject({
      statusCode: 500,
      body: '{"n":2}',
      responseType: 'html',
    });
  });

  it('clamps out-of-range indexes', () => {
    expect(responseAt(rule, 99).statusCode).toBe(500);
    expect(responseAt(rule, -5).statusCode).toBe(200);
    expect(primaryResponse(rule).statusCode).toBe(200);
  });

  it('keeps provided ids and labels', () => {
    const withLabels = createDefaultRule({
      responses: [createResponseEntry({ id: 'mine', label: '首次成功' })],
    });
    expect(withLabels.responses[0]).toMatchObject({ id: 'mine', label: '首次成功' });
  });
});

describe('v2 backup compatibility', () => {
  const legacy: RuleInput = {
    statusCode: 200,
    delayMs: 30,
    delayJitterMs: 10,
    body: '{"base":true}',
    headers: [{ key: 'X-Base', value: '1' }],
    envelope: 'codeData',
    variantsEnabled: false,
    variants: [
      { id: 'v1', label: 'created', statusCode: '201', delayMs: '0', body: '{}' },
      { id: 'v2', label: 'slow', delayMs: '120' },
    ],
  };

  it('expands partial variants into complete response slots', () => {
    const rule = normalizeRule(legacy);
    expect(rule.responses).toHaveLength(3);
    // The v2 sequence switch was off, so only the default slot stays enabled.
    expect(rule.responses.map((item) => item.enabled)).toEqual([true, false, false]);

    expect(rule.responses[0]).toMatchObject({
      statusCode: 200,
      delayMs: 30,
      delayJitterMs: 10,
      body: '{"base":true}',
      envelope: 'codeData',
      headers: [{ key: 'X-Base', value: '1' }],
    });
    expect(rule.responses[1]).toMatchObject({
      id: 'v1',
      label: 'created',
      statusCode: 201,
      delayMs: 0,
      delayJitterMs: 0,
      body: '{}',
      headers: [{ key: 'X-Base', value: '1' }],
      responseType: 'json',
    });
    expect(rule.responses[2]).toMatchObject({
      id: 'v2',
      label: 'slow',
      statusCode: 200,
      delayMs: 120,
      delayJitterMs: 0,
      body: '{"base":true}',
    });
  });

  it('tolerates variants with missing fields', () => {
    const rule = normalizeRule({ variants: [{ id: 'v1' }, { label: 'broken' }] });
    expect(rule.responses).toHaveLength(3);
    expect(rule.responses[1]).toMatchObject({ id: 'v1', statusCode: 200, delayMs: 0 });
    expect(rule.responses[2]).toMatchObject({ label: 'broken', statusCode: 200 });
    expect(typeof rule.responses[2]?.id).toBe('string');
    expect(Array.isArray(rule.responses[2]?.schema)).toBe(true);
  });

  it('always produces at least one complete slot', () => {
    const rule = normalizeRule({ responses: [] });
    expect(rule.responses).toHaveLength(1);
    expect(rule.responses[0]?.responseType).toBe('json');
  });

  it('coerces numeric fields inside slots imported from hand-written JSON', () => {
    const rule = normalizeRule({
      responses: [{ statusCode: '404', delayMs: '10' }],
    } as unknown as RuleInput);
    expect(rule.responses[0]?.statusCode).toBe(404);
    expect(rule.responses[0]?.delayMs).toBe(10);
  });
});

describe('coerceRulePatch', () => {
  const current = createDefaultRule({
    responses: [
      createResponseEntry({ statusCode: 200, body: '{"n":1}' }),
      createResponseEntry({ statusCode: 500, body: '{"n":2}' }),
    ],
  });

  it('folds legacy flat fields into the default slot and keeps the other slots', () => {
    const patch = coerceRulePatch({ delayMs: 40 }, current);
    expect(patch.responses?.[0]?.delayMs).toBe(40);
    expect(patch.responses?.[1]?.statusCode).toBe(500);
  });

  it('maps a disabled legacy sequence switch onto disabled slots', () => {
    const patch = coerceRulePatch({ variantsEnabled: false }, current);
    expect(patch.responses?.map((item) => item.enabled)).toEqual([true, false]);
  });

  it('uses the new responses array as-is', () => {
    const next = [createResponseEntry({ body: '{}' })];
    const patch = coerceRulePatch({ responses: next }, current);
    expect(patch.responses?.[0]?.body).toBe('{}');
    expect(patch.responses).toHaveLength(1);
  });

  it('keeps per-slot switches when the console saves a whole rule', () => {
    const patch = coerceRulePatch(
      {
        ...current,
        responses: current.responses.map((item, index) => ({ ...item, enabled: index === 0 })),
      },
      current,
    );
    expect(patch.responses?.map((item) => item.enabled)).toEqual([true, false]);
  });

  it('leaves plain rule-only patches untouched', () => {
    expect(coerceRulePatch({ name: 'renamed' }, current)).toEqual({ name: 'renamed' });
  });
});

describe('per-slot switches', () => {
  const rule = createDefaultRule({
    responses: [
      createResponseEntry({ body: '{"slot":1}', enabled: false }),
      createResponseEntry({ body: '{"slot":2}' }),
      createResponseEntry({ body: '{"slot":3}', enabled: false }),
      createResponseEntry({ body: '{"slot":4}' }),
    ],
  });

  it('cycles only through enabled slots', () => {
    expect(enabledResponseIndexes(rule)).toEqual([1, 3]);
    resetSequence();
    expect(resolveResponseIndex(rule)).toMatchObject({ index: 1, cycling: true });
    expect(resolveResponseIndex(rule)).toMatchObject({ index: 3, cycling: true });
    expect(resolveResponseIndex(rule)).toMatchObject({ index: 1, cycling: true });
  });

  it('does not cycle when only one slot is enabled', () => {
    const one = createDefaultRule({
      responses: rule.responses.map((item, index) => ({ ...item, enabled: index === 1 })),
    });
    resetSequence();
    expect(resolveResponseIndex(one)).toMatchObject({ index: 1, cycling: false });
    expect(resolveResponseIndex(one)).toMatchObject({ index: 1, cycling: false });
    expect(firstEnabledResponse(one).body).toBe('{"slot":2}');
  });

  it('falls back to slot 0 when every slot is off', () => {
    const allOff = createDefaultRule({
      responses: rule.responses.map((item) => ({ ...item, enabled: false })),
    });
    expect(enabledResponseIndexes(allOff)).toEqual([0]);
    expect(resolveResponseIndex(allOff)).toMatchObject({ index: 0, cycling: false });
    expect(firstEnabledResponse(allOff).body).toBe('{"slot":1}');
  });

  it('treats slots without the field as enabled (early v3 backups)', () => {
    const withoutSwitch = normalizeRule({
      responses: [{ body: '{"slot":1}' }, { body: '{"slot":2}' }],
    } as unknown as RuleInput);
    expect(enabledResponseIndexes(withoutSwitch)).toEqual([0, 1]);
    expect(withoutSwitch.responses.every((item) => item.enabled)).toBe(true);
  });

  it('keeps the switch through full rule patches', () => {
    const patch = coerceRulePatch(
      {
        ...rule,
        responses: rule.responses.map((item, index) => ({ ...item, enabled: index === 0 })),
      },
      rule,
    );
    expect(patch.responses?.map((item) => item.enabled)).toEqual([true, false, false, false]);
  });
});

describe('normalization regressions', () => {
  it('keeps a disabled default slot disabled on a legacy flat patch', () => {
    const current = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}', enabled: false }),
        createResponseEntry({ body: '{"slot":2}' }),
      ],
    });
    const patch = coerceRulePatch({ delayMs: 40 }, current);
    expect(patch.responses?.[0]?.delayMs).toBe(40);
    expect(patch.responses?.map((item) => item.enabled)).toEqual([false, true]);
  });

  it('never copies slot 1 values into empty fields of other slots', () => {
    const current = createDefaultRule({
      responses: [
        createResponseEntry({ contentType: 'application/vnd.api+json', fileId: 'f1' }),
        createResponseEntry({ contentType: '', fileId: '' }),
      ],
    });
    const patch = coerceRulePatch({ responses: current.responses }, current);
    expect(patch.responses?.[1]).toMatchObject({ contentType: '', fileId: '' });

    const cleared = coerceRulePatch(
      {
        responses: [
          { ...current.responses[0]!, contentType: '', fileId: '' },
          current.responses[1]!,
        ],
      },
      current,
    );
    expect(cleared.responses?.[0]).toMatchObject({ contentType: '', fileId: '' });
  });

  it('can switch schemaRoot from array back to object', () => {
    const arrayRoot = createResponseEntry({ schemaRoot: 'array' });
    expect(normalizeResponse({ schemaRoot: 'object' }, arrayRoot).schemaRoot).toBe('object');
    expect(createResponseEntry({ ...arrayRoot, schemaRoot: 'object' }).schemaRoot).toBe('object');
  });

  it('treats 0 / "false" enabled values as disabled', () => {
    const rule = normalizeRule({
      responses: [{ enabled: 0 }, { enabled: 'false' }, {}],
    } as unknown as RuleInput);
    expect(rule.responses.map((item) => item.enabled)).toEqual([false, false, true]);
  });

  it('maps an early v3 master switch onto per-slot switches', () => {
    const backup = {
      responses: [{ body: '{"slot":1}' }, { body: '{"slot":2}' }],
      sequenceEnabled: false,
    } as unknown as RuleInput;
    expect(normalizeRule(backup).responses.map((item) => item.enabled)).toEqual([true, false]);
    const patch = coerceRulePatch(backup, createDefaultRule());
    expect(patch.responses?.map((item) => item.enabled)).toEqual([true, false]);
  });

  it('preserves timestamps when importing a backup', () => {
    const rule = normalizeRule({ createdAt: 111, updatedAt: 222 });
    expect(rule.createdAt).toBe(111);
    expect(rule.updatedAt).toBe(222);
  });
});

const vipCondition: RuleCondition = {
  id: 'c1',
  source: 'query',
  key: 'type',
  op: 'eq',
  value: 'vip',
};

const requestWith = (query: Record<string, string | string[]> = {}): MockRequestSnapshot => ({
  method: 'GET',
  path: '/api/slots',
  params: {},
  query,
  headers: {},
  cookies: {},
  body: undefined,
});

describe('per-slot conditions', () => {
  beforeEach(() => resetSequence());

  const rule = createDefaultRule({
    responses: [
      createResponseEntry({ body: '{"slot":1}' }),
      createResponseEntry({ body: '{"slot":2}' }),
      createResponseEntry({ body: '{"slot":"vip"}', conditions: [vipCondition] }),
    ],
  });

  it('lets a matching conditional slot win without advancing the counter', () => {
    const vip = requestWith({ type: 'vip' });
    expect(selectResponseIndexes(rule, vip)).toEqual({ indexes: [2], conditionMatched: true });
    expect(resolveResponseIndex(rule, vip)).toEqual({
      index: 2,
      cycling: false,
      conditionMatched: true,
    });
    expect(resolveResponseIndex(rule, requestWith())).toEqual({
      index: 0,
      cycling: true,
      conditionMatched: false,
    });
    expect(resolveResponseIndex(rule, vip)).toEqual({
      index: 2,
      cycling: false,
      conditionMatched: true,
    });
    expect(resolveResponseIndex(rule, requestWith())).toEqual({
      index: 1,
      cycling: true,
      conditionMatched: false,
    });
  });

  it('cycles only through unconditional slots when no condition matches', () => {
    expect(selectResponseIndexes(rule, requestWith())).toEqual({
      indexes: [0, 1],
      conditionMatched: false,
    });
  });

  it('ignores disabled conditional slots', () => {
    const disabled = createDefaultRule({
      responses: rule.responses.map((item, index) =>
        index === 2 ? { ...item, enabled: false } : item,
      ),
    });
    expect(selectResponseIndexes(disabled, requestWith({ type: 'vip' }))).toEqual({
      indexes: [0, 1],
      conditionMatched: false,
    });
  });

  it('treats a parked condition switch as an unconditional slot', () => {
    const parked = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({
          body: '{"slot":"vip"}',
          conditions: [vipCondition],
          conditionsEnabled: false,
        }),
      ],
    });
    expect(selectResponseIndexes(parked, requestWith({ type: 'vip' }))).toEqual({
      indexes: [0, 1],
      conditionMatched: false,
    });
  });

  it('falls back to the first enabled slot when all conditional slots miss', () => {
    const onlyConditional = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}', conditions: [vipCondition] }),
        createResponseEntry({
          body: '{"slot":2}',
          conditions: [{ ...vipCondition, value: 'guest' }],
        }),
      ],
    });
    expect(selectResponseIndexes(onlyConditional, requestWith())).toEqual({
      indexes: [0],
      conditionMatched: false,
    });
  });

  it('uses the first matching slot when several conditions match', () => {
    const twoMatches = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({ body: '{"slot":2}', conditions: [vipCondition] }),
        createResponseEntry({ body: '{"slot":3}', conditions: [vipCondition] }),
      ],
    });
    expect(selectResponseIndexes(twoMatches, requestWith({ type: 'vip' }))).toEqual({
      indexes: [1],
      conditionMatched: true,
    });
  });
});

describe('slot condition normalization', () => {
  it('defaults missing slot conditions and keeps provided ones', () => {
    const rule = normalizeRule({
      responses: [
        { body: '{"slot":1}' },
        { body: '{"slot":2}', conditions: [vipCondition], conditionsEnabled: false },
      ],
    } as unknown as RuleInput);
    expect(rule.responses[0]).toMatchObject({ conditions: [], conditionsEnabled: true });
    expect(rule.responses[1]).toMatchObject({
      conditions: [vipCondition],
      conditionsEnabled: false,
    });
  });

  it('drops malformed condition collections', () => {
    expect(normalizeResponse({ conditions: 'nope' }).conditions).toEqual([]);
  });

  it('keeps the default slot conditions on a legacy flat patch', () => {
    const current = createDefaultRule({
      responses: [createResponseEntry({ conditions: [vipCondition] })],
    });
    const patch = coerceRulePatch({ delayMs: 40 }, current);
    expect(patch.responses?.[0]?.conditions).toEqual([vipCondition]);
  });

  it('does not copy conditions into expanded v2 variants', () => {
    const current = createDefaultRule({
      responses: [createResponseEntry({ conditions: [vipCondition] })],
    });
    const patch = coerceRulePatch({ variants: [{ id: 'v1' }] }, current);
    expect(patch.responses?.[0]?.conditions).toEqual([vipCondition]);
    expect(patch.responses?.[1]).toMatchObject({ conditions: [], conditionsEnabled: true });
  });
});
