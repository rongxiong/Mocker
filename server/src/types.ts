export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

export type ResponseType = 'json' | 'html' | 'file' | 'javascript' | 'schema';

export type SchemaFieldType =
  'string' | 'number' | 'int' | 'boolean' | 'uuid' | 'date' | 'enum' | 'object' | 'array';

export type StringGenMode = 'regex' | 'faker' | 'const' | 'enum';

export type EnvelopeType = 'none' | 'codeData' | 'codeMessageData';

export interface SchemaField {
  id: string;
  name: string;
  type: SchemaFieldType;
  /** field is emitted only with the given probability (0~1) */
  optional?: boolean;
  optionalRatio?: number;
  /** string only */
  stringGen?: StringGenMode;
  pattern?: string;
  fakerTemplate?: string;
  constValue?: string;
  values?: string[];
  /** number / int */
  min?: number;
  max?: number;
  precision?: number;
  /** boolean */
  trueRatio?: number;
  /** date */
  dateFormat?: 'iso' | 'timestamp' | 'custom';
  dateCustom?: string;
  /** object */
  children?: SchemaField[];
  /** array */
  item?: SchemaField;
  itemCountMin?: number;
  itemCountMax?: number;
}

export interface HeaderEntry {
  key: string;
  value: string;
}

export type SchemaRootType = 'object' | 'array';

/** What the server should do to the connection instead of sending a normal response. */
export type AbortMode = 'none' | 'close' | 'hang';

export type ConditionSource = 'query' | 'header' | 'cookie' | 'body' | 'path';
export type ConditionOperator = 'eq' | 'ne' | 'contains' | 'exists' | 'regex' | 'gt' | 'lt';

export interface RuleCondition {
  id: string;
  source: ConditionSource;
  /** dot path for `body`, e.g. `user.type` */
  key: string;
  op: ConditionOperator;
  value: string;
}

export interface ResponseVariant {
  id: string;
  label: string;
  /** empty string means "inherit from the rule" */
  statusCode: string;
  delayMs: string;
  body: string;
}

export interface RuleConflict {
  key: string;
  ids: string[];
  /** the rule that actually wins, i.e. the first one in match order */
  activeId: string;
}

export interface MockRule {
  id: string;
  name: string;
  method: HttpMethod;
  /** path without the mock prefix, may contain `:param` segments */
  path: string;
  enabled: boolean;
  description: string;
  /** free-form tag used to group rules in the console */
  group: string;
  delayMs: number;
  delayJitterMs: number;
  statusCode: number;
  headers: HeaderEntry[];
  contentType: string;
  responseType: ResponseType;
  body: string;
  fileId: string;
  schema: SchemaField[];
  /** shape of the generated root value in `schema` mode */
  schemaRoot: SchemaRootType;
  schemaRootMin: number;
  schemaRootMax: number;
  /** all conditions must match for the rule to be used */
  conditions: RuleCondition[];
  /** when non-empty, requests cycle through these overrides */
  variants: ResponseVariant[];
  abort: AbortMode;
  /** wraps JSON / structured responses in a common envelope */
  envelope: EnvelopeType;
  createdAt: number;
  updatedAt: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  storedName: string;
  createdAt: number;
}

export interface MockRequestSnapshot {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: unknown;
}

export interface PreviewResult {
  status: number;
  headers: Record<string, string>;
  contentType: string;
  body: string;
  isBinary: boolean;
  durationMs: number;
  error?: string;
}

export interface RequestLogEntry {
  id: string;
  at: number;
  method: string;
  path: string;
  ruleId: string;
  ruleName: string;
  status: number;
  durationMs: number;
  matched: boolean;
  requestBody?: string;
  responseBody?: string;
}
