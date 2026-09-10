import type { SchemaField } from './types';
import { uid } from './defaults';

/** How string values from the sample should be generated afterwards. */
export type StringInferMode = 'smart' | 'faker' | 'const';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const URL_RE = /^https?:\/\/\S+$/i;
const CN_PHONE_RE = /^1[3-9]\d{9}$/;
const PERSON_NAME_RE = /^[A-Z][a-z'’-]+ [A-Z][a-z'’-]+$/;
const TIMESTAMP_RE = /^\d{13}$/;

const DIGIT_RE = /\d+/g;

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns a sample value into a regex source, e.g.
 * `NO202601010001` -> `^NO\d{12}$`, `SKU-ABC-123456` -> `^SKU-ABC-\d{6}$`.
 *
 * Only digit runs are randomised; letters are kept as fixed prefixes, which matches
 * how order numbers, SKUs and IDs are usually shaped. Values without digits are
 * rejected so plain words (`Shanghai`, `admin`) keep their original value.
 */
export function patternFrom(value: string): string | null {
  if (!value || value.length > 40) return null;
  if (!/\d/.test(value)) return null;

  const parts: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = DIGIT_RE.exec(value);
  while (match !== null) {
    if (match.index > cursor) parts.push(escapeLiteral(value.slice(cursor, match.index)));
    parts.push(`\\d{${match[0].length}}`);
    cursor = match.index + match[0].length;
    match = DIGIT_RE.exec(value);
  }
  if (cursor < value.length) parts.push(escapeLiteral(value.slice(cursor)));
  if (cursor < value.length) parts.push(escapeLiteral(value.slice(cursor)));

  const source = parts.join('');
  if (source === escapeLiteral(value)) return null;
  return `^${source}$`;
}

function decimalsOf(value: number): number {
  const fraction = String(value).split('.')[1];
  return Math.min(fraction?.length ?? 2, 6) || 2;
}

function stringField(text: string, mode: StringInferMode): SchemaField {
  const field: SchemaField = { id: uid(), name: '', type: 'string' };

  if (mode === 'const') {
    field.stringGen = 'const';
    field.constValue = text;
    return field;
  }

  if (URL_RE.test(text)) {
    return { ...field, stringGen: 'faker', fakerTemplate: 'internet.url' };
  }
  if (EMAIL_RE.test(text)) {
    return { ...field, stringGen: 'faker', fakerTemplate: 'internet.email' };
  }

  if (mode === 'faker') {
    return {
      ...field,
      stringGen: 'faker',
      fakerTemplate: PERSON_NAME_RE.test(text) ? 'person.fullName' : 'lorem.word',
    };
  }

  // smart mode
  if (UUID_RE.test(text)) return { ...field, type: 'uuid' };
  if (TIMESTAMP_RE.test(text)) return { ...field, type: 'date', dateFormat: 'timestamp' };
  if (ISO_DATE_RE.test(text)) return { ...field, type: 'date', dateFormat: 'iso' };
  if (CN_PHONE_RE.test(text)) {
    return { ...field, stringGen: 'regex', pattern: '^1[3-9]\\d{9}$' };
  }
  if (PERSON_NAME_RE.test(text)) {
    return { ...field, stringGen: 'faker', fakerTemplate: 'person.fullName' };
  }

  const pattern = patternFrom(text);
  if (pattern) return { ...field, stringGen: 'regex', pattern };

  field.stringGen = 'const';
  field.constValue = text;
  return field;
}

export function inferField(name: string, value: unknown, mode: StringInferMode): SchemaField {
  if (typeof value === 'boolean') {
    return { id: uid(), name, type: 'boolean', trueRatio: value ? 0.9 : 0.1 };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return {
        id: uid(),
        name,
        type: 'int',
        min: Math.min(0, value),
        max: Math.max(Math.ceil(Math.abs(value) * 2), 100),
      };
    }
    return {
      id: uid(),
      name,
      type: 'number',
      min: 0,
      max: Number((Math.abs(value) * 2).toFixed(2)),
      precision: decimalsOf(value),
    };
  }

  if (Array.isArray(value)) {
    return {
      id: uid(),
      name,
      type: 'array',
      itemCountMin: value.length,
      itemCountMax: Math.max(value.length, 1),
      item: inferField('item', value[0] ?? '', mode),
    };
  }

  if (value !== null && typeof value === 'object') {
    return {
      id: uid(),
      name,
      type: 'object',
      children: Object.entries(value as Record<string, unknown>).map(([key, child]) =>
        inferField(key, child, mode),
      ),
    };
  }

  return { ...stringField(typeof value === 'string' ? value : '', mode), name };
}

/**
 * Builds a field tree from a JSON sample. A top-level array uses its first element
 * as the template, which is the common `{ data: [...] }` / `[{...}]` case.
 */
export function inferSchema(input: unknown, mode: StringInferMode = 'smart'): SchemaField[] {
  let target = input;
  if (Array.isArray(target)) target = target[0];
  if (!target || typeof target !== 'object' || Array.isArray(target)) return [];
  return Object.entries(target as Record<string, unknown>).map(([key, value]) =>
    inferField(key, value, mode),
  );
}
