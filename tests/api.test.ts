import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/src/app';
import { db, initDb } from '../server/src/db';
import { migrate } from '../server/src/db/migrate';
import { clearLogs } from '../server/src/services/logStore';
import { resetVariants } from '../server/src/services/variants';
import { createDefaultRule } from '../server/src/defaults';
import type { MockRule, PreviewResult, RequestLogEntry, UploadedFile } from '../server/src/types';

let server: Server;
let base = '';

beforeAll(async () => {
  await initDb();
  migrate();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  // `abort: 'hang'` rules leave sockets open, so drop them before closing.
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db().close();
});

beforeEach(() => {
  clearLogs();
  resetVariants();
});

async function createRule(patch: Partial<MockRule> = {}): Promise<MockRule> {
  const response = await fetch(`${base}/__api/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(createDefaultRule(patch)),
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { rule: MockRule };
  return payload.rule;
}

async function clearRules(): Promise<void> {
  const response = await fetch(`${base}/__api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'replace', rules: [] }),
  });
  expect(response.ok).toBe(true);
}

describe('admin API', () => {
  beforeEach(clearRules);

  it('creates, reads, updates and deletes rules', async () => {
    const created = await createRule({ name: 'Ping', path: '/api/ping' });
    expect(created.id).toBeTruthy();

    const listResponse = await fetch(`${base}/__api/rules`);
    const list = (await listResponse.json()) as { rules: MockRule[]; conflicts: unknown[] };
    expect(list.rules.map((rule) => rule.name)).toEqual(['Ping']);
    expect(list.conflicts).toEqual([]);

    const updateResponse = await fetch(`${base}/__api/rules/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Pong' }),
    });
    expect((await updateResponse.json()) as { rule: MockRule }).toMatchObject({
      rule: { name: 'Pong' },
    });

    const deleteResponse = await fetch(`${base}/__api/rules/${created.id}`, { method: 'DELETE' });
    expect(await deleteResponse.json()).toEqual({ ok: true });
    expect((await fetch(`${base}/__api/rules/${created.id}`)).status).toBe(404);
  });

  it('reports conflicting rules that share method + path', async () => {
    await createRule({ path: '/api/orders' });
    await createRule({ path: '/api/orders/' });
    const list = (await (await fetch(`${base}/__api/rules`)).json()) as {
      conflicts: { key: string; ids: string[] }[];
    };
    expect(list.conflicts).toHaveLength(1);
    expect(list.conflicts[0]?.key).toBe('GET /api/orders');
    expect(list.conflicts[0]?.ids).toHaveLength(2);
  });

  it('duplicates a rule with a fresh id', async () => {
    const source = await createRule({ name: 'Source' });
    const response = await fetch(`${base}/__api/rules/${source.id}/duplicate`, { method: 'POST' });
    const copy = ((await response.json()) as { rule: MockRule }).rule;
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Source copy');
  });

  it('previews a rule without applying its delay', async () => {
    const response = await fetch(`${base}/__api/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rule: createDefaultRule({ responseType: 'json', body: '{"preview":true}', delayMs: 5000 }),
        request: {},
      }),
    });
    const { preview } = (await response.json()) as { preview: PreviewResult };
    expect(preview.status).toBe(200);
    expect(JSON.parse(preview.body)).toEqual({ preview: true });
    expect(preview.durationMs).toBeLessThan(1000);
  });

  it('exports and re-imports the whole configuration', async () => {
    await createRule({ name: 'Export me', path: '/api/export' });
    const exported = (await (await fetch(`${base}/__api/export`)).json()) as {
      version: number;
      rules: MockRule[];
      settings: Record<string, string>;
    };
    expect(exported.version).toBe(2);
    expect(exported.rules).toHaveLength(1);

    await clearRules();
    const importResponse = await fetch(`${base}/__api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'replace', rules: exported.rules, settings: exported.settings }),
    });
    expect(await importResponse.json()).toMatchObject({ imported: 1, updated: 0, total: 1 });
  });

  it('reports imported rules that overwrite an existing id', async () => {
    const existing = await createRule({ name: 'before' });
    const response = await fetch(`${base}/__api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'merge', rules: [{ ...existing, name: 'after' }] }),
    });
    expect(await response.json()).toMatchObject({ imported: 0, updated: 1, total: 1 });
    expect(
      (await (await fetch(`${base}/__api/rules/${existing.id}`)).json()) as { rule: MockRule },
    ).toMatchObject({ rule: { name: 'after' } });
  });

  it('normalises imported variants with missing fields', async () => {
    const rule = createDefaultRule({
      name: 'partial variant',
      path: '/api/partial',
      variants: [{ id: 'v1' }] as unknown as MockRule['variants'],
    });
    const response = await fetch(`${base}/__api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'replace', rules: [rule] }),
    });
    expect(response.ok).toBe(true);

    const hit = await fetch(`${base}/mock/api/partial`);
    expect(hit.status).toBe(200);
  });

  it('exposes runtime info', async () => {
    const info = (await (await fetch(`${base}/__api/info`)).json()) as Record<string, unknown>;
    expect(info.mockPrefix).toBe('/mock');
    expect(info.adminPrefix).toBe('/__api');
    expect(info.dbDriver).toBeTruthy();
  });
});

describe('mock router', () => {
  beforeEach(clearRules);

  it('serves a static JSON rule', async () => {
    await createRule({
      method: 'GET',
      path: '/api/ping',
      responseType: 'json',
      body: '{"pong":true}',
    });

    const response = await fetch(`${base}/mock/api/ping`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ pong: true });
  });

  it('applies the configured status code and headers', async () => {
    await createRule({
      path: '/api/created',
      statusCode: 201,
      headers: [{ key: 'X-Trace-Id', value: 'trace-1' }],
      body: '{}',
    });

    const response = await fetch(`${base}/mock/api/created`);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-trace-id')).toBe('trace-1');
  });

  it('passes params, query and body into JavaScript rules', async () => {
    await createRule({
      method: 'POST',
      path: '/api/echo/:id',
      responseType: 'javascript',
      body: 'return { id: req.params.id, q: req.query.q ?? null, name: req.body.name };',
    });

    const response = await fetch(`${base}/mock/api/echo/42?q=term`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ada' }),
    });
    await expect(response.json()).resolves.toEqual({ id: '42', q: 'term', name: 'ada' });
  });

  it('responds with the configured delay', async () => {
    await createRule({ path: '/api/slow', delayMs: 150, delayJitterMs: 0, body: '{"slow":true}' });

    const started = Date.now();
    const response = await fetch(`${base}/mock/api/slow`);
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(120);
  });

  it('prefers a conditional rule over a catch-all rule', async () => {
    await createRule({ path: '/api/users/:id', body: '{"variant":"plain"}' });
    await createRule({
      path: '/api/users/:id',
      body: '{"variant":"vip"}',
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });

    const vip = await fetch(`${base}/mock/api/users/1?type=vip`);
    await expect(vip.json()).resolves.toEqual({ variant: 'vip' });

    const plain = await fetch(`${base}/mock/api/users/1`);
    await expect(plain.json()).resolves.toEqual({ variant: 'plain' });
  });

  it('cycles through response variants', async () => {
    await createRule({
      path: '/api/flaky',
      body: '{"try":"base"}',
      variants: [
        { id: 'v1', label: 'ok', statusCode: '200', delayMs: '', body: '{"try":"first"}' },
        { id: 'v2', label: 'bad', statusCode: '500', delayMs: '', body: '{"try":"second"}' },
      ],
    });

    const first = await fetch(`${base}/mock/api/flaky`);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ try: 'first' });

    const second = await fetch(`${base}/mock/api/flaky`);
    expect(second.status).toBe(500);
    await expect(second.json()).resolves.toEqual({ try: 'second' });
  });

  it('ignores disabled rules', async () => {
    await createRule({ path: '/api/off', enabled: false, body: '{}' });
    const response = await fetch(`${base}/mock/api/off`);
    expect(response.status).toBe(404);
  });

  it('answers 404 with a hint when nothing matches', async () => {
    const response = await fetch(`${base}/mock/api/nothing-here`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'No matching mock rule' });
  });

  it('falls back to GET rules for HEAD requests', async () => {
    await createRule({ method: 'GET', path: '/api/head', body: '{"ok":true}' });
    const response = await fetch(`${base}/mock/api/head`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('answers CORS preflight requests on the mock entry', async () => {
    const response = await fetch(`${base}/mock/api/ping`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('resets the connection for `abort: close` rules', async () => {
    await createRule({ path: '/api/abort-close', abort: 'close', body: '{}' });
    await expect(fetch(`${base}/mock/api/abort-close`)).rejects.toThrow();
  });

  it('never answers for `abort: hang` rules', async () => {
    await createRule({ path: '/api/abort-hang', abort: 'hang', body: '{}' });
    await expect(
      fetch(`${base}/mock/api/abort-hang`, { signal: AbortSignal.timeout(300) }),
    ).rejects.toThrow();
  });

  it('returns 500 when a JavaScript rule throws', async () => {
    await createRule({
      path: '/api/boom',
      responseType: 'javascript',
      body: 'throw new Error("boom");',
    });
    const response = await fetch(`${base}/mock/api/boom`);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to generate mock response',
      message: 'boom',
    });
  });

  it('proxies unmatched requests when a proxy target is configured', async () => {
    await fetch(`${base}/__api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proxyTarget: base }),
    });

    try {
      const response = await fetch(`${base}/mock/__api/rules`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toHaveProperty('rules');
    } finally {
      await fetch(`${base}/__api/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proxyTarget: '' }),
      });
    }
  });

  it('does not 500 when a cookie is malformed', async () => {
    await createRule({
      path: '/api/cookie',
      body: '{"ok":true}',
      conditions: [{ id: 'c1', source: 'query', key: 'x', op: 'eq', value: '1' }],
    });

    const response = await fetch(`${base}/mock/api/cookie?x=1`, {
      headers: { cookie: 'broken=%E0%A4%A; ok=1' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('records request logs for hits and misses', async () => {
    await createRule({ path: '/api/logged', body: '{}' });
    await fetch(`${base}/mock/api/logged`);
    await fetch(`${base}/mock/api/missing`);

    const { logs } = (await (await fetch(`${base}/__api/logs`)).json()) as {
      logs: RequestLogEntry[];
    };
    // `recentLogs()` returns the newest entry first: the miss happened last.
    expect(logs[0]?.matched).toBe(false);
    expect(logs[0]?.status).toBe(404);
    expect(logs[1]?.matched).toBe(true);
    expect(logs[1]?.status).toBe(200);

    const cleared = await fetch(`${base}/__api/logs`, { method: 'DELETE' });
    expect(await cleared.json()).toEqual({ ok: true });
    expect(
      ((await (await fetch(`${base}/__api/logs`)).json()) as { logs: unknown[] }).logs,
    ).toEqual([]);
  });
});

describe('proxy passthrough', () => {
  let upstream: Server;
  let upstreamUrl = '';
  const seen: { method?: string; contentType?: string; body: string }[] = [];

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        seen.push({ method: req.method, contentType: req.headers['content-type'], body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ echoed: body }));
      });
    });
    await new Promise<void>((resolve) => {
      upstream.listen(0, '127.0.0.1', () => resolve());
    });
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  beforeEach(async () => {
    seen.length = 0;
    await clearRules();
    await fetch(`${base}/__api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proxyTarget: upstreamUrl }),
    });
  });

  afterAll(async () => {
    await fetch(`${base}/__api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proxyTarget: '' }),
    });
  });

  it('forwards a JSON body instead of "[object Object]"', async () => {
    const response = await fetch(`${base}/mock/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ada' }),
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.body).toBe('{"name":"ada"}');
    await expect(response.json()).resolves.toEqual({ echoed: '{"name":"ada"}' });
  });

  it('re-encodes urlencoded bodies', async () => {
    await fetch(`${base}/mock/api/form`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'name=ada&city=London',
    });
    expect(seen[0]?.body).toBe('name=ada&city=London');
  });

  it('forwards text bodies untouched', async () => {
    await fetch(`${base}/mock/api/text`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'raw text',
    });
    expect(seen[0]?.body).toBe('raw text');
  });
});

