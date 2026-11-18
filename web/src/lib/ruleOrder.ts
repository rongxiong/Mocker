import type { MockRule } from '@shared/types';

/**
 * Console-only manual ordering. The persisted value is a flat array of rule
 * ids; mock request matching still follows the server's created_at order, so
 * reordering never changes which rule answers a request.
 */

/**
 * Applies a persisted id order to a rule list. Rules absent from `order`
 * (newly created / imported) keep their incoming relative order and float to
 * the top, mirroring the server's newest-first default; stale ids are ignored.
 */
export function applyRuleOrder(rules: MockRule[], order: string[]): MockRule[] {
  const position = new Map(order.map((id, index) => [id, index]));
  const ranked = rules.map((rule, index) => ({ rule, index, rank: position.get(rule.id) }));
  ranked.sort((a, b) => {
    if (a.rank === undefined && b.rank === undefined) return a.index - b.index;
    if (a.rank === undefined) return -1;
    if (b.rank === undefined) return 1;
    return a.rank - b.rank;
  });
  return ranked.map((item) => item.rule);
}

/**
 * Keeps the client-side order canonical: drops ids whose rules no longer exist
 * and prepends rules the order does not know about yet.
 */
export function reconcileOrder(rules: MockRule[], order: string[]): string[] {
  const ids = new Set(rules.map((rule) => rule.id));
  const known = order.filter((id) => ids.has(id));
  const knownIds = new Set(known);
  const added = rules.map((rule) => rule.id).filter((id) => !knownIds.has(id));
  return [...added, ...known];
}

/**
 * Moves `draggedId` onto `targetId` within the visible subset, while rules
 * hidden by search / filters keep their positions in the global order.
 * Returns the original array when either id is not part of `visibleIds`.
 */
export function reorderIds(
  currentOrder: string[],
  visibleIds: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return currentOrder;
  const visible = new Set(visibleIds);
  const visibleOrder = currentOrder.filter((id) => visible.has(id));
  // Defensive: any visible id missing from the persisted order is appended.
  for (const id of visibleIds) {
    if (!visibleOrder.includes(id)) visibleOrder.push(id);
  }
  const from = visibleOrder.indexOf(draggedId);
  const to = visibleOrder.indexOf(targetId);
  if (from < 0 || to < 0) return currentOrder;

  const nextVisible = visibleOrder.slice();
  nextVisible.splice(from, 1);
  // The dragged card takes the target's slot (inserted before it). When moving
  // downward the target shifted left by one after the removal, so compensate.
  const insertAt = from < to ? to - 1 : to;
  nextVisible.splice(insertAt, 0, draggedId);

  // Re-embed visible ids into the global sequence; hidden ids stay in place.
  const queue = [...nextVisible];
  const rebuilt = currentOrder.map((id) => (visible.has(id) ? (queue.shift() as string) : id));
  return [...rebuilt, ...queue];
}
