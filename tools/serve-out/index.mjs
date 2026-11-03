#!/usr/bin/env node
// L3-003 — static server for `out/` that mimics the production CloudFront + private S3 setup (spec §5):
//   - directory URI ending in "/" → "<dir>/index.html"
//   - URI without trailing slash and without a file extension → 301 to the same URI + "/" (query kept)
//   - URI with an extension is served as-is
//   - anything missing → "/404.html" with HTTP 404 (never the home page with 200)
// Node built-ins only; for local e2e tests, not for production.
// Usage: node tools/serve-out/index.mjs [root=out] [--port 4173] [--host 127.0.0.1]

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".webmanifest": "application/manifest+json",
};

/** Map a request URI to a decision, like the CloudFront viewer-request function + S3 origin. */
export async function resolveRequest(root, rawUrl) {
  const url = new URL(rawUrl, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes("\0")) return { status: 400 };
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (!pathname.endsWith("/") && !last.includes(".")) {
    return { status: 301, location: `${url.pathname}/${url.search}` };
  }
  const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = path.resolve(root, `.${relative}`);
  const base = path.resolve(root);
  if (file !== base && !file.startsWith(base + path.sep)) return notFound(root);
  try {
    const info = await stat(file);
    if (info.isFile()) return { status: 200, file };
  } catch {
    // fall through to 404
  }
  return notFound(root);
}

function notFound(root) {
  return { status: 404, file: path.resolve(root, "404.html") };
}

export function createOutServer(root) {
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
    let size;
    try {
      size = (await stat(decision.file)).size;
    } catch {
      res.writeHead(decision.status, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const type = TYPES[path.extname(decision.file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(decision.status, {
      "content-type": type,
      "content-length": String(size),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(decision.file).pipe(res);
  });
}

function parseArgs(argv) {
  const options = { root: "out", port: 4173, host: "127.0.0.1" };
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
    console.error(`serve-out: ${absolute}/404.html not found — run \`pnpm build\` first.`);
    process.exit(1);
  }
  createOutServer(absolute).listen(port, host, () => {
    console.log(`serve-out: http://${host}:${port}/ ← ${absolute}`);
  });
}
