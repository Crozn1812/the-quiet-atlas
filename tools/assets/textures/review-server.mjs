import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({ configFile: false, resolve: { alias: { '@': resolve('src') } },
  optimizeDeps: { entries: ['tools/assets/textures/review.html'] },
  server: { host: '127.0.0.1', port: 4188, strictPort: true } });
await server.listen(); server.printUrls();
