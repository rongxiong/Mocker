import { beforeEach, describe, expect, it } from 'vitest';
import { applyVariant, nextVariantIndex, resetVariants } from '../server/src/services/variants';
import type { MockRule } from '../server/src/types';
import { createDefaultRule } from '../server/src/defaults';

const ruleWithVariants = (): MockRule =>
  createDefaultRule({
    body: '{"base":true}',
    variants: [
      { id: 'v1', label: 'ok', statusCode: '200', delayMs: '', body: '{"try":1}' },
      { id: 'v2', label: 'fail', statusCode: '500', delayMs: '120', body: '{"try":2}' },
    ],
  });

describe('nextVariantIndex', () => {
  beforeEach(() => resetVariants());

  it('cycles through the variants', () => {
    expect(nextVariantIndex('r1', 2)).toBe(0);
    expect(nextVariantIndex('r1', 2)).toBe(1);
    expect(nextVariantIndex('r1', 2)).toBe(0);
  });

  it('keeps counters per rule', () => {
    nextVariantIndex('a', 2);
    expect(nextVariantIndex('b', 2)).toBe(0);
  });

  it('returns -1 without variants', () => {
    expect(nextVariantIndex('c', 0)).toBe(-1);
  });
});

describe('applyVariant', () => {
  it('overrides only the filled fields', () => {
    const rule = ruleWithVariants();
    const first = applyVariant(rule, 0);
    expect(first.statusCode).toBe(200);
    expect(first.body).toBe('{"try":1}');
    expect(first.delayMs).toBe(rule.delayMs);

    const second = applyVariant(rule, 1);
    expect(second.statusCode).toBe(500);
    expect(second.delayMs).toBe(120);
  });

  it('returns the rule untouched for unknown indexes', () => {
    const rule = ruleWithVariants();
    expect(applyVariant(rule, 9)).toBe(rule);
  });

  it('tolerates incomplete variants coming from an import', () => {
    const rule = createDefaultRule({
      statusCode: 200,
      delayMs: 30,
      delayJitterMs: 10,
      body: '{"base":true}',
      variants: [{ id: 'v1' }] as unknown as MockRule['variants'],
    });

    const applied = applyVariant(rule, 0);
    expect(applied.statusCode).toBe(200);
    expect(applied.delayMs).toBe(30);
    expect(applied.delayJitterMs).toBe(10);
    expect(applied.body).toBe('{"base":true}');
  });

  it('keeps an explicit 0 instead of falling back to the rule value', () => {
    const rule = createDefaultRule({
      statusCode: 200,
      delayMs: 500,
      variants: [{ id: 'v1', label: 'fast', statusCode: '200', delayMs: '0', body: '' }],
    });

    const applied = applyVariant(rule, 0);
    expect(applied.delayMs).toBe(0);
    expect(applied.delayJitterMs).toBe(0);
  });
});
