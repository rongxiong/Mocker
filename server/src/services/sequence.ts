import type { MockRequestSnapshot, MockRule } from '../types';
import { enabledResponseIndexes } from '../defaults';
import { hasEffectiveConditions, matchesConditions } from './conditions';

const counters = new Map<string, number>();

/** Cycles through a rule's enabled responses: call 1 -> slot 1, call 2 -> slot 2, ... */
export function nextResponseIndex(ruleId: string, total: number): number {
  if (total <= 1) return 0;
  const current = counters.get(ruleId) ?? 0;
  counters.set(ruleId, current + 1);
  return current % total;
}

export interface ResponseSelection {
  /** slots still in play for this request, in their original order */
  indexes: number[];
  /** a conditional slot won outright, so no cycling happens */
  conditionMatched: boolean;
}

export interface ResolvedResponse {
  index: number;
  cycling: boolean;
  conditionMatched: boolean;
}

/**
 * Pure, counter-free view of which slots a request can use. A slot with
 * effective conditions that matches wins immediately; otherwise only the
 * unconditional slots take part in the sequence. If every enabled slot has
 * conditions and none match, the first enabled slot still answers so a rule
 * never goes blank.
 */
export function selectResponseIndexes(rule: MockRule, req: MockRequestSnapshot): ResponseSelection {
  const enabled = enabledResponseIndexes(rule);
  const slots = rule.responses ?? [];
  const conditional = enabled.filter((index) => hasEffectiveConditions(slots[index] ?? {}));
  const matched = conditional.find((index) => matchesConditions(slots[index]?.conditions, req));
  if (matched !== undefined) return { indexes: [matched], conditionMatched: true };

  const plain = enabled.filter((index) => !hasEffectiveConditions(slots[index] ?? {}));
  if (plain.length > 0) return { indexes: plain, conditionMatched: false };
  return { indexes: [enabled[0] ?? 0], conditionMatched: false };
}

/**
 * Resolves the slot for a real request. Disabled slots are skipped entirely;
 * one usable slot means "always return this one", two or more cycle in order.
 * Condition hits are direct and do not advance the sequence counter.
 */
export function resolveResponseIndex(rule: MockRule, req?: MockRequestSnapshot): ResolvedResponse {
  const selection = req
    ? selectResponseIndexes(rule, req)
    : { indexes: enabledResponseIndexes(rule), conditionMatched: false };
  const cycling = selection.indexes.length > 1;
  if (!cycling) {
    return {
      index: selection.indexes[0] ?? 0,
      cycling: false,
      conditionMatched: selection.conditionMatched,
    };
  }
  const offset = nextResponseIndex(rule.id, selection.indexes.length);
  return {
    index: selection.indexes[offset % selection.indexes.length] ?? 0,
    cycling: true,
    conditionMatched: false,
  };
}

export function resetSequence(ruleId?: string): void {
  if (ruleId) counters.delete(ruleId);
  else counters.clear();
}
