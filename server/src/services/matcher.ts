import { pathToRegexp } from 'path-to-regexp';
import { listRules, ruleVersion } from '../db/ruleRepo';
import { normalizePath } from '../pathUtils';
import type { MockRule } from '../types';

interface CompiledRule {
  rule: MockRule;
  regexp: RegExp;
  keys: string[];
}

interface Cache {
  version: number;
  items: CompiledRule[];
}

let cache: Cache | null = null;

function compile(rule: MockRule): CompiledRule | null {
  try {
    const { regexp, keys } = pathToRegexp(normalizePath(rule.path));
    return {
      rule,
      regexp,
      keys: keys.map((key) => (typeof key === 'string' ? key : String(key.name))),
    };
  } catch {
    return null;
  }
}

function items(): CompiledRule[] {
  const version = ruleVersion();
  if (cache && cache.version === version) return cache.items;
  const compiled = listRules()
    .filter((rule) => rule.enabled)
    .map(compile)
    .filter((item): item is CompiledRule => item !== null);
  cache = { version, items: compiled };
  return compiled;
}

export interface MatchResult {
  rule: MockRule;
  params: Record<string, string>;
}

function collect(method: string, target: string): MatchResult[] {
  const results: MatchResult[] = [];
  for (const item of items()) {
    if (item.rule.method.toUpperCase() !== method) continue;
    const match = item.regexp.exec(target);
    if (!match) continue;
    const params: Record<string, string> = {};
    item.keys.forEach((key, index) => {
      const value = match[index + 1];
      if (value !== undefined) params[key] = decodeURIComponent(value);
    });
    results.push({ rule: item.rule, params });
  }
  return results;
}

/**
 * All rules matching method + path, in priority order (newest first).
 * `HEAD` falls back to `GET` rules when no dedicated rule exists, matching
 * the behaviour of Express and most HTTP clients.
 */
export function matchAll(method: string, pathname: string): MatchResult[] {
  const target = normalizePath(pathname);
  const upper = method.toUpperCase();
  const direct = collect(upper, target);
  if (direct.length > 0) return direct;
  if (upper === 'HEAD') return collect('GET', target);
  return [];
}

export function matchRequest(method: string, pathname: string): MatchResult | null {
  return matchAll(method, pathname)[0] ?? null;
}

export function invalidate(): void {
  cache = null;
}
