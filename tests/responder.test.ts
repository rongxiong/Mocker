import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UPLOAD_DIR, MAX_DELAY_MS } from '../server/src/config';
import { createDefaultRule } from '../server/src/defaults';
import type { MockRequestSnapshot, MockRule, UploadedFile } from '../server/src/types';

const store = vi.hoisted(() => ({ files: new Map<string, UploadedFile>() }));

vi.mock('../server/src/db/fileRepo', () => ({
  getFile: (id: string) => store.files.get(id),
}));

import { buildResponse, delayFor, isTextResponse } from '../server/src/services/responder';

function snapshot(overrides: Partial<MockRequestSnapshot> = {}): MockRequestSnapshot {
  return {
    method: 'GET',
    path: '/api/example',
    params: {},
    query: {},
    headers: {},
    cookies: {},
    body: undefined,
    ...overrides,
  };
}

const run = (rule: Partial<MockRule>, req: MockRequestSnapshot = snapshot()) =>
  buildResponse({ rule: createDefaultRule(rule), req, skipDelay: true });

describe('buildResponse', () => {
  beforeAll(() => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  });

  it('serves JSON with the default content type and status', async () => {
    const result = await run({ responseType: 'json', body: '{"ok":true}', statusCode: 201 });
    expect(result.status).toBe(201);
    expect(result.body).toBe('{"ok":true}');
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('serves HTML with the default content type', async () => {
    const result = await run({ responseType: 'html', body: '<h1>hi</h1>' });
    expect(result.body).toBe('<h1>hi</h1>');
    expect(result.contentType).toBe('text/html; charset=utf-8');
  });

  it('keeps an explicit content type override', async () => {
    const result = await run({ responseType: 'json', contentType: 'application/vnd.api+json' });
    expect(result.contentType).toBe('application/vnd.api+json');
  });

  it('lowercases rule headers and drops empty keys', async () => {
    const result = await run({
      headers: [
        { key: 'X-Trace-Id', value: 'abc' },
        { key: '   ', value: 'ignored' },
      ],
    });
    expect(result.headers['x-trace-id']).toBe('abc');
    expect(Object.keys(result.headers).sort()).toEqual(['content-type', 'x-trace-id']);
  });

  it('stringifies object results from JavaScript rules', async () => {
    const result = await run(
      {
        responseType: 'javascript',
        body: 'return { hello: req.query.name ?? "world" };',
      },
      snapshot({ query: { name: 'mocker' } }),
    );
    expect(JSON.parse(String(result.body))).toEqual({ hello: 'mocker' });
    expect(result.contentType).toBe('application/json; charset=utf-8');
  });

  it('serves plain text when a JavaScript rule returns a string', async () => {
    const result = await run({ responseType: 'javascript', body: 'return "pong";' });
    expect(result.body).toBe('pong');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
  });

  it('generates structured responses from the schema tree', async () => {
    const result = await run({
      responseType: 'schema',
      schema: [
        { id: 'f1', name: 'id', type: 'int', min: 5, max: 5 },
        { id: 'f2', name: 'name', type: 'string', stringGen: 'const', constValue: 'ada' },
      ],
    });
    expect(JSON.parse(String(result.body))).toEqual({ id: 5, name: 'ada' });
  });

  it('generates a top-level array when schemaRoot is array', async () => {
    const result = await run({
      responseType: 'schema',
      schemaRoot: 'array',
      schemaRootMin: 3,
      schemaRootMax: 3,
      schema: [{ id: 'f1', name: 'id', type: 'int', min: 1, max: 1 }],
    });
    const parsed = JSON.parse(String(result.body)) as unknown[];
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ id: 1 });
  });

  it('returns 500 when the referenced file is missing', async () => {
    const result = await run({ responseType: 'file', fileId: 'nope' });
    expect(result.status).toBe(500);
    expect(String(result.body)).toContain('Referenced file was not found');
  });

  it('streams the uploaded file and infers its mime type', async () => {
    const storedName = 'responder-sample.csv';
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), 'a,b\n1,2\n');
    store.files.set('file-1', {
      id: 'file-1',
      name: 'report.csv',
      size: 8,
      mime: 'text/csv',
      storedName,
      createdAt: Date.now(),
    });

    const result = await run({ responseType: 'file', fileId: 'file-1' });
    expect(Buffer.isBuffer(result.body)).toBe(true);
    expect(String(result.body)).toBe('a,b\n1,2\n');
    expect(result.contentType).toBe('text/csv');
  });

  it('wraps JSON responses in the code/data envelope', async () => {
    const result = await run({ responseType: 'json', body: '{"id":1}', envelope: 'codeData' });
    expect(JSON.parse(String(result.body))).toEqual({ code: 0, data: { id: 1 } });
  });

  it('wraps JSON responses in the code/message/data envelope', async () => {
    const result = await run({
      responseType: 'json',
      body: '{"id":1}',
      envelope: 'codeMessageData',
    });
    expect(JSON.parse(String(result.body))).toEqual({ code: 0, message: 'ok', data: { id: 1 } });
  });

  it('keeps non-JSON bodies intact inside the envelope', async () => {
    const result = await run({ responseType: 'json', body: 'not-json', envelope: 'codeData' });
    expect(JSON.parse(String(result.body))).toEqual({ code: 0, data: 'not-json' });
  });

  it('does not envelope HTML responses', async () => {
    const result = await run({ responseType: 'html', body: '<p>x</p>', envelope: 'codeData' });
    expect(result.body).toBe('<p>x</p>');
  });

  it('applies the configured delay unless it is skipped', async () => {
    const started = Date.now();
    const result = await buildResponse({
      rule: createDefaultRule({ delayMs: 40 }),
      req: snapshot(),
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(result.durationMs).toBeGreaterThanOrEqual(25);
  });
});

describe('delayFor', () => {
  it('is 0 for a rule without delay', () => {
    expect(delayFor(createDefaultRule())).toBe(0);
  });

  it('never returns a negative value', () => {
    expect(delayFor(createDefaultRule({ delayMs: -100, delayJitterMs: -50 }))).toBe(0);
  });

  it('adds at most the configured jitter', () => {
    const delay = delayFor(createDefaultRule({ delayMs: 10, delayJitterMs: 5 }));
    expect(delay).toBeGreaterThanOrEqual(10);
    expect(delay).toBeLessThanOrEqual(15);
  });

  it('clamps the delay to the configured maximum', () => {
    const delay = delayFor(
      createDefaultRule({ delayMs: MAX_DELAY_MS * 10, delayJitterMs: MAX_DELAY_MS * 10 }),
    );
    expect(delay).toBeLessThanOrEqual(MAX_DELAY_MS * 2);
  });
});

describe('isTextResponse', () => {
  it('detects textual mime types', () => {
    expect(isTextResponse('application/json')).toBe(true);
    expect(isTextResponse('application/vnd.api+json')).toBe(true);
    expect(isTextResponse('text/html; charset=utf-8')).toBe(true);
    expect(isTextResponse('image/png')).toBe(false);
    expect(isTextResponse('application/octet-stream')).toBe(false);
  });
});
