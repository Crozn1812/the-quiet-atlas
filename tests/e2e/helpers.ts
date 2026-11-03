import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";

export const WORLD_MARKER = "__TQA_WORLD_CHUNK__";
/** File types that belong to the 3D world (spec §5, Q18): none may be requested before Enter World. */
export const FORBIDDEN_3D = /\.(glb|gltf|wasm|ktx2|basis)(\?|#|$)/i;
export const OUT_DIR = path.resolve(process.cwd(), "out");

// Expected public copy. Mirrors src/content/index.ts (profiles) and src/i18n/messages.ts (world copy):
// the content module can't be imported here (Node ESM requires `with { type: "json" }` for evidence.json).
export const LOCALES = [
  { locale: "en", name: "Nguyen Huu Bao Duy", role: "Cloud & DevOps Engineer", editorial: "View Editorial", leave: "Back to Welcome" },
  { locale: "vi", name: "Nguyễn Hữu Bảo Duy", role: "Cloud & DevOps Engineer", editorial: "Xem bản Editorial", leave: "Về Welcome" },
] as const;

/** Records every request URL and every JS response body seen by a page. */
export function trackNetwork(page: Page) {
  const requests: string[] = [];
  const pending: Promise<void>[] = [];
  const scripts: { url: string; body: string }[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("response", (response: Response) => {
    if (!isScript(response)) return;
    pending.push(
      response
        .text()
        .then(body => void scripts.push({ url: response.url(), body }))
        .catch(() => undefined),
    );
  });
  return {
    requests,
    forbidden3d: () => requests.filter(url => FORBIDDEN_3D.test(url)),
    async worldChunks() {
      await Promise.all(pending);
      return scripts.filter(script => script.body.includes(WORLD_MARKER)).map(script => script.url);
    },
    async scriptCount() {
      await Promise.all(pending);
      return scripts.length;
    },
  };
}

function isScript(response: Response) {
  const type = response.headers()["content-type"] ?? "";
  return /javascript/.test(type) || /\.m?js(\?|$)/.test(new URL(response.url()).pathname);
}

/**
 * Known product issues outside L3's write scope, reported to the Lead (ticket L3-003 handoff).
 * They are surfaced as test annotations, never silently dropped. Remove an entry once fixed —
 * tests fail when a listed issue no longer reproduces so this list cannot go stale.
 */
export const KNOWN_ISSUES = {
  /** axe rule ids (critical/serious) currently failing on HTML pages (axe-core 4.x via @axe-core/playwright 4.14.0). */
  axeRules: {} as Record<string, string>,
};

/** Collects console errors and uncaught page errors (T01: 0 console errors). */
export function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", message => {
    const url = message.location().url;
    if (message.type() !== "error") return;
    errors.push(`console.error: ${message.text()} (${url || "no url"})`);
  });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  // Name the URL behind "Failed to load resource" console errors.
  page.on("response", response => {
    if (response.status() >= 400) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return errors;
}

/** Removes WebGL from the page before any script runs (T02-d / Q15). */
export const DISABLE_WEBGL = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (/webgl/i.test(type)) return null;
    return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
};

/**
 * HTML pages to audit: the fixed routes plus optional pages (case studies, privacy) that other
 * lanes add — included only when they exist in `out/`.
 */
export function htmlPagesToAudit() {
  const pages = ["/", "/en/", "/vi/", "/en/quick/", "/vi/quick/"];
  for (const locale of ["en", "vi"]) {
    if (existsSync(path.join(OUT_DIR, locale, "privacy", "index.html"))) pages.push(`/${locale}/privacy/`);
    const projects = path.join(OUT_DIR, locale, "projects");
    if (!existsSync(projects)) continue;
    for (const entry of readdirSync(projects, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(projects, entry.name, "index.html"))) {
        pages.push(`/${locale}/projects/${entry.name}/`);
      }
    }
  }
  return pages;
}

/**
 * Waits for `load`, then until no new request has started for `quietMs` (max `maxMs`).
 * Used instead of `networkidle`: Next's <Link> prefetch can leave unread 404 responses open,
 * so `networkidle` never fires on pages with links (/, 404.html).
 */
export async function settle(page: Page, quietMs = 750, maxMs = 8_000) {
  await page.waitForLoadState("load");
  let last = Date.now();
  const bump = () => void (last = Date.now());
  page.on("request", bump);
  const start = Date.now();
  try {
    while (Date.now() - last < quietMs && Date.now() - start < maxMs) await page.waitForTimeout(100);
  } finally {
    page.off("request", bump);
  }
}

export async function hasWebGL2(page: Page) {
  return page.evaluate(() => {
    try {
      return document.createElement("canvas").getContext("webgl2") !== null;
    } catch {
      return false;
    }
  });
}
