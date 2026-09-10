import type { HeaderEntry, MockRule, ResponseType, SchemaField, SchemaFieldType } from './types';

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

export function createDefaultRule(overrides: Partial<MockRule> = {}): MockRule {
  const now = Date.now();
  return {
    id: uid(),
    name: 'New API',
    method: 'GET',
    path: '/api/example',
    enabled: true,
    description: '',
    group: '',
    delayMs: 0,
    delayJitterMs: 0,
    statusCode: 200,
    headers: [] as HeaderEntry[],
    contentType: '',
    responseType: 'json',
    body: SAMPLE_JSON,
    fileId: '',
    schema: defaultSchema(),
    schemaRoot: 'object',
    schemaRootMin: 2,
    schemaRootMax: 5,
    conditions: [],
    variants: [],
    abort: 'none',
    envelope: 'none',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
