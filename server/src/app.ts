import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import { ADMIN_PREFIX, MOCK_PREFIX, WEB_DIST_DIR } from './config';
import { adminRouter } from './routes/admin';
import { filesRouter } from './routes/files';
import { mockRouter } from './routes/mock';
import { logger } from './logger';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(express.text({ type: ['text/*', 'application/xml', 'application/*+xml'], limit: '5mb' }));
  // Fallback parser for unknown content types; multipart is left to multer.
  app.use(
    express.raw({
      type: (req) => !/^multipart\//i.test(req.headers['content-type'] ?? ''),
      limit: '5mb',
    }),
  );

  // Admin API first so it keeps priority when the mock prefix is empty.
  app.use(ADMIN_PREFIX, adminRouter);
  app.use(`${ADMIN_PREFIX}/files`, filesRouter);

  // With an empty mock prefix the console and the mocks share one origin, so the
  // built assets must be resolved before the catch-all mock router sees them.
  const hasConsole = fs.existsSync(WEB_DIST_DIR);
  if (hasConsole) {
    app.use(express.static(WEB_DIST_DIR, { index: false }));
  }

  const mockMount = MOCK_PREFIX || '/';
  app.use(
    mockMount,
    cors({ origin: true, credentials: true, preflightContinue: true }),
    mockRouter,
  );

  if (hasConsole) {
    // A RegExp instead of `'*'`: path-to-regexp 8 (Express 5) rejects bare `*`.
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith(ADMIN_PREFIX)) {
        next();
        return;
      }
      if (MOCK_PREFIX && req.path.startsWith(MOCK_PREFIX)) {
        next();
        return;
      }
      res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
    });
    logger.info(`Serving console from ${WEB_DIST_DIR}`);
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('html')
        .send(
          '<pre style="font:14px/1.6 ui-monospace;padding:24px;color:#e6e9f2;background:#0b0d12">' +
            'Mocker server is running.\n\n' +
            'The web console has not been built yet.\n' +
            'Run `npm run dev` for development, or `npm run build && npm start` to serve the console.\n' +
            `Admin API: ${ADMIN_PREFIX}/rules\n` +
            `Mock entry: ${MOCK_PREFIX || '/'}\n</pre>`,
        );
    });
  }

  return app;
}
