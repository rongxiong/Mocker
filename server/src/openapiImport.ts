import type { HttpMethod, MockRule, SchemaField, SchemaFieldType } from './types';
import { uid } from './defaults';

type Json = Record<string, unknown>;

export interface OpenApiImportResult {
  rules: Partial<MockRule>[];
  warnings: string[];
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function convertPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ':$1');
}

function resolveRef(doc: Json, ref: string): Json | null {
  if (!ref.startsWith('#/')) return null;
  let cursor: unknown = doc;
  for (const segment of ref.slice(2).split('/')) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = (cursor as Json)[decodeURIComponent(segment)];
  }
  return cursor && typeof cursor === 'object' ? (cursor as Json) : null;
}

function deref(doc: Json, schema: Json | null, depth = 0): Json | null {
  if (!schema || depth > 6) return null;
  if (typeof schema.$ref === 'string') {
    return deref(doc, resolveRef(doc, schema.$ref), depth + 1);
  }
  return schema;
}

function fieldFromSchema(doc: Json, schema: Json | null, name: string, depth = 0): SchemaField {
  const resolved = deref(doc, schema);
  const base: SchemaField = { id: uid(), name, type: 'string' };
  if (!resolved || depth > 8) {
    return { ...base, stringGen: 'const', constValue: '' };
  }

  const type = String(resolved.type ?? 'object');
  const format = typeof resolved.format === 'string' ? resolved.format : '';
  const description = typeof resolved.description === 'string' ? resolved.description : '';

  if (type === 'object' || resolved.properties) {
    const properties = (resolved.properties ?? {}) as Record<string, Json>;
    const required = Array.isArray(resolved.required) ? (resolved.required as string[]) : [];
    return {
      ...base,
      type: 'object',
      children: Object.entries(properties).map(([key, child]) => {
        const childField = fieldFromSchema(doc, child, key, depth + 1);
        return required.includes(key)
          ? childField
          : { ...childField, optional: true, optionalRatio: 0.9 };
      }),
    };
  }

  if (type === 'array') {
    const items = (resolved.items ?? {}) as Json;
    return {
      ...base,
      type: 'array',
      itemCountMin: Number(resolved.minItems ?? 2),
      itemCountMax: Number(resolved.maxItems ?? 4),
      item: { ...fieldFromSchema(doc, items, 'item', depth + 1), name: 'item' },
    };
  }

  if (type === 'integer') {
    return {
      ...base,
      type: 'int',
      min: Number(resolved.minimum ?? 1),
      max: Number(resolved.maximum ?? 10000),
    };
  }

  if (type === 'number') {
    return {
      ...base,
      type: 'number',
      min: Number(resolved.minimum ?? 0),
      max: Number(resolved.maximum ?? 1000),
      precision: 2,
    };
  }

  if (type === 'boolean') {
    return { ...base, type: 'boolean', trueRatio: 0.5 };
  }

  // string & friends
  if (format === 'date-time' || format === 'date') {
    return { ...base, type: 'date', dateFormat: 'iso' };
  }
  if (format === 'uuid') return { ...base, type: 'uuid' };
  if (format === 'email') {
    return { ...base, stringGen: 'faker', fakerTemplate: 'internet.email' };
  }
  if (format === 'uri' || format === 'url') {
    return { ...base, stringGen: 'faker', fakerTemplate: 'internet.url' };
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return {
      ...base,
      type: 'enum',
      values: (resolved.enum as unknown[]).map((value) => String(value)),
    };
  }
  if (typeof resolved.pattern === 'string') {
    return { ...base, stringGen: 'regex', pattern: resolved.pattern };
  }

  const example = typeof resolved.example === 'string' ? resolved.example : description ? '' : '';
  return { ...base, stringGen: 'const', constValue: example };
}

function pickSuccessResponse(responses: Json): { status: string; response: Json } | null {
  const entries = Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status));
  const chosen = entries[0];
  if (!chosen) return null;
  return { status: chosen[0], response: (chosen[1] ?? {}) as Json };
}

/** Converts an OpenAPI 3 (or Swagger 2 with `definitions`) document into rule drafts. */
export function importOpenApi(input: unknown): OpenApiImportResult {
  const doc = (input ?? {}) as Json;
  const paths = (doc.paths ?? {}) as Record<string, Json>;
  const rules: Partial<MockRule>[] = [];
  const warnings: string[] = [];

  if (Object.keys(paths).length === 0) {
    warnings.push('文档中没有找到 paths 字段，请确认这是 OpenAPI / Swagger JSON。');
    return { rules, warnings };
  }

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method.toLowerCase()] as Json | undefined;
      if (!operation) continue;

      const responses = (operation.responses ?? {}) as Json;
      const picked = pickSuccessResponse(responses);
      const content = (picked?.response.content ?? {}) as Json;
      const media =
        (content['application/json'] as Json | undefined) ??
        (content['*/*'] as Json | undefined) ??
        (Object.values(content)[0] as Json | undefined);

      const schema = media?.schema ? (media.schema as Json) : null;
      const example = media?.example ?? (picked?.response as Json)?.example;

      const draft: Partial<MockRule> = {
        name:
          (typeof operation.summary === 'string' && operation.summary) ||
          (typeof operation.operationId === 'string' && operation.operationId) ||
          `${method} ${rawPath}`,
        method,
        path: convertPath(rawPath),
        statusCode: Number(picked?.status ?? 200),
        group:
          Array.isArray(operation.tags) && operation.tags.length > 0
            ? String(operation.tags[0])
            : '',
        description: typeof operation.description === 'string' ? operation.description : '',
        enabled: true,
      };

      if (schema) {
        const required = Array.isArray((schema as Json).required)
          ? ((schema as Json).required as string[])
          : [];
        const fields = Object.entries(
          ((schema as Json).properties ?? {}) as Record<string, Json>,
        ).map(([key, child]) => {
          const childField = fieldFromSchema(doc, child, key);
          return required.includes(key)
            ? childField
            : { ...childField, optional: true, optionalRatio: 0.9 };
        });
        const single = (schema as Json).type === 'array';
        draft.responseType = 'schema';
        draft.schema = single
          ? [
              {
                id: uid(),
                name: 'items',
                type: 'array' as SchemaFieldType,
                itemCountMin: Number((schema as Json).minItems ?? 2),
                itemCountMax: Number((schema as Json).maxItems ?? 5),
                item: fieldFromSchema(doc, ((schema as Json).items ?? {}) as Json, 'item'),
              },
            ]
          : fields;
        draft.schemaRoot = single ? 'array' : 'object';
        if (draft.schema.length === 0) {
          warnings.push(`${method} ${rawPath}：响应 schema 没有可识别的属性，已回退为 JSON。`);
          draft.responseType = 'json';
          draft.body = JSON.stringify({ message: 'ok' }, null, 2);
        }
      } else if (example) {
        draft.responseType = 'json';
        draft.body = JSON.stringify(example, null, 2);
      } else {
        draft.responseType = 'json';
        draft.body = JSON.stringify({ code: 0, message: 'ok', data: null }, null, 2);
        warnings.push(`${method} ${rawPath}：响应没有 schema/example，已生成占位 JSON。`);
      }

      rules.push(draft);
    }
  }

  if (rules.length === 0) warnings.push('没有解析到任何接口，请检查文档结构。');
  return { rules, warnings };
}
