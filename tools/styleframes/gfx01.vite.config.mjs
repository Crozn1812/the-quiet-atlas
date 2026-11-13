import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import base from './vite.config.ts';

// Keep this spike's dependency cache separate from earlier styleframe sessions.
export default defineConfig({
  ...base,
  cacheDir: fileURLToPath(new URL('.verify-dist/gfx01-vite/', import.meta.url)),
  optimizeDeps: { entries: ['aaa.html'] },
});
