import { describe, expect, it } from 'vitest';
import { importOpenApi } from '../server/src/openapiImport';

const doc = {
  openapi: '3.0.0',
  paths: {
    '/users/{id}': {
      get: {
        summary: '用户详情',
        tags: ['用户'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name'],
                  properties: {
                    id: { type: 'integer', minimum: 1, maximum: 9999 },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    status: { type: 'string', enum: ['active', 'archived'] },
                    createdAt: { type: 'string', format: 'date-time' },
                    vip: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/orders': {
      get: {
        operationId: 'listOrders',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
              },
            },
          },
        },
      },
      post: {
        summary: '创建订单',
        responses: { '201': { content: { 'application/json': { example: { id: 1 } } } } },
      },
    },
  },
  components: {
    schemas: {
      Order: {
        type: 'object',
        properties: {
          no: { type: 'string', pattern: '^NO\\d{12}$' },
          amount: { type: 'number' },
        },
      },
    },
  },
};

describe('importOpenApi', () => {
  it('creates one rule per path + method', () => {
    const { rules } = importOpenApi(doc);
    expect(rules).toHaveLength(3);
    expect(rules.map((rule) => `${rule.method} ${rule.path}`)).toEqual([
      'GET /users/:id',
      'GET /orders',
      'POST /orders',
    ]);
  });

  it('converts `{id}` placeholders to `:id`', () => {
    const { rules } = importOpenApi(doc);
    expect(rules[0]?.path).toBe('/users/:id');
  });

  it('maps schema types to field types and keeps formats', () => {
    const { rules } = importOpenApi(doc);
    const fields = Object.fromEntries((rules[0]?.schema ?? []).map((field) => [field.name, field]));
    expect(fields.id?.type).toBe('int');
    expect(fields.email?.fakerTemplate).toBe('internet.email');
    expect(fields.status?.type).toBe('enum');
    expect(fields.createdAt?.type).toBe('date');
    expect(fields.vip?.type).toBe('boolean');
  });

  it('marks non-required properties as optional', () => {
    const { rules } = importOpenApi(doc);
    const fields = Object.fromEntries((rules[0]?.schema ?? []).map((field) => [field.name, field]));
    expect(fields.id?.optional).toBeFalsy();
    expect(fields.email?.optional).toBe(true);
  });

  it('uses tags as the rule group and the success status', () => {
    const { rules } = importOpenApi(doc);
    expect(rules[0]?.group).toBe('用户');
    expect(rules[2]?.statusCode).toBe(201);
  });

  it('resolves $ref and root arrays', () => {
    const { rules } = importOpenApi(doc);
    expect(rules[1]?.schemaRoot).toBe('array');
    expect(rules[1]?.schema?.[0]?.item?.children?.map((child) => child.name)).toEqual([
      'no',
      'amount',
    ]);
  });

  it('falls back to example JSON when there is no schema', () => {
    const { rules } = importOpenApi(doc);
    expect(rules[2]?.responseType).toBe('json');
    expect(rules[2]?.body).toContain('"id": 1');
  });

  it('warns on documents without paths', () => {
    const result = importOpenApi({ info: {} });
    expect(result.rules).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
