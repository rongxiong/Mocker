import fs from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import { MAX_DELAY_MS, UPLOAD_DIR } from '../config';
import { getFile } from '../db/fileRepo';
import { runScript } from './jsRunner';
import { generateArrayFromSchema, generateFromSchema } from './schemaGen';
import type { MockRequestSnapshot, MockRule } from '../types';

export interface ResponderInput {
  rule: MockRule;
  req: MockRequestSnapshot;
  skipDelay?: boolean;
}

export interface ResponderOutput {
  status: number;
  headers: Record<string, string>;
  contentType: string;
  body: string | Buffer;
  durationMs: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function delayFor(rule: MockRule): number {
  const base = Math.max(0, Math.min(MAX_DELAY_MS, rule.delayMs ?? 0));
  const jitter = Math.max(0, Math.min(MAX_DELAY_MS, rule.delayJitterMs ?? 0));
  return base + Math.round(Math.random() * jitter);
}

function headersFromRule(rule: MockRule): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of rule.headers ?? []) {
    const key = entry.key?.trim();
    if (!key) continue;
    headers[key.toLowerCase()] = entry.value ?? '';
  }
  return headers;
}

function applyEnvelope(rule: MockRule, body: string): string {
  if (rule.envelope === 'none') return body;
  let payload: unknown = body;
  try {
    payload = JSON.parse(body);
  } catch {
    /* keep the raw string when the body is not valid JSON */
  }
  const wrapped =
    rule.envelope === 'codeData'
      ? { code: 0, data: payload }
      : { code: 0, message: 'ok', data: payload };
  return JSON.stringify(wrapped, null, 2);
}

function isTextMime(value: string): boolean {
  return /^(text\/|application\/(json|javascript|xml|xhtml)|.*\+json|.*\+xml)/i.test(value);
}

export async function buildResponse(input: ResponderInput): Promise<ResponderOutput> {
  const { rule, req, skipDelay } = input;
  const started = Date.now();
  const delay = skipDelay ? 0 : delayFor(rule);
  if (delay > 0) await sleep(delay);

  const headers = headersFromRule(rule);
  let status = rule.statusCode || 200;
  let body: string | Buffer = '';
  let contentType = rule.contentType?.trim() ?? '';

  switch (rule.responseType) {
    case 'json': {
      body = rule.body ?? '';
      if (!contentType) contentType = 'application/json; charset=utf-8';
      break;
    }
    case 'html': {
      body = rule.body ?? '';
      if (!contentType) contentType = 'text/html; charset=utf-8';
      break;
    }
    case 'file': {
      const file = rule.fileId ? getFile(rule.fileId) : undefined;
      if (!file) {
        status = 500;
        body = JSON.stringify({
          error: 'Referenced file was not found. Upload it in the Files page.',
        });
        contentType = 'application/json; charset=utf-8';
        break;
      }
      const filePath = path.join(UPLOAD_DIR, path.basename(file.storedName));
      const buffer = await fs.readFile(filePath);
      body = buffer;
      if (!contentType) contentType = mime.lookup(file.name) || 'application/octet-stream';
      break;
    }
    case 'javascript': {
      const result = runScript(rule.body ?? '', req);
      if (typeof result === 'string') {
        body = result;
        if (!contentType) contentType = 'text/plain; charset=utf-8';
      } else if (result === undefined || result === null) {
        body = '';
        if (!contentType) contentType = 'application/json; charset=utf-8';
      } else {
        body = JSON.stringify(result, null, 2);
        if (!contentType) contentType = 'application/json; charset=utf-8';
      }
      break;
    }
    case 'schema': {
      const generated =
        rule.schemaRoot === 'array'
          ? generateArrayFromSchema(rule.schema ?? [], rule.schemaRootMin, rule.schemaRootMax)
          : generateFromSchema(rule.schema ?? []);
      body = JSON.stringify(generated, null, 2);
      if (!contentType) contentType = 'application/json; charset=utf-8';
      break;
    }
    default: {
      body = rule.body ?? '';
      if (!contentType) contentType = 'text/plain; charset=utf-8';
    }
  }

  if (
    rule.envelope !== 'none' &&
    (rule.responseType === 'json' || rule.responseType === 'schema')
  ) {
    body = applyEnvelope(rule, String(body));
  }

  if (contentType) headers['content-type'] = contentType;

  return {
    status,
    headers,
    contentType,
    body,
    durationMs: Date.now() - started,
  };
}

export function isTextResponse(contentType: string): boolean {
  return isTextMime(contentType);
}
