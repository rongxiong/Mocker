import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  countRules,
  deleteAllRules,
  deleteRule,
  findConflicts,
  getRule,
  insertMany,
  insertRule,
  listRules,
  normalizeRule,
  updateRule,
} from '../db/ruleRepo';
import { getFile, insertFile, listFiles } from '../db/fileRepo';
import { allSettings, getSetting, setSetting, SETTING_KEYS } from '../db/settingsRepo';
import { buildResponse, isTextResponse } from '../services/responder';
import { applyVariant, resetVariants } from '../services/variants';
import { recentLogs, clearLogs } from '../services/logStore';
import { IMPORTABLE_MODULES } from '../services/jsRunner';
import { driver, transaction } from '../db';
import { logger } from '../logger';
import {
  ADMIN_PREFIX,
  DB_FILE,
  MOCK_PREFIX,
  MAX_DELAY_MS,
  PORT,
  HOST,
  SCRIPT_TIMEOUT_MS,
  UPLOAD_DIR,
  isLoopbackHost,
  machineUrls,
} from '../config';
import { HTTP_METHODS } from '../types';
import type { MockRule, PreviewResult, UploadedFile } from '../types';
import { uid } from '../defaults';

export const adminRouter = Router();

adminRouter.get('/rules', (_req: Request, res: Response) => {
  const rules = listRules();
  res.json({ rules, conflicts: findConflicts(rules) });
});

adminRouter.get('/settings', (_req: Request, res: Response) => {
  res.json({ settings: allSettings() });
});

adminRouter.put('/settings', (req: Request, res: Response) => {
  const payload = (req.body ?? {}) as Record<string, string>;
  for (const key of SETTING_KEYS) {
    if (typeof payload[key] === 'string') setSetting(key, payload[key]!);
  }
  res.json({ settings: allSettings() });
});

adminRouter.post('/variants/reset', (req: Request, res: Response) => {
  resetVariants(typeof req.body?.ruleId === 'string' ? req.body.ruleId : undefined);
  res.json({ ok: true });
});

adminRouter.get('/rules/:id', (req: Request, res: Response) => {
  const rule = getRule(req.params.id);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ rule });
});

adminRouter.post('/rules', (req: Request, res: Response) => {
  const rule = normalizeRule(req.body ?? {});
  insertRule(rule);
  res.status(201).json({ rule });
});

adminRouter.put('/rules/:id', (req: Request, res: Response) => {
  const updated = updateRule(req.params.id, req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ rule: updated });
});

