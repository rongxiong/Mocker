import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(dirname, 'web'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'web/src'),
      '@shared': path.resolve(dirname, 'server/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/__api': 'http://localhost:3001',
      '/mock': 'http://localhost:3001',
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist/web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
