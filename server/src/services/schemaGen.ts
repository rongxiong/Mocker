import RandExp from 'randexp';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import type { SchemaField } from '../types';

const MAX_REPEAT = 8;

export class SchemaError extends Error {}

function randomInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randomNumber(min: number, max: number, precision = 2): number {
  const value = Math.random() * (max - min) + min;
  const factor = 10 ** Math.max(0, Math.min(10, precision));
  return Math.round(value * factor) / factor;
}

function fromRegex(pattern: string): string {
  const generator = new RandExp(pattern);
  generator.max = MAX_REPEAT;
  return generator.gen();
}

function fromFaker(template: string): string {
  const segments = template.split('.').filter(Boolean);
  let cursor: unknown = faker;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) break;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor === 'function') {
    return String((cursor as () => unknown)());
  }
  if (cursor === null || cursor === undefined) {
    throw new SchemaError(`Unknown faker path: ${template}`);
  }
  return String(cursor);
}

function formatDate(format: SchemaField['dateFormat'], custom?: string): string | number {
  const now = new Date();
  if (format === 'timestamp') return now.getTime();
  if (format === 'custom' && custom) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const map: Record<string, string> = {
      YYYY: String(now.getFullYear()),
      MM: pad(now.getMonth() + 1),
      DD: pad(now.getDate()),
      HH: pad(now.getHours()),
      mm: pad(now.getMinutes()),
      ss: pad(now.getSeconds()),
    };
    return custom.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token] ?? token);
  }
  return now.toISOString();
}

function pick(values: string[] | undefined): string {
  const list = (values ?? []).filter((value) => value !== '');
  if (list.length === 0) return '';
  return list[randomInt(0, list.length - 1)]!;
}

export function generateValue(field: SchemaField): unknown {
  switch (field.type) {
    case 'string': {
      const mode = field.stringGen ?? 'const';
      if (mode === 'regex') {
        if (!field.pattern) return faker.lorem.word();
        return fromRegex(field.pattern);
      }
      if (mode === 'faker') {
        if (!field.fakerTemplate) return faker.lorem.word();
        return fromFaker(field.fakerTemplate);
      }
      if (mode === 'enum') return pick(field.values);
      return field.constValue ?? '';
    }
    case 'number':
      return randomNumber(field.min ?? 0, field.max ?? 100, field.precision ?? 2);
    case 'int':
      return randomInt(field.min ?? 0, field.max ?? 100);
    case 'boolean':
      return Math.random() < (field.trueRatio ?? 0.5);
    case 'uuid':
      return uuidv4();
    case 'date':
      return formatDate(field.dateFormat ?? 'iso', field.dateCustom);
    case 'enum':
      return pick(field.values);
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const child of field.children ?? []) {
        if (!child.name) continue;
        if (!isEmitted(child)) continue;
        result[child.name] = generateValue(child);
      }
      return result;
    }
    case 'array': {
      const count = randomInt(field.itemCountMin ?? 1, field.itemCountMax ?? 3);
      const item = field.item;
      if (!item) return [];
      return Array.from({ length: Math.max(0, count) }, () => generateValue(item));
    }
    default:
      return null;
  }
}

/** Optional fields are emitted with the configured probability (default 50%). */
function isEmitted(field: SchemaField): boolean {
  if (!field.optional) return true;
  const ratio = typeof field.optionalRatio === 'number' ? field.optionalRatio : 0.5;
  return Math.random() < Math.min(1, Math.max(0, ratio));
}

export function generateFromSchema(fields: SchemaField[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.name) continue;
    if (!isEmitted(field)) continue;
    result[field.name] = generateValue(field);
  }
  return result;
}

/** Top-level array response: repeats the object template `min..max` times. */
export function generateArrayFromSchema(
  fields: SchemaField[],
  min: number,
  max: number,
): Record<string, unknown>[] {
  const count = randomInt(min ?? 1, max ?? 3);
  return Array.from({ length: Math.max(0, count) }, () => generateFromSchema(fields));
}
