/**
 * Canonical path normalisation used by both the matcher and conflict detection.
 *
 * The two must agree, otherwise the console reports "duplicate" badges for rules
 * that never shadow each other (or misses real duplicates).
 */
export function normalizePath(path: string): string {
  const trimmed = (path ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
