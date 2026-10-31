import type { MockRequestSnapshot, MockRule, RuleCondition } from '../types';

/**
 * A rule only takes part in condition matching while its condition switch is
 * on. Switching it off parks the conditions and lets the rule behave like a
 * plain catch-all serving the response config above.
 */
export function hasEffectiveConditions(rule: MockRule): boolean {
  return rule.conditionsEnabled !== false && (rule.conditions?.length ?? 0) > 0;
}

function pickByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let cursor: unknown = source;
  for (const segment of path.split('.').filter(Boolean)) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function sourceValues(condition: RuleCondition, req: MockRequestSnapshot): string[] {
  let raw: unknown;
  switch (condition.source) {
    case 'query':
      raw = (req.query as Record<string, unknown>)[condition.key];
      break;
    case 'header':
      raw = (req.headers as Record<string, unknown>)[condition.key.toLowerCase()];
      break;
    case 'cookie':
      raw = (req.cookies as Record<string, unknown>)[condition.key];
      break;
    case 'path':
      raw = (req.params as Record<string, unknown>)[condition.key];
      break;
    case 'body':
      raw = pickByPath(req.body, condition.key);
      break;
    default:
      raw = undefined;
  }
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item));
  if (typeof raw === 'object') return [JSON.stringify(raw)];
  return [String(raw)];
}

function testValue(condition: RuleCondition, values: string[]): boolean {
  const expected = condition.value ?? '';

  if (condition.op === 'exists') return values.length > 0;
  if (values.length === 0) return false;

  switch (condition.op) {
    case 'eq':
      return values.some((value) => value === expected);
    case 'ne':
      return values.every((value) => value !== expected);
    case 'contains':
      return values.some((value) => value.includes(expected));
    case 'regex':
      try {
        const re = new RegExp(expected);
        return values.some((value) => re.test(value));
      } catch {
        return false;
      }
    case 'gt':
      return values.some((value) => Number(value) > Number(expected));
    case 'lt':
      return values.some((value) => Number(value) < Number(expected));
    default:
      return true;
  }
}

/** Every condition must pass (AND) for the rule to be selected. */
export function matchesConditions(
  conditions: RuleCondition[] | undefined,
  req: MockRequestSnapshot,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => {
    if (!condition.key && condition.op !== 'exists') return true;
    return testValue(condition, sourceValues(condition, req));
  });
}
