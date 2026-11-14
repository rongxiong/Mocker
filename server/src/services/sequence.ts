import type { MockRule } from '../types';
import { enabledResponseIndexes } from '../defaults';

const counters = new Map<string, number>();

/** Cycles through a rule's enabled responses: call 1 -> slot 1, call 2 -> slot 2, ... */
export function nextResponseIndex(ruleId: string, total: number): number {
  if (total <= 1) return 0;
  const current = counters.get(ruleId) ?? 0;
  counters.set(ruleId, current + 1);
  return current % total;
}

/**
 * Resolves the slot for a real request. Disabled slots are skipped entirely;
 * one enabled slot means "always return this one", two or more cycle in order.
 * When all of them are off slot 0 still answers so a rule never goes blank.
 */
export function resolveResponseIndex(rule: MockRule): { index: number; cycling: boolean } {
  const usable = enabledResponseIndexes(rule);
  const cycling = usable.length > 1;
  if (!cycling) return { index: usable[0] ?? 0, cycling: false };
  const offset = nextResponseIndex(rule.id, usable.length);
  return { index: usable[offset % usable.length] ?? 0, cycling: true };
}

export function resetSequence(ruleId?: string): void {
  if (ruleId) counters.delete(ruleId);
  else counters.clear();
}
