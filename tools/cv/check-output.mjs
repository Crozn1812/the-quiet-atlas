import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const root = path.join(repoRoot, "out");
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filename = path.resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!filename.startsWith(root + path.sep)) throw new Error("Outside output");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".pdf": "application/pdf" };
    response.setHeader("Content-Type", types[path.extname(filename)] ?? "application/octet-stream");
    response.end(await fs.readFile(filename));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
  const context = await browser.newContext();
  await context.route("**/*", route => route.request().url().startsWith(base + "/") ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on("request", request => {
    if (request.url().endsWith("/cv/manifest.json")) throw new Error("UI must not fetch CV manifest");
  });
  for (const route of ["/en/", "/vi/", "/en/quick/", "/vi/quick/"]) {
    await page.goto(base + route);
    await page.locator('a[href="/cv/"]').first().waitFor();
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    const filename = path.join(root, new URL(image).pathname);
    const png = await fs.readFile(filename);
    if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) throw new Error("Wrong OG dimensions");
  }
  await page.goto(base + "/cv/");
  await page.locator("a[download]").first().waitFor();
  if (await page.locator("a[download]").count() !== 2) throw new Error("Missing downloads");
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(base + "/cv/");
  if (await fallback.locator("a[download]").count() !== 2) throw new Error("Missing no-JS downloads");
  console.log("Welcome/Quick CV links, CV bilingual downloads, no-JS fallback, OG dimensions: verified");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
