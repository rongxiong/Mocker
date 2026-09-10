import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

/**
 * Every test file gets its own data directory so suites can run in parallel
 * without ever touching the developer's `data/` folder.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocker-test-'));

process.env.DATA_DIR = dataDir;
process.env.MOCK_PREFIX = '/mock';
// Keeps the test output readable: the mock router logs every miss.
process.env.LOG_LEVEL = 'silent';

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
