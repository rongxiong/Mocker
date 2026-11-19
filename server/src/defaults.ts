import { HTTP_METHODS } from './types';
import type {
  AbortMode,
  EnvelopeType,
  LegacyVariant,
  MockRule,
  ResponseConfig,
  ResponseEntry,
  ResponseType,
  RuleCondition,
  RuleInput,
  SchemaField,
  SchemaFieldType,
} from './types';

export function uid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const SAMPLE_JSON = `{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1001,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "tags": ["admin", "beta"],
    "createdAt": "2026-01-01T08:00:00.000Z"
  }
}`;

export const SAMPLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mocker · HTML Response</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b0d12; color: #e6e9f2; padding: 40px; }
      .card { border: 1px solid #272d3d; border-radius: 12px; padding: 24px; max-width: 520px; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { color: #9aa3b2; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hello from Mocker</h1>
      <p>This HTML fragment is served straight from your mock rule.</p>
    </div>
  </body>
</html>`;

export const SAMPLE_SCRIPT = `// Available: req (method, path, params, query, headers, cookies, body),
// console, faker, RandExp, uuid(), require('faker' | 'randexp' | 'uuid')
const id = req.params.id ?? '1';

return {
  code: 0,
  data: {
    id: Number(id),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: new RandExp(/^1[3-9]\\d{9}$/).gen(),
    requestId: uuid(),
  },
};`;

export function defaultBodyFor(type: ResponseType): string {
  if (type === 'html') return SAMPLE_HTML;
  if (type === 'javascript') return SAMPLE_SCRIPT;
  return SAMPLE_JSON;
}

export function createDefaultField(type: SchemaFieldType = 'string', name = ''): SchemaField {
  const field: SchemaField = { id: uid(), name, type };
  switch (type) {
    case 'string':
      field.stringGen = 'regex';
      field.pattern = '^1[3-9]\\d{9}$';
      break;
    case 'number':
      field.min = 0;
      field.max = 1000;
      field.precision = 2;
      break;
    case 'int':
      field.min = 1;
      field.max = 10000;
      break;
    case 'boolean':
      field.trueRatio = 0.5;
      break;
    case 'date':
      field.dateFormat = 'iso';
      break;
    case 'enum':
      field.values = ['active', 'pending', 'archived'];
      break;
    case 'object':
      field.children = [];
      break;
    case 'array':
      field.itemCountMin = 2;
      field.itemCountMax = 5;
      field.item = createDefaultField('string', 'item');
      break;
    default:
      break;
  }
  return field;
}

export function defaultSchema(): SchemaField[] {
  return [
    { ...createDefaultField('int', 'id'), min: 1, max: 99999 },
    {
      ...createDefaultField('string', 'name'),
      stringGen: 'faker',
      fakerTemplate: 'person.fullName',
    },
    { ...createDefaultField('string', 'phone'), stringGen: 'regex', pattern: '^1[3-9]\\d{9}$' },
    { ...createDefaultField('enum', 'status'), values: ['active', 'pending', 'archived'] },
    createDefaultField('uuid', 'traceId'),
  ];
}

const RESPONSE_TYPES: ResponseType[] = ['json', 'html', 'file', 'javascript', 'schema'];
const ENVELOPES: EnvelopeType[] = ['none', 'codeData', 'codeMessageData'];
const ABORTS: AbortMode[] = ['none', 'close', 'hang'];
const RESPONSE_KEYS: (keyof ResponseConfig)[] = [
  'statusCode',
  'headers',
  'contentType',
  'responseType',
  'body',
  'fileId',
  'schema',
  'schemaRoot',
  'schemaRootMin',
  'schemaRootMax',
  'delayMs',
  'delayJitterMs',
  'envelope',
];
const RULE_KEYS = [
  'id',
  'name',
  'method',
  'path',
  'enabled',
  'description',
  'group',
  'conditionsEnabled',
  'conditions',
  'abort',
  'createdAt',
  'updatedAt',
] as const;

/** PUT patches must never let a client rewrite identity or creation time. */
const PATCH_KEYS = RULE_KEYS.filter(
  (key) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt',
);

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Accepts the loose 0 / "false" values found in hand-written backups. */
function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value !== false && value !== 0 && value !== null && value !== 'false';
}

function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function fieldsOf(source: RuleInput, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const raw = source as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (raw[key] !== undefined) result[key] = raw[key];
  }
  return result;
}

export function createDefaultResponse(): ResponseConfig {
  return {
    statusCode: 200,
    headers: [],
    contentType: '',
    responseType: 'json',
    body: SAMPLE_JSON,
    fileId: '',
    schema: defaultSchema(),
    schemaRoot: 'object',
    schemaRootMin: 2,
    schemaRootMax: 5,
    delayMs: 0,
    delayJitterMs: 0,
    envelope: 'none',
  };
}

/** Fills every field so a partially written / imported slot is always usable. */
export function normalizeResponse(
  input: unknown,
  fallback: ResponseConfig = createDefaultResponse(),
): ResponseEntry {
  const source = (input ?? {}) as Partial<ResponseEntry>;
  const fallbackSlot = fallback as Partial<ResponseEntry>;
  const enabled = booleanValue(source.enabled, fallbackSlot.enabled !== false);
  const conditionsEnabled = booleanValue(
    source.conditionsEnabled,
    fallbackSlot.conditionsEnabled !== false,
  );
  // Slots with no conditions stay unconditional; legacy flat patches keep the
  // conditions of the slot they are replacing instead of silently dropping them.
  const conditions = Array.isArray(source.conditions)
    ? (source.conditions as RuleCondition[])
    : (fallbackSlot.conditions ?? []);
  return {
    statusCode: toNumber(source.statusCode, fallback.statusCode),
    headers: Array.isArray(source.headers) ? source.headers : fallback.headers,
    contentType: typeof source.contentType === 'string' ? source.contentType : fallback.contentType,
    responseType: oneOf(source.responseType, RESPONSE_TYPES, fallback.responseType),
    body: typeof source.body === 'string' ? source.body : fallback.body,
    fileId: typeof source.fileId === 'string' ? source.fileId : fallback.fileId,
    schema: Array.isArray(source.schema) ? source.schema : fallback.schema,
    schemaRoot:
      source.schemaRoot === 'object' || source.schemaRoot === 'array'
        ? source.schemaRoot
        : fallback.schemaRoot,
    schemaRootMin: toNumber(source.schemaRootMin, fallback.schemaRootMin),
    schemaRootMax: toNumber(source.schemaRootMax, fallback.schemaRootMax),
    delayMs: toNumber(source.delayMs, fallback.delayMs),
    delayJitterMs: toNumber(source.delayJitterMs, fallback.delayJitterMs),
    envelope: oneOf(source.envelope, ENVELOPES, fallback.envelope),
    id: text(source.id) || uid(),
    label: text(source.label),
    enabled,
    conditionsEnabled,
    conditions,
  };
}

export function createResponseEntry(overrides: Partial<ResponseEntry> = {}): ResponseEntry {
  return normalizeResponse(overrides, createDefaultResponse());
}

/** A rule always has at least one response. */
export function normalizeResponses(
  input: unknown,
  fallback: ResponseConfig = createDefaultResponse(),
): ResponseEntry[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length === 0) return [normalizeResponse({}, fallback)];
  return list.map((item) => normalizeResponse(item, fallback));
}

/**
 * v2 sequence entries only overrode three fields; expand them into full slots
 * using the (possibly overridden) base response for everything else.
 */
function expandLegacyVariant(
  variant: LegacyVariant,
  base: ResponseConfig,
  index: number,
  enabled: boolean,
): ResponseEntry {
  const source = (variant ?? {}) as LegacyVariant;
  const delayRaw = text(source.delayMs).trim();
  return {
    ...base,
    id: text(source.id) || uid(),
    label: text(source.label) || `响应 ${index + 2}`,
    enabled,
    conditionsEnabled: true,
    conditions: [],
    statusCode: toNumber(source.statusCode, base.statusCode),
    delayMs: toNumber(delayRaw, base.delayMs),
    delayJitterMs: delayRaw === '' ? base.delayJitterMs : 0,
    body: text(source.body) || base.body,
  };
}

function buildResponses(input: RuleInput, fallback: ResponseConfig): ResponseEntry[] {
  // `sequenceEnabled` is the master switch from early v3 backups; treat it
  // like v2's `variantsEnabled` so an imported "no cycling" rule stays put.
  const legacyOff = input.variantsEnabled === false || input.sequenceEnabled === false;
  if (Array.isArray(input.responses) && input.responses.length > 0) {
    const list = normalizeResponses(input.responses, fallback);
    return legacyOff
      ? list.map((item, index) => (index === 0 ? item : { ...item, enabled: false }))
      : list;
  }
  const base = normalizeResponse(fieldsOf(input, RESPONSE_KEYS), fallback);
  const legacy = Array.isArray(input.variants) ? input.variants : [];
  // A rule with its old sequence switch off keeps only the default slot
  // enabled, which behaves the same: every request gets slot 1.
  const legacyEnabled = !legacyOff;
  return [
    base,
    ...legacy.map((item, index) => expandLegacyVariant(item, base, index, legacyEnabled)),
  ];
}

export function primaryResponse(rule: MockRule): ResponseEntry {
  return rule.responses?.[0] ?? normalizeResponse({}, createDefaultResponse());
}

export function responseAt(rule: MockRule, index: number): ResponseEntry {
  const list = rule.responses ?? [];
  return list[Math.max(0, Math.min(index, list.length - 1))] ?? primaryResponse(rule);
}

/** Indexes of enabled slots; falls back to slot 0 when every slot is off. */
export function enabledResponseIndexes(rule: MockRule): number[] {
  const indexes = (rule.responses ?? [])
    .map((response, index) => (response.enabled === false ? -1 : index))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? indexes : [0];
}

/** The slot real requests fall back to when only one slot is enabled. */
export function firstEnabledResponse(rule: MockRule): ResponseEntry {
  return responseAt(rule, enabledResponseIndexes(rule)[0] ?? 0);
}

/** `buildResponse` also accepts a bare config (handy for previews and tests). */
export function responseConfigOf(input: MockRule | ResponseConfig, index = 0): ResponseConfig {
  return 'responses' in input ? responseAt(input, index) : input;
}

export function createDefaultRule(overrides: RuleInput = {}): MockRule {
  const now = Date.now();
  const base: MockRule = {
    id: uid(),
    name: 'New API',
    method: 'GET',
    path: '/api/example',
    enabled: true,
    description: '',
    group: '',
    conditionsEnabled: true,
    conditions: [],
    abort: 'none',
    responses: [normalizeResponse({}, createDefaultResponse())],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...base,
    ...fieldsOf(overrides, RULE_KEYS),
    responses: buildResponses(overrides, base.responses[0]!),
  } as MockRule;
}

/** Normalises a whole rule, including v2 backups with flat fields / `variants`. */
export function normalizeRule(input: RuleInput): MockRule {
  const base = createDefaultRule();
  const now = Date.now();
  const source = (input ?? {}) as RuleInput;
  return {
    ...base,
    ...fieldsOf(source, RULE_KEYS),
    id: source.id ?? base.id,
    name: source.name ?? base.name,
    method: oneOf(source.method, HTTP_METHODS, base.method),
    path: source.path ?? base.path,
    enabled: source.enabled ?? base.enabled,
    description: source.description ?? base.description,
    group: source.group ?? base.group,
    conditionsEnabled: source.conditionsEnabled ?? true,
    conditions: Array.isArray(source.conditions) ? source.conditions : [],
    abort: oneOf(source.abort, ABORTS, 'none'),
    responses: buildResponses(source, base.responses[0]!),
    createdAt: source.createdAt ?? now,
    updatedAt: source.updatedAt ?? now,
  };
}

/**
 * Admin PUT bodies are patches, not whole rules. Legacy clients send flat
 * response fields / `variants`; fold them into `responses` without dropping
 * the rest of the current rule.
 */
export function coerceRulePatch(patch: RuleInput, current: MockRule): Partial<MockRule> {
  const fields = fieldsOf(patch, PATCH_KEYS) as Partial<MockRule>;
  const legacyOff = patch.variantsEnabled === false || patch.sequenceEnabled === false;
  if (Array.isArray(patch.responses)) {
    // Use neutral defaults, never the current default slot: an empty string
    // in one slot means "not set", not "copy slot 1's value".
    const list = normalizeResponses(patch.responses, createDefaultResponse());
    return {
      ...fields,
      responses: legacyOff
        ? list.map((item, index) => (index === 0 ? item : { ...item, enabled: false }))
        : list,
    };
  }
  const flat = fieldsOf(patch, RESPONSE_KEYS);
  const hasFlat = Object.keys(flat).length > 0;
  const hasLegacy =
    Array.isArray(patch.variants) ||
    patch.variantsEnabled !== undefined ||
    patch.sequenceEnabled !== undefined;
  if (!hasFlat && !hasLegacy) return fields;
  // Keep the current default slot's own switch instead of silently turning it back on.
  const base = normalizeResponse(flat, primaryResponse(current));
  const legacyEnabled = !legacyOff;
  const tail = Array.isArray(patch.variants)
    ? patch.variants.map((item, index) => expandLegacyVariant(item, base, index, legacyEnabled))
    : current.responses
        .slice(1)
        .map((item) => ({ ...item, enabled: legacyEnabled && item.enabled !== false }));
  return {
    ...fields,
    responses: [base, ...tail],
  };
}
