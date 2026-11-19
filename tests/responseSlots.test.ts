import { describe, expect, it } from 'vitest';
import { createResponseEntry } from '../server/src/defaults';
import { duplicateSlot, nextActiveIndex, removeSlot } from '../web/src/lib/responseSlots';

const slots = () => [
  createResponseEntry({ id: 'a', body: '{"slot":1}' }),
  createResponseEntry({ id: 'b', body: '{"slot":2}' }),
  createResponseEntry({ id: 'c', body: '{"slot":3}' }),
];

const bodies = (list: ReturnType<typeof slots>) => list.map((item) => item.body);

describe('removeSlot', () => {
  it('removes the default slot and the next one becomes default', () => {
    expect(bodies(removeSlot(slots(), 0))).toEqual(['{"slot":2}', '{"slot":3}']);
  });

  it('removes a middle slot', () => {
    expect(bodies(removeSlot(slots(), 1))).toEqual(['{"slot":1}', '{"slot":3}']);
  });

  it('removes the last slot', () => {
    expect(bodies(removeSlot(slots(), 2))).toEqual(['{"slot":1}', '{"slot":2}']);
  });

  it('keeps the only slot so the rule can always answer', () => {
    const single = slots().slice(0, 1);
    expect(removeSlot(single, 0)).toBe(single);
  });

  it('ignores out-of-range targets', () => {
    const list = slots();
    expect(removeSlot(list, -1)).toBe(list);
    expect(removeSlot(list, 3)).toBe(list);
  });
});

describe('duplicateSlot', () => {
  it('clones the response but clears metadata and conditions', () => {
    const original = createResponseEntry({
      id: 'a',
      label: '首次成功',
      enabled: false,
      headers: [{ key: 'X-Token', value: '1' }],
      conditionsEnabled: false,
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });
    const copy = duplicateSlot(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({
      label: '',
      enabled: true,
      conditionsEnabled: true,
      conditions: [],
      headers: [{ key: 'X-Token', value: '1' }],
    });
    expect(copy.headers[0]).not.toBe(original.headers[0]);
    expect(copy.schema).not.toBe(original.schema);
  });
});

describe('nextActiveIndex', () => {
  it('keeps a selection before the removed slot', () => {
    expect(nextActiveIndex(0, 1, 3)).toBe(0);
  });

  it('stays on the slot that closes up', () => {
    expect(nextActiveIndex(1, 1, 3)).toBe(1);
    expect(nextActiveIndex(2, 2, 3)).toBe(1);
  });

  it('shifts a selection after the removed slot', () => {
    expect(nextActiveIndex(2, 1, 3)).toBe(1);
    expect(nextActiveIndex(2, 0, 3)).toBe(1);
  });

  it('clamps to the new default when the last slot is removed', () => {
    expect(nextActiveIndex(1, 1, 2)).toBe(0);
  });
});