describe('file library', () => {
  async function upload(name: string, content: string): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', new File([content], name, { type: 'text/csv' }));
    const response = await fetch(`${base}/__api/files/upload`, { method: 'POST', body: form });
    expect(response.status).toBe(201);
    return ((await response.json()) as { file: UploadedFile }).file;
  }

  it('uploads, lists, downloads and deletes files', async () => {
    const file = await upload('people.csv', 'id,name\n1,ada\n');
    expect(file.name).toBe('people.csv');
    expect(file.mime).toBe('text/csv');

    const listed = (await (await fetch(`${base}/__api/files`)).json()) as { files: UploadedFile[] };
    expect(listed.files.map((item) => item.id)).toContain(file.id);

    const download = await fetch(`${base}/__api/files/${file.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('people.csv');
    expect(await download.text()).toBe('id,name\n1,ada\n');

    const removed = await fetch(`${base}/__api/files/${file.id}`, { method: 'DELETE' });
    expect(await removed.json()).toEqual({ ok: true });
    expect((await fetch(`${base}/__api/files/${file.id}/download`)).status).toBe(404);
    expect((await fetch(`${base}/__api/files/${file.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('rejects uploads without a file', async () => {
    const form = new FormData();
    const response = await fetch(`${base}/__api/files/upload`, { method: 'POST', body: form });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'No file received' });
  });

  it('serves uploaded files through file rules', async () => {
    const file = await upload('payload.json', '{"from":"file"}');
    await createRule({ path: '/api/from-file', responseType: 'file', fileId: file.id });

    const response = await fetch(`${base}/mock/api/from-file`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).toBe('{"from":"file"}');

    await fetch(`${base}/__api/files/${file.id}?force=1`, { method: 'DELETE' });
  });

  it('refuses to delete a file that rules still reference', async () => {
    const file = await upload('referenced.txt', 'hello');
    const rule = await createRule({
      path: '/api/uses-file',
      responseType: 'file',
      fileId: file.id,
    });

    const blocked = await fetch(`${base}/__api/files/${file.id}`, { method: 'DELETE' });
    expect(blocked.status).toBe(409);
    const payload = (await blocked.json()) as { rules: { id: string }[] };
    expect(payload.rules.map((item) => item.id)).toEqual([rule.id]);

    const forced = await fetch(`${base}/__api/files/${file.id}?force=1`, { method: 'DELETE' });
    expect(await forced.json()).toEqual({ ok: true });
    expect((await fetch(`${base}/__api/files/${file.id}/download`)).status).toBe(404);
  });
});

describe('settings and variants', () => {
  it('stores settings and resets variant counters', async () => {
    const response = await fetch(`${base}/__api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proxyTarget: 'http://upstream.test', unknownKey: 'ignored' }),
    });
    const { settings } = (await response.json()) as { settings: Record<string, string> };
    expect(settings.proxyTarget).toBe('http://upstream.test');
    expect(settings).not.toHaveProperty('unknownKey');

    await fetch(`${base}/__api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proxyTarget: '' }),
    });

    const reset = await fetch(`${base}/__api/variants/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ruleId: 'rule-1' }),
    });
    expect(await reset.json()).toEqual({ ok: true });
  });

  it('reports preview errors without throwing', async () => {
    const response = await fetch(`${base}/__api/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rule: createDefaultRule({ responseType: 'javascript', body: 'throw new Error("nope");' }),
        request: {},
      }),
    });
    const { preview } = (await response.json()) as { preview: PreviewResult };
    expect(preview.status).toBe(500);
    expect(preview.error).toContain('nope');
  });
});
