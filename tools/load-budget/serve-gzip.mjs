#!/usr/bin/env node
// L3-004 — tools/serve-out routing (CloudFront-like, spec §5) + CloudFront-like compression, for the load
// budget trace. §8 budgets are "compressed bytes actually transferred"; tools/serve-out sends files raw.
// Compression rule modelled on CloudFront "Compress objects automatically": gzip only when the viewer sends
// `Accept-Encoding: gzip`, the content type is compressible, and the file is 1,000 B – 10,000,000 B.
// gzip (not brotli) is used on purpose: §8 states the JS budget in gzip, and gzip ≥ brotli in size, so the
// measurement is conservative. Node built-ins only; for local/CI measurement, not for production.
// Usage: node tools/load-budget/serve-gzip.mjs [root=out] [--port 4174] [--host 127.0.0.1]

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { resolveRequest } from "../serve-out/index.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".ktx2": "image/ktx2",
  ".webmanifest": "application/manifest+json",
};

/** Content types CloudFront compresses (subset relevant to out/). Binary formats are already compressed. */
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript|manifest\+json|wasm)|image\/svg\+xml|model\/gltf\+json)/;
export const MIN_COMPRESS = 1_000;
export const MAX_COMPRESS = 10_000_000;

export function shouldCompress(contentType, size, acceptEncoding = "") {
  return /\bgzip\b/i.test(acceptEncoding) && COMPRESSIBLE.test(contentType) && size >= MIN_COMPRESS && size <= MAX_COMPRESS;
}

export function createGzipServer(root) {
  const cache = new Map();
  return createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    const decision = await resolveRequest(root, req.url ?? "/");
    if (decision.status === 301) {
      res.writeHead(301, { location: decision.location, "content-length": "0" }).end();
      return;
    }
    if (!decision.file) {
      res.writeHead(decision.status).end();
      return;
    }
    let body;
    try {
      if ((await stat(decision.file)).isFile()) body = await readFile(decision.file);
    } catch {
      body = undefined;
    }
    if (!body) {
      res.writeHead(decision.status, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const type = TYPES[path.extname(decision.file).toLowerCase()] ?? "application/octet-stream";
    const headers = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", vary: "Accept-Encoding" };
    if (shouldCompress(type, body.length, String(req.headers["accept-encoding"] ?? ""))) {
      let gz = cache.get(decision.file);
      if (!gz) cache.set(decision.file, (gz = gzipSync(body)));
      body = gz;
      headers["content-encoding"] = "gzip";
    }
    headers["content-length"] = String(body.length);
    res.writeHead(decision.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  });
}

function parseArgs(argv) {
  const options = { root: "out", port: 4174, host: "127.0.0.1" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--host") options.host = String(argv[++i]);
    else options.root = arg;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, port, host } = parseArgs(process.argv.slice(2));
  const absolute = path.resolve(root);
  try {
    await stat(path.join(absolute, "404.html"));
  } catch {
    console.error(`serve-gzip: ${absolute}/404.html not found — run \`pnpm build\` first.`);
    process.exit(1);
  }
  createGzipServer(absolute).listen(port, host, () => {
    console.log(`serve-gzip: http://${host}:${port}/ ← ${absolute} (gzip like CloudFront)`);
  });
}
