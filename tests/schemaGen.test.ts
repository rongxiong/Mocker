import { describe, expect, it } from 'vitest';
import {
  generateArrayFromSchema,
  generateFromSchema,
  generateValue,
} from '../server/src/services/schemaGen';
import type { SchemaField } from '../server/src/types';

const field = (partial: Partial<SchemaField> & { name: string; type: SchemaField['type'] }) =>
  ({ id: partial.name, ...partial }) as SchemaField;

describe('generateValue', () => {
  it('generates strings from a regex', () => {
    const value = generateValue(
      field({ name: 'phone', type: 'string', stringGen: 'regex', pattern: '^1[3-9]\\d{9}$' }),
    );
    expect(value).toMatch(/^1[3-9]\d{9}$/);
  });

  it('generates numbers inside the configured range', () => {
    for (let i = 0; i < 20; i += 1) {
      const value = generateValue(field({ name: 'n', type: 'int', min: 5, max: 7 })) as number;
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('picks from enum values', () => {
    const value = generateValue(
      field({ name: 'status', type: 'enum', values: ['active', 'archived'] }),
    );
    expect(['active', 'archived']).toContain(value);
  });

  it('builds arrays with a bounded length', () => {
    const value = generateValue(
      field({
        name: 'tags',
        type: 'array',
        itemCountMin: 2,
        itemCountMax: 3,
        item: field({ name: 'item', type: 'string', stringGen: 'const', constValue: 'x' }),
      }),
    ) as unknown[];
    expect(value.length).toBeGreaterThanOrEqual(2);
    expect(value.length).toBeLessThanOrEqual(3);
  });
});

describe('generateFromSchema', () => {
  it('skips optional fields based on the ratio', () => {
    const schema = [
      field({ name: 'always', type: 'int', min: 1, max: 1 }),
      field({
        name: 'never',
        type: 'string',
        stringGen: 'const',
        constValue: 'x',
        optional: true,
        optionalRatio: 0,
      }),
      field({
        name: 'sometimes',
        type: 'string',
        stringGen: 'const',
        constValue: 'y',
        optional: true,
        optionalRatio: 1,
      }),
    ];
    const result = generateFromSchema(schema);
    expect(result.always).toBe(1);
    expect(result.never).toBeUndefined();
    expect(result.sometimes).toBe('y');
  });

  it('ignores fields without a name', () => {
    expect(generateFromSchema([field({ name: '', type: 'int' })])).toEqual({});
  });
});

describe('generateArrayFromSchema', () => {
  it('repeats the object template', () => {
    const result = generateArrayFromSchema(
      [field({ name: 'id', type: 'int', min: 0, max: 1 })],
      3,
      3,
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty('id');
  });
});
