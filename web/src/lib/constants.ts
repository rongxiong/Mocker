import type { HttpMethod, ResponseType, SchemaFieldType, StringGenMode } from '@shared/types';
import { HTTP_METHODS } from '@shared/types';
import { SAMPLE_HTML, SAMPLE_JSON, SAMPLE_SCRIPT } from '@shared/defaults';

export { HTTP_METHODS };

export const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  POST: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  PUT: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  PATCH: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
  DELETE: 'bg-rose-400/15 text-rose-300 border-rose-400/30',
  HEAD: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  OPTIONS: 'bg-teal-400/15 text-teal-300 border-teal-400/30',
};

export const METHOD_DOT: Record<HttpMethod, string> = {
  GET: 'bg-emerald-400',
  POST: 'bg-sky-400',
  PUT: 'bg-amber-400',
  PATCH: 'bg-violet-400',
  DELETE: 'bg-rose-400',
  HEAD: 'bg-slate-400',
  OPTIONS: 'bg-teal-400',
};

export interface ResponseTypeMeta {
  value: ResponseType;
  label: string;
  hint: string;
}

export const RESPONSE_TYPES: ResponseTypeMeta[] = [
  { value: 'json', label: 'JSON', hint: 'Static JSON payload edited inline' },
  { value: 'schema', label: 'JSON 结构', hint: 'Visual field tree with generated random values' },
  { value: 'html', label: 'HTML', hint: 'Raw HTML fragment or page' },
  { value: 'javascript', label: 'JavaScript', hint: 'Dynamic script executed per request' },
  { value: 'file', label: 'File', hint: 'Serve an uploaded file as the response body' },
];

export const FIELD_TYPES: Array<{ value: SchemaFieldType; label: string }> = [
  { value: 'string', label: 'string' },
  { value: 'int', label: 'int' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'uuid', label: 'uuid' },
  { value: 'date', label: 'date' },
  { value: 'enum', label: 'enum' },
  { value: 'object', label: 'object' },
  { value: 'array', label: 'array' },
];

export const STRING_GEN_MODES: Array<{ value: StringGenMode; label: string }> = [
  { value: 'regex', label: 'Regex' },
  { value: 'faker', label: 'Faker' },
  { value: 'enum', label: 'Enum' },
  { value: 'const', label: 'Fixed' },
];

export const DATE_FORMATS: Array<{ value: string; label: string }> = [
  { value: 'iso', label: 'ISO 8601' },
  { value: 'timestamp', label: 'Unix ms' },
  { value: 'custom', label: 'Custom' },
];

export const FAKER_PRESETS = [
  'person.fullName',
  'person.firstName',
  'person.lastName',
  'internet.email',
  'internet.userName',
  'internet.url',
  'phone.number',
  'location.city',
  'location.streetAddress',
  'commerce.productName',
  'commerce.department',
  'company.name',
  'lorem.word',
  'lorem.sentence',
  'datatype.uuid',
];

export const REGEX_PRESETS: Array<{ label: string; pattern: string }> = [
  { label: '手机号', pattern: '^1[3-9]\\d{9}$' },
  { label: '订单号', pattern: '^NO\\d{12}$' },
  { label: 'SKU', pattern: '^SKU-[A-Z]{3}-\\d{6}$' },
  { label: '邮箱', pattern: '^[a-z]{6,10}@(gmail|qq|163)\\.com$' },
  { label: '日期', pattern: '^20\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$' },
  { label: '车牌', pattern: '^[京沪粤浙苏鲁]{1}[A-Z]{1}[A-Z0-9]{5}$' },
  { label: '6位验证码', pattern: '^\\d{6}$' },
];

export const COMMON_STATUS_CODES = [
  200, 201, 202, 204, 301, 302, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503,
];

export const CONDITION_SOURCES: Array<{ value: string; label: string }> = [
  { value: 'query', label: 'query' },
  { value: 'header', label: 'header' },
  { value: 'cookie', label: 'cookie' },
  { value: 'body', label: 'body' },
  { value: 'path', label: 'path' },
];

export const CONDITION_OPERATORS: Array<{ value: string; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'contains', label: '包含' },
  { value: 'regex', label: '正则' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'exists', label: '存在' },
];

export const ENVELOPES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'none', label: '不包装', hint: '原样返回' },
  { value: 'codeData', label: 'code + data', hint: '{ "code": 0, "data": ... }' },
  {
    value: 'codeMessageData',
    label: 'code + message + data',
    hint: '{ "code": 0, "message": "ok", "data": ... }',
  },
];

export const ABORT_MODES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'none', label: '正常响应', hint: '按规则返回内容' },
  { value: 'close', label: '断开连接', hint: '延迟后直接 reset 连接，客户端报网络错误' },
  { value: 'hang', label: '挂起不响应', hint: '永不返回，用于模拟请求超时' },
];

export const IMPORTABLE_HINT =
  'faker, @faker-js/faker, randexp, uuid, path, url, util, crypto, querystring';

const SAMPLES: Partial<Record<ResponseType, string>> = {
  json: SAMPLE_JSON,
  html: SAMPLE_HTML,
  javascript: SAMPLE_SCRIPT,
};

/**
 * Switches the body only when it is untouched (empty or still the default sample),
 * so hand-written content is never destroyed by a tab change.
 */
export function bodyForType(current: ResponseType, next: ResponseType, body: string): string {
  if (current === next) return body;
  if (!body.trim()) return SAMPLES[next] ?? body;
  if (SAMPLES[current] === body) return SAMPLES[next] ?? body;
  return body;
}
