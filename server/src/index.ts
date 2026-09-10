import { createApp } from './app';
import { db, initDb } from './db';
import { migrate } from './db/migrate';
import { hydrateLogs } from './services/logStore';
import { countRules, insertRule } from './db/ruleRepo';
import { createDefaultRule } from './defaults';
import {
  DATA_DIR,
  HOST,
  MOCK_PREFIX,
  PORT,
  ensureDirs,
  isLoopbackHost,
  machineUrls,
} from './config';
import { logger } from './logger';

function seedExamples(): void {
  if (countRules() > 0) return;

  const now = Date.now();
  insertRule(
    createDefaultRule({
      name: 'User detail',
      method: 'GET',
      path: '/api/users/:id',
      description: 'Static JSON response with a 300ms + 0~200ms jitter delay',
      delayMs: 300,
      delayJitterMs: 200,
      responseType: 'json',
      body: JSON.stringify(
        {
          code: 0,
          data: {
            id: 1001,
            nickname: 'Ada Lovelace',
            email: 'ada@example.com',
            level: 'gold',
            createdAt: '2026-01-01T08:00:00.000Z',
          },
        },
        null,
        2,
      ),
      createdAt: now,
      updatedAt: now,
    }),
  );

  insertRule(
    createDefaultRule({
      name: 'Search products (dynamic)',
      method: 'POST',
      path: '/api/products/search',
      description: 'JavaScript response generated per request with faker + RandExp',
      responseType: 'javascript',
      body: `// req, console, faker, RandExp, uuid() are available
const keyword = req.body?.keyword ?? '';
const size = req.body?.size ?? 3;

return {
  code: 0,
  keyword,
  total: size,
  items: Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    title: faker.commerce.productName(),
    price: Number(faker.commerce.price({ min: 10, max: 999 })),
    sku: new RandExp(/^SKU-[A-Z]{3}-\\d{6}$/).gen(),
    inStock: faker.datatype.boolean(),
  })),
};`,
      createdAt: now,
      updatedAt: now,
    }),
  );

  insertRule(
    createDefaultRule({
      name: 'Order list (structured)',
      method: 'GET',
      path: '/api/orders',
      description: 'Generated from the visual JSON structure editor',
      responseType: 'schema',
      createdAt: now,
      updatedAt: now,
    }),
  );

  logger.info('Seeded 3 example rules');
}

async function main(): Promise<void> {
  ensureDirs();
  await initDb();
  migrate();
  hydrateLogs();
  seedExamples();

  const app = createApp();
  const server = app.listen(PORT, HOST, () => {
    logger.info(`Mocker listening on ${machineUrls().join(', ')}`);
    logger.info(`Mock entry prefix: ${MOCK_PREFIX || '/'}`);
    logger.info(`Data directory: ${DATA_DIR}`);
    if (!isLoopbackHost()) {
      logger.warn(
        `Bound to ${HOST}: the admin API can execute arbitrary JavaScript — only expose Mocker on a trusted network.`,
      );
    }
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down…`);
    server.close(() => {
      db().close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Failed to start Mocker', error);
  process.exit(1);
});
