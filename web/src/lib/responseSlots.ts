import type { ResponseEntry } from '@shared/types';
import { uid } from '@shared/defaults';

/**
 * Removes any response slot, including the default (index 0). The following
 * slot then becomes the new default. A rule always keeps at least one response.
 */
export function removeSlot(responses: ResponseEntry[], target: number): ResponseEntry[] {
  if (responses.length <= 1 || target < 0 || target >= responses.length) return responses;
  return responses.filter((_, index) => index !== target);
}

/** Keeps the editor on the same response after a slot is removed. `length` is pre-removal. */
export function nextActiveIndex(current: number, target: number, length: number): number {
  if (current > target) return current - 1;
  if (current === target) return Math.max(0, Math.min(current, length - 2));
  return current;
}

/**
 * "Add response" clones the current slot but starts with fresh metadata and
 * no conditions: two slots matching the very same request would be ambiguous.
 */
export function duplicateSlot(response: ResponseEntry): ResponseEntry {
  return {
    ...response,
    id: uid(),
    label: '',
    enabled: true,
    conditionsEnabled: true,
    conditions: [],
    headers: response.headers.map((header) => ({ ...header })),
    schema: structuredClone(response.schema),
  };
}
