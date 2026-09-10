import { describe, expect, it } from 'vitest';
import { inferSchema, patternFrom } from '../server/src/schemaInfer';
import type { SchemaField } from '../server/src/types';

describe('patternFrom', () => {
  it('turns codes into quantified regex sources', () => {
    expect(patternFrom('NO202601010001')).toBe('^NO\\d{12}$');
    expect(patternFrom('SKU-ABC-123456')).toBe('^SKU-ABC-\\d{6}$');
    expect(patternFrom('200120')).toBe('^\\d{6}$');
  });

  it('ignores values without digits', () => {
    expect(patternFrom('Shanghai')).toBeNull();
    expect(patternFrom('a-b')).toBeNull();
  });

  it('escapes regex metacharacters', () => {
    expect(patternFrom('v1.2.3')).toBe('^v\\d{1}\\.\\d{1}\\.\\d{1}$');
  });
});

describe('inferSchema', () => {
  const sample = {
    id: 1001,
    name: 'Ada Lovelace',
    phone: '13800138000',
    email: 'ada@example.com',
    traceId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    createdAt: '2026-01-01T08:00:00.000Z',
    score: 9.5,
    vip: true,
    tags: ['admin', 'beta'],
    address: { city: 'Shanghai' },
  };

  const byName = (fields: SchemaField[]) =>
    Object.fromEntries(fields.map((field) => [field.name, field]));

  it('detects the common value kinds in smart mode', () => {
    const fields = byName(inferSchema(sample, 'smart'));
    expect(fields.id?.type).toBe('int');
    expect(fields.phone?.stringGen).toBe('regex');
    expect(fields.phone?.pattern).toBe('^1[3-9]\\d{9}$');
    expect(fields.email?.fakerTemplate).toBe('internet.email');
    expect(fields.name?.fakerTemplate).toBe('person.fullName');
    expect(fields.traceId?.type).toBe('uuid');
    expect(fields.createdAt?.type).toBe('date');
    expect(fields.score?.type).toBe('number');
    expect(fields.score?.precision).toBe(1);
    expect(fields.vip?.type).toBe('boolean');
  });

  it('keeps arrays and nested objects', () => {
    const fields = byName(inferSchema(sample, 'smart'));
    expect(fields.tags?.type).toBe('array');
    expect(fields.tags?.itemCountMin).toBe(2);
    expect(fields.address?.type).toBe('object');
    expect(fields.address?.children?.[0]?.name).toBe('city');
  });

  it('honours the string strategy', () => {
    const faker = byName(inferSchema(sample, 'faker'));
    const fixed = byName(inferSchema(sample, 'const'));
    expect(faker.address?.children?.[0]?.stringGen).toBe('faker');
    expect(fixed.address?.children?.[0]?.constValue).toBe('Shanghai');
  });

  it('uses the first element of a top-level array as template', () => {
    const fields = inferSchema([{ id: 1, name: 'x' }], 'smart');
    expect(fields.map((field) => field.name)).toEqual(['id', 'name']);
  });

  it('returns nothing for non-object samples', () => {
    expect(inferSchema(null, 'smart')).toEqual([]);
    expect(inferSchema('text', 'smart')).toEqual([]);
  });
});
