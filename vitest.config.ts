import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(dirname, 'server/src'),
      '@': path.resolve(dirname, 'web/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Gives every test file an isolated DATA_DIR so suites never share a database.
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['server/src/**/*.ts'],
      exclude: ['server/src/index.ts'],
      // Guards the server core; the entry point and the web UI are not unit tested.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 85,
        branches: 55,
      },
    },
  },
});
