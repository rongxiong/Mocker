import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/src/app';
import { db, initDb } from '../server/src/db';
import { migrate } from '../server/src/db/migrate';
import { clearLogs } from '../server/src/services/logStore';
import { resetSequence } from '../server/src/services/sequence';
import { createDefaultRule, createResponseEntry } from '../server/src/defaults';
import type {
  MockRule,
  PreviewResult,
  RequestLogEntry,
  RuleInput,
  UploadedFile,
} from '../server/src/types';

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
  resetSequence();
});

// Rule names are unique, so unnamed test rules get an auto-generated one;
// callers can still pass an explicit `name` to override it.
let ruleSeq = 0;

async function createRule(patch: RuleInput = {}): Promise<MockRule> {
  const response = await fetch(`${base}/__api/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(createDefaultRule({ name: `test-rule-${++ruleSeq}`, ...patch })),
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

  it('rejects creating a rule whose name is already taken', async () => {
    await createRule({ name: 'Duplicate me' });
    const response = await fetch(`${base}/__api/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createDefaultRule({ name: 'Duplicate me' })),
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('Duplicate me'),
    });
  });

  it('trims names and treats visual duplicates (surrounding spaces) as collisions', async () => {
    await createRule({ name: 'Padded' });
    const clash = await fetch(`${base}/__api/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createDefaultRule({ name: '  Padded  ' })),
    });
    expect(clash.status).toBe(409);

    // An accepted rule stores the trimmed name, so later edits compare cleanly.
    const created = await createRule({ name: '  Spaced  ' });
    expect(created.name).toBe('Spaced');
  });

  it('rejects renaming onto an existing name while keeping the rule’s own name valid', async () => {
    const first = await createRule({ name: 'First' });
    await createRule({ name: 'Second' });

    const clash = await fetch(`${base}/__api/rules/${first.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Second' }),
    });
    expect(clash.status).toBe(409);

    // Re-saving with the rule’s own (unchanged) name must stay valid.
    const keep = await fetch(`${base}/__api/rules/${first.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'First', description: 'touched' }),
    });
    expect(keep.status).toBe(200);
  });

  it('allows blank names and auto-uniquifies repeated duplicates', async () => {
    const unnamedA = await createRule({ name: '   ' });
    expect(unnamedA.name).toBe('');
    const unnamedB = await createRule({ name: '' });
    expect(unnamedB.name).toBe('');

    const source = await createRule({ name: 'Source' });
    const firstCopy = await fetch(`${base}/__api/rules/${source.id}/duplicate`, {
      method: 'POST',
    });
    expect((await firstCopy.json()) as { rule: MockRule }).toMatchObject({
      rule: { name: 'Source copy' },
    });
    const secondCopy = await fetch(`${base}/__api/rules/${source.id}/duplicate`, {
      method: 'POST',
    });
    expect((await secondCopy.json()) as { rule: MockRule }).toMatchObject({
      rule: { name: 'Source copy 2' },
    });
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

  it('persists per-slot switches from a full console update', async () => {
    const rule = await createRule({
      path: '/api/save-switch',
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({ statusCode: 500, body: '{"slot":2}' }),
      ],
    });
    const response = await fetch(`${base}/__api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...rule,
        responses: rule.responses.map((item, index) => ({ ...item, enabled: index === 0 })),
      }),
    });
    const { rule: saved } = (await response.json()) as { rule: MockRule };
    expect(saved.responses.map((item) => item.enabled)).toEqual([true, false]);

    const first = await fetch(`${base}/mock/api/save-switch`);
    const second = await fetch(`${base}/mock/api/save-switch`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ slot: 1 });
  });

  it('previews any chosen response slot, including a disabled one', async () => {
    const rule = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}', statusCode: 200 }),
        createResponseEntry({
          body: '<h1>down</h1>',
          statusCode: 503,
          responseType: 'html',
          enabled: false,
          headers: [{ key: 'X-Slot', value: '2' }],
        }),
      ],
    });
    const previewFor = async (responseIndex: number) => {
      const response = await fetch(`${base}/__api/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rule, request: { responseIndex } }),
      });
      return ((await response.json()) as { preview: PreviewResult }).preview;
    };

    const first = await previewFor(0);
    expect(first.status).toBe(200);
    expect(JSON.parse(first.body)).toEqual({ slot: 1 });

    const second = await previewFor(1);
    expect(second.status).toBe(503);
    expect(second.body).toBe('<h1>down</h1>');
    expect(second.headers['x-slot']).toBe('2');
  });

  it('maps the v2 variantIndex alias and clamps fractional indexes', async () => {
    const rule = createDefaultRule({
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({ body: '{"slot":2}' }),
      ],
    });
    const previewFor = async (request: Record<string, unknown>) => {
      const response = await fetch(`${base}/__api/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rule, request }),
      });
      return ((await response.json()) as { preview: PreviewResult }).preview;
    };

    expect(JSON.parse((await previewFor({ variantIndex: 0 })).body)).toEqual({ slot: 2 });
    expect(JSON.parse((await previewFor({ variantIndex: -1 })).body)).toEqual({ slot: 1 });
    expect(JSON.parse((await previewFor({ responseIndex: 1.5 })).body)).toEqual({ slot: 2 });
  });

  it('ignores client-supplied id and timestamps on PUT', async () => {
    const rule = await createRule({ path: '/api/immutable' });
    const response = await fetch(`${base}/__api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...rule, id: 'hacked', createdAt: 0, updatedAt: 0 }),
    });
    const { rule: saved } = (await response.json()) as { rule: MockRule };
    expect(saved.id).toBe(rule.id);
    expect(saved.createdAt).toBe(rule.createdAt);

    const stored = (await (await fetch(`${base}/__api/rules/${rule.id}`)).json()) as {
      rule: MockRule;
    };
    expect(stored.rule.createdAt).toBe(rule.createdAt);
  });

  it('exports and re-imports the whole configuration', async () => {
    await createRule({ name: 'Export me', path: '/api/export' });
    const exported = (await (await fetch(`${base}/__api/export`)).json()) as {
      version: number;
      rules: MockRule[];
      settings: Record<string, string>;
    };
    expect(exported.version).toBe(3);
    expect(exported.rules).toHaveLength(1);
    expect(exported.rules[0]?.updatedAt).toBeGreaterThan(0);

    await clearRules();
    const importResponse = await fetch(`${base}/__api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'replace', rules: exported.rules, settings: exported.settings }),
    });
    expect(await importResponse.json()).toMatchObject({ imported: 1, updated: 0, total: 1 });
    const imported = (await (
      await fetch(`${base}/__api/rules/${exported.rules[0]!.id}`)
    ).json()) as { rule: MockRule };
    expect(imported.rule.updatedAt).toBe(exported.rules[0]?.updatedAt);
    expect(imported.rule.responses.map((item) => item.enabled)).toEqual(
      exported.rules[0]?.responses.map((item) => item.enabled),
    );
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

  it('imports a v2 backup with flat fields and partial variants', async () => {
    const legacy = {
      id: 'legacy-rule',
      name: 'partial variant',
      method: 'GET',
      path: '/api/partial',
      enabled: true,
      description: '',
      group: '',
      statusCode: 200,
      headers: [],
      contentType: '',
      responseType: 'json',
      body: '{"base":true}',
      fileId: '',
      schema: [],
      schemaRoot: 'object',
      schemaRootMin: 2,
      schemaRootMax: 5,
      delayMs: 0,
      delayJitterMs: 0,
      envelope: 'none',
      conditionsEnabled: true,
      conditions: [],
      variantsEnabled: true,
      variants: [{ id: 'v1' }],
      abort: 'none',
      createdAt: 1,
      updatedAt: 1,
    };
    const response = await fetch(`${base}/__api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'replace', rules: [legacy] }),
    });
    expect(response.ok).toBe(true);

    const { rule } = (await (await fetch(`${base}/__api/rules/legacy-rule`)).json()) as {
      rule: MockRule;
    };
    expect(rule.responses).toHaveLength(2);
    expect(rule.responses[0]?.body).toBe('{"base":true}');
    expect(rule.responses[1]).toMatchObject({ id: 'v1', statusCode: 200, body: '{"base":true}' });

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

  it('cycles through full response slots', async () => {
    await createRule({
      path: '/api/flaky',
      responses: [
        createResponseEntry({ statusCode: 200, body: '{"try":"first"}' }),
        createResponseEntry({ statusCode: 500, body: '{"try":"second"}' }),
      ],
    });

    const first = await fetch(`${base}/mock/api/flaky`);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ try: 'first' });

    const second = await fetch(`${base}/mock/api/flaky`);
    expect(second.status).toBe(500);
    await expect(second.json()).resolves.toEqual({ try: 'second' });

    const third = await fetch(`${base}/mock/api/flaky`);
    expect(third.status).toBe(200);
    await expect(third.json()).resolves.toEqual({ try: 'first' });
  });

  it('skips disabled response slots while cycling', async () => {
    await createRule({
      path: '/api/skipped',
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({ body: '{"slot":2}', enabled: false }),
        createResponseEntry({ body: '{"slot":3}', statusCode: 503 }),
      ],
    });

    const first = await fetch(`${base}/mock/api/skipped`);
    await expect(first.json()).resolves.toEqual({ slot: 1 });
    const second = await fetch(`${base}/mock/api/skipped`);
    expect(second.status).toBe(503);
    await expect(second.json()).resolves.toEqual({ slot: 3 });
    const third = await fetch(`${base}/mock/api/skipped`);
    await expect(third.json()).resolves.toEqual({ slot: 1 });

    const { logs } = (await (await fetch(`${base}/__api/logs`)).json()) as {
      logs: RequestLogEntry[];
    };
    // The log keeps the real slot number, so disabled slots are still visible.
    expect(logs.some((entry) => entry.ruleName.includes('#3'))).toBe(true);
    expect(logs.some((entry) => entry.ruleName.includes('#2'))).toBe(false);
  });

  it('returns the only enabled slot without cycling', async () => {
    await createRule({
      path: '/api/first-enabled',
      responses: [
        createResponseEntry({ body: '{"slot":1}', enabled: false }),
        createResponseEntry({ body: '{"slot":2}' }),
      ],
    });

    const first = await fetch(`${base}/mock/api/first-enabled`);
    await expect(first.json()).resolves.toEqual({ slot: 2 });
    const second = await fetch(`${base}/mock/api/first-enabled`);
    await expect(second.json()).resolves.toEqual({ slot: 2 });
  });

  it('still answers with slot 0 when every slot is disabled', async () => {
    await createRule({
      path: '/api/all-off',
      responses: [
        createResponseEntry({ body: '{"slot":1}', enabled: false }),
        createResponseEntry({ body: '{"slot":2}', enabled: false }),
      ],
    });

    const hit = await fetch(`${base}/mock/api/all-off`);
    expect(hit.status).toBe(200);
    await expect(hit.json()).resolves.toEqual({ slot: 1 });
  });

  it('persists per-slot switches and previews a disabled slot', async () => {
    const rule = await createRule({
      path: '/api/preview-off',
      responses: [
        createResponseEntry({ body: '{"slot":1}' }),
        createResponseEntry({ body: '{"slot":2}' }),
      ],
    });
    const update = await fetch(`${base}/__api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...rule,
        responses: rule.responses.map((item, index) => ({ ...item, enabled: index === 0 })),
      }),
    });
    const { rule: saved } = (await update.json()) as { rule: MockRule };
    expect(saved.responses.map((item) => item.enabled)).toEqual([true, false]);

    // A disabled slot can still be inspected without being served.
    const response = await fetch(`${base}/__api/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rule: saved, request: { responseIndex: 1 } }),
    });
    const { preview } = (await response.json()) as { preview: PreviewResult };
    expect(JSON.parse(preview.body)).toEqual({ slot: 2 });

    const hit = await fetch(`${base}/mock/api/preview-off`);
    await expect(hit.json()).resolves.toEqual({ slot: 1 });
  });

  it('serves the plain response config when the condition switch is off', async () => {
    await createRule({
      path: '/api/conditions-off',
      body: '{"variant":"base"}',
      conditionsEnabled: false,
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });

    // The parked condition no longer gates anything, so even the request it was
    // written for still gets the response config above the advanced panel.
    const plain = await fetch(`${base}/mock/api/conditions-off`);
    expect(plain.status).toBe(200);
    await expect(plain.json()).resolves.toEqual({ variant: 'base' });

    const matching = await fetch(`${base}/mock/api/conditions-off?type=vip`);
    expect(matching.status).toBe(200);
    await expect(matching.json()).resolves.toEqual({ variant: 'base' });
  });

  it('serves only the enabled slot without cycling', async () => {
    await createRule({
      path: '/api/variants-off',
      responses: [
        createResponseEntry({ body: '{"variant":"base"}' }),
        createResponseEntry({ statusCode: 500, body: '{"variant":"seq"}', enabled: false }),
      ],
    });

    // Conditions stay untouched; the disabled extra slot is simply skipped.
    const first = await fetch(`${base}/mock/api/variants-off`);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ variant: 'base' });

    const second = await fetch(`${base}/mock/api/variants-off`);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ variant: 'base' });
  });

  it('keeps condition priority while an extra slot is disabled', async () => {
    await createRule({
      path: '/api/mixed',
      responses: [createResponseEntry({ body: '{"variant":"plain"}' })],
    });
    await createRule({
      path: '/api/mixed',
      responses: [
        createResponseEntry({ body: '{"variant":"vip"}' }),
        createResponseEntry({ statusCode: 500, body: '{"variant":"seq"}', enabled: false }),
      ],
      conditions: [{ id: 'c1', source: 'query', key: 'type', op: 'eq', value: 'vip' }],
    });

    const vip = await fetch(`${base}/mock/api/mixed?type=vip`);
    expect(vip.status).toBe(200);
    await expect(vip.json()).resolves.toEqual({ variant: 'vip' });

    const plain = await fetch(`${base}/mock/api/mixed`);
    await expect(plain.json()).resolves.toEqual({ variant: 'plain' });
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

describe('settings and responses', () => {
  it('stores settings and resets sequence counters', async () => {
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

    const reset = await fetch(`${base}/__api/responses/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ruleId: 'rule-1' }),
    });
    expect(await reset.json()).toEqual({ ok: true });

    // The v2 endpoint remains available for older clients.
    const legacyReset = await fetch(`${base}/__api/variants/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ruleId: 'rule-1' }),
    });
    expect(await legacyReset.json()).toEqual({ ok: true });
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