adminRouter.delete('/rules/:id', (req: Request, res: Response) => {
  const ok = deleteRule(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json({ ok: true });
});

adminRouter.post('/rules/:id/duplicate', (req: Request, res: Response) => {
  const source = getRule(req.params.id);
  if (!source) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  const now = Date.now();
  const copy: MockRule = {
    ...source,
    id: uid(),
    name: `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  insertRule(copy);
  res.status(201).json({ rule: copy });
});

function sampleParams(path: string): Record<string, string> {
  const params: Record<string, string> = {};
  const matches = path.matchAll(/:([A-Za-z0-9_]+)/g);
  for (const match of matches) {
    params[match[1]!] = '1';
  }
  return params;
}

adminRouter.post('/preview', async (req: Request, res: Response) => {
  const rule = normalizeRule(req.body?.rule ?? {});
  const override = req.body?.request ?? {};

  const rawQuery = typeof override.rawQuery === 'string' ? override.rawQuery.trim() : '';
  const query: Record<string, string | string[]> = rawQuery
    ? Object.fromEntries(new URLSearchParams(rawQuery).entries())
    : ((override.query ?? {}) as Record<string, string | string[]>);

  // Express lower-cases incoming header names, mirror that for preview overrides.
  const overrideHeaders = Object.entries((override.headers ?? {}) as Record<string, string>).reduce<
    Record<string, string>
  >((acc, [key, value]) => {
    if (key.trim()) acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  const snapshot = {
    method: typeof override.method === 'string' ? override.method : rule.method,
    path: typeof override.path === 'string' ? override.path : rule.path,
    params:
      override.params && typeof override.params === 'object'
        ? (override.params as Record<string, string>)
        : sampleParams(rule.path),
    query,
    headers: { 'content-type': 'application/json', ...overrideHeaders },
    cookies: (override.cookies ?? {}) as Record<string, string>,
    body: override.body,
  };

  const variantIndex = Number(override.variantIndex ?? -1);
  const effectiveRule = variantIndex >= 0 ? applyVariant(rule, variantIndex) : rule;

  try {
    const output = await buildResponse({ rule: effectiveRule, req: snapshot, skipDelay: true });
    const isBinary = Buffer.isBuffer(output.body);
    const preview: PreviewResult = {
      status: output.status,
      headers: output.headers,
      contentType: output.contentType,
      body: isBinary
        ? Buffer.isBuffer(output.body)
          ? `[binary ${output.body.length} bytes]`
          : String(output.body)
        : String(output.body),
      isBinary: isBinary || !isTextResponse(output.contentType),
      durationMs: output.durationMs,
    };
    res.json({ preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(200).json({
      preview: {
        status: 500,
        headers: {},
        contentType: 'text/plain; charset=utf-8',
        body: '',
        isBinary: false,
        durationMs: 0,
        error: message,
      } satisfies PreviewResult,
    });
  }
});

adminRouter.get('/export', (req: Request, res: Response) => {
  // File contents are embedded as base64, which can blow the response up to
  // hundreds of MB in large libraries. `?files=0` exports rules + settings only.
  const includeFiles = req.query.files !== '0' && req.query.files !== 'false';
  res.json({
    version: 2,
    exportedAt: Date.now(),
    settings: allSettings(),
    rules: listRules(),
    files: !includeFiles
      ? []
      : listFiles().map((file) => {
          const filePath = path.join(UPLOAD_DIR, path.basename(file.storedName));
          const contentBase64 = fs.existsSync(filePath)
            ? fs.readFileSync(filePath).toString('base64')
            : '';
          return { ...file, contentBase64 };
        }),
  });
});

adminRouter.post('/import', (req: Request, res: Response) => {
  const payload = req.body ?? {};
  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  const normalized = rules.map((rule: Partial<MockRule>) => normalizeRule(rule));

  // `replace` wipes the table before writing: keep it atomic so a failure
  // half-way through does not lose the previous rule set.
  let inserted = 0;
  let updated = 0;
  try {
    const result = transaction(() => {
      if (payload.mode === 'replace') deleteAllRules();
      return insertMany(normalized);
    });
    inserted = result.inserted;
    updated = result.updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Import failed: ${message}`);
    res.status(500).json({ error: 'Import failed, nothing was changed', message });
    return;
  }

  let filesRestored = 0;
  const files = Array.isArray(payload.files) ? payload.files : [];
  for (const item of files) {
    const content = typeof item?.contentBase64 === 'string' ? item.contentBase64 : '';
    if (!item?.id || !content) continue;
    const record: UploadedFile = {
      id: String(item.id),
      name: String(item.name ?? item.id),
      size: Number(item.size ?? 0),
      mime: String(item.mime ?? 'application/octet-stream'),
      storedName: String(item.storedName ?? `${item.id}${path.extname(String(item.name ?? ''))}`),
      createdAt: Number(item.createdAt ?? Date.now()),
    };
    const target = path.join(UPLOAD_DIR, path.basename(record.storedName));
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(target, Buffer.from(content, 'base64'));
    if (!getFile(record.id)) insertFile(record);
    filesRestored += 1;
  }

  const settings = payload.settings;
  if (settings && typeof settings === 'object' && payload.mode === 'replace') {
    for (const key of SETTING_KEYS) {
      if (typeof (settings as Record<string, unknown>)[key] === 'string') {
        setSetting(key, String((settings as Record<string, unknown>)[key]));
      }
    }
  }

  res.json({ imported: inserted, updated, filesRestored, total: countRules() });
});

adminRouter.get('/logs', (_req: Request, res: Response) => {
  res.json({ logs: recentLogs() });
});

adminRouter.delete('/logs', (_req: Request, res: Response) => {
  clearLogs();
  res.json({ ok: true });
});

adminRouter.get('/info', (_req: Request, res: Response) => {
  res.json({
    port: PORT,
    host: HOST,
    loopbackOnly: isLoopbackHost(),
    mockPrefix: MOCK_PREFIX,
    adminPrefix: ADMIN_PREFIX,
    proxyTarget: getSetting('proxyTarget'),
    dbFile: DB_FILE,
    dbDriver: driver(),
    urls: machineUrls(),
    node: process.version,
    ruleCount: countRules(),
    fileCount: listFiles().length,
    maxDelayMs: MAX_DELAY_MS,
    scriptTimeoutMs: SCRIPT_TIMEOUT_MS,
    importableModules: IMPORTABLE_MODULES,
    methods: HTTP_METHODS,
  });
});
