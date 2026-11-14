// Serve the retained pre-change HTML/JS for the final A of an ABBA profile.
// All unchanged public assets fall through to the current export.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createOutServer } from '../../serve-out/index.mjs';
const baseline = path.resolve('tmp/hr-props/baseline'), fallback = createOutServer(path.resolve('out'));
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  let file = path.resolve(baseline, '.' + relative), found = false;
  if (file.startsWith(baseline + path.sep)) {
    if (file.endsWith('.js')) file += '.snapshot';
    try { found = (await stat(file)).isFile(); } catch { /* Unchanged assets use out. */ }
  }
  if (found) {
    res.writeHead(200, { 'content-type': pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : pathname.endsWith('.css') ? 'text/css; charset=utf-8' : pathname.endsWith('.wasm') ? 'application/wasm' : 'text/html; charset=utf-8' });
    createReadStream(file).pipe(res);
  } else fallback.emit('request', req, res);
}).listen(4202, '127.0.0.1', () => console.log('Retained baseline export: http://127.0.0.1:4202'));
