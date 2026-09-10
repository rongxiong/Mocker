import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { matchAll } from '../services/matcher';
import { buildResponse, sleep } from '../services/responder';
import { matchesConditions } from '../services/conditions';
import { applyVariant, nextVariantIndex } from '../services/variants';
import { recordLog } from '../services/logStore';
import { getSetting } from '../db/settingsRepo';
import { MOCK_PREFIX } from '../config';
import { logger } from '../logger';
import type { MockRequestSnapshot } from '../types';

export const mockRouter = Router();

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding (e.g. a bare `%`) must not fail the request.
    return value;
  }
}

function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeCookieValue(value);
  }
  return cookies;
}

function snapshot(req: Request, params: Record<string, string>): MockRequestSnapshot {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  return {
    method: req.method,
    path: req.path,
    params,
    query: req.query as Record<string, string | string[]>,
    headers,
    cookies: parseCookies(req.headers.cookie),
    body: req.body,
  };
}

function bodyToString(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return `[buffer ${body.length} bytes]`;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

/**
 * Express body parsers hand us an object for JSON / urlencoded payloads, which
 * `fetch` would stringify to `[object Object]`. Re-encode it to the wire format
 * the upstream expects; raw and text bodies are already in their final shape.
 */
function proxyBody(req: Request): string | Buffer | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const body = req.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      params.append(
        key,
        typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
      );
    }
    return params.toString();
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

async function proxyToTarget(req: Request, res: Response, target: string): Promise<void> {
  const suffix =
    MOCK_PREFIX && req.originalUrl.startsWith(MOCK_PREFIX)
      ? req.originalUrl.slice(MOCK_PREFIX.length)
      : req.originalUrl;
  const url = new URL(suffix || '/', target);
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => !HOP_BY_HOP.has(key.toLowerCase())),
      ) as Record<string, string>,
      body: proxyBody(req),
      redirect: 'manual',
    });
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) res.setHeader(key, value);
    });
    res.status(upstream.status);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Proxy to ${target} failed: ${message}`);
    res.status(502).json({ error: 'Proxy target unreachable', target, message });
  }
}

/**
 * True for plain browser navigations, i.e. requests that expect an HTML page
 * rather than an API payload. Only relevant when the mock prefix is empty and
 * mocks therefore share their origin with the console.
 */
function isBrowserNavigation(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const accept = req.headers.accept ?? '';
  return accept.includes('text/html') && !accept.includes('application/json');
}

// Express 5 (path-to-regexp 8) rejects the legacy `'*'` route, so the catch-all
// is registered as plain middleware instead.
mockRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  const pathname = req.path;
  const startedAt = Date.now();
  const candidates = matchAll(req.method, pathname);
  // Rules with conditions are more specific, so they win over catch-all rules
  // regardless of creation order.
  const match =
    candidates.find(
      (item) =>
        (item.rule.conditions?.length ?? 0) > 0 &&
        matchesConditions(item.rule.conditions, snapshot(req, item.params)),
    ) ?? candidates.find((item) => (item.rule.conditions?.length ?? 0) === 0);

  if (!match) {
    // With an empty prefix the console lives on the same origin as the mocks, so
    // browser navigations fall through to it instead of getting the mock 404.
    if (!MOCK_PREFIX && isBrowserNavigation(req)) {
      next();
      return;
    }

    const proxyTarget = getSetting('proxyTarget').trim();
    if (proxyTarget) {
      logger.info(`Proxying ${req.method} ${pathname} -> ${proxyTarget}`);
      recordLog({
        method: req.method,
        path: pathname,
        ruleId: '',
        ruleName: `proxy → ${proxyTarget}`,
        status: 0,
        durationMs: Date.now() - startedAt,
        matched: false,
        requestBody: bodyToString(req.body),
      });
      await proxyToTarget(req, res, proxyTarget);
      return;
    }

    recordLog({
      method: req.method,
      path: pathname,
      ruleId: '',
      ruleName: '',
      status: 404,
      durationMs: Date.now() - startedAt,
      matched: false,
      requestBody: bodyToString(req.body),
    });
    logger.warn(`No mock rule for ${req.method} ${pathname}`);
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.sendStatus(204);
      return;
    }
    res.status(404).json({
      error: 'No matching mock rule',
      method: req.method,
      path: pathname,
      hint: 'Create or enable a rule in the Mocker console, or set a proxy target in Settings.',
    });
    return;
  }

  const reqSnapshot = snapshot(req, match.params);

  if (match.rule.abort === 'hang') {
    logger.info(`Hanging ${req.method} ${pathname} as configured`);
    recordLog({
      method: req.method,
      path: pathname,
      ruleId: match.rule.id,
      ruleName: match.rule.name,
      status: 0,
      durationMs: Date.now() - startedAt,
      matched: true,
      requestBody: bodyToString(reqSnapshot.body),
      responseBody: '(connection hung)',
    });
    return;
  }

  if (match.rule.abort === 'close') {
    await sleep(match.rule.delayMs);
    logger.info(`Resetting connection for ${req.method} ${pathname}`);
    recordLog({
      method: req.method,
      path: pathname,
      ruleId: match.rule.id,
      ruleName: match.rule.name,
      status: 0,
      durationMs: Date.now() - startedAt,
      matched: true,
      requestBody: bodyToString(reqSnapshot.body),
      responseBody: '(connection reset)',
    });
    req.socket.destroy();
    return;
  }

  const variantIndex = nextVariantIndex(match.rule.id, match.rule.variants?.length ?? 0);
  const rule = variantIndex >= 0 ? applyVariant(match.rule, variantIndex) : match.rule;

  try {
    const result = await buildResponse({ rule, req: reqSnapshot });
    res.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    recordLog({
      method: req.method,
      path: pathname,
      ruleId: match.rule.id,
      ruleName: variantIndex >= 0 ? `${match.rule.name} #${variantIndex + 1}` : match.rule.name,
      status: result.status,
      durationMs: result.durationMs,
      matched: true,
      requestBody: bodyToString(reqSnapshot.body),
      responseBody: Buffer.isBuffer(result.body)
        ? `[binary ${result.body.length} bytes]`
        : String(result.body),
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    if (Buffer.isBuffer(result.body)) {
      res.end(result.body);
      return;
    }
    res.send(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to build response for ${req.method} ${pathname}: ${message}`);
    recordLog({
      method: req.method,
      path: pathname,
      ruleId: match.rule.id,
      ruleName: match.rule.name,
      status: 500,
      durationMs: Date.now() - startedAt,
      matched: true,
      requestBody: bodyToString(reqSnapshot.body),
    });
    res.status(500).json({
      error: 'Failed to generate mock response',
      rule: match.rule.name,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});
