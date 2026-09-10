import type { MockRule, ResponseVariant } from '../types';

const counters = new Map<string, number>();

/** Cycles through the rule variants: call 1 -> index 0, call 2 -> index 1, ... */
export function nextVariantIndex(ruleId: string, total: number): number {
  if (total <= 0) return -1;
  const current = counters.get(ruleId) ?? 0;
  counters.set(ruleId, current + 1);
  return current % total;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Parses a variant field. An empty value inherits from the rule; unlike
 * `Number(x) || fallback` this keeps legitimate `0` values.
 */
function numberOr(value: unknown, fallback: number): number {
  const raw = text(value).trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function applyVariant(rule: MockRule, index: number): MockRule {
  const variant: ResponseVariant | undefined = rule.variants?.[index];
  if (!variant) return rule;
  return {
    ...rule,
    statusCode: numberOr(variant.statusCode, rule.statusCode),
    delayMs: numberOr(variant.delayMs, rule.delayMs),
    delayJitterMs: text(variant.delayMs).trim() ? 0 : rule.delayJitterMs,
    body: text(variant.body) || rule.body,
  };
}

export function resetVariants(ruleId?: string): void {
  if (ruleId) counters.delete(ruleId);
  else counters.clear();
}
