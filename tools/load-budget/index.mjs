// L3-004 — pure functions for the cold-cache load budget (spec §8, §13 Q18, T08 network part, ADR 0007).
// Input: a list of network requests recorded by tests/perf/load-budget.spec.ts (Chrome DevTools Protocol,
// `encodedDataLength` from `Network.loadingFinished` = bytes actually received, compressed).
// Output: totals per phase, gate rows (PASS/FAIL) per run, worst-of-N aggregation, Markdown report.
// No I/O here except `main` (re-render a saved JSON result as Markdown).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** §8 thresholds. KB = 1024 B, MB = 1024 KB (same convention as tools/check-bundle). Never raise these. */
export const BUDGETS = Object.freeze({
  initialTotalBytes: 1024 * 1024, // Welcome/Quick initial transfer ≤ 1 MB compressed (CV excluded)
  initialJsBytes: 150 * 1024, // of which JS ≤ 150 KB gzip
  forbidden3dBeforeEnter: 0, // 0 requests GLB / game texture / physics WASM / world chunk before Enter World
  worldToPlayableBytes: 8 * 1024 * 1024, // 3D resources from Enter World to player controllable ≤ 8 MB compressed
  timeToPlayableMs: 10_000, // ≤ 10 s, 10 Mbps / RTT 100 ms, worst of 3 cold loads
});

/** Network profile required by §8 / ADR 0007 (download 10 Mbps, RTT 100 ms). */
export const NETWORK = Object.freeze({
  downloadMbps: 10,
  uploadMbps: 10,
  rttMs: 100,
});

export const WORLD_MARKER = "__TQA_WORLD_CHUNK__";

/**
 * Strings that only appear in 3D code. A JS response containing one of them is a 3D/world chunk:
 * the world entry marker (src/features/world), three.js (`window.__THREE__ = REVISION`) and an inlined
 * WebAssembly binary in base64 (`\0asm` → "AGFzbQ", e.g. @dimforge/rapier3d-compat).
 */
export const WORLD_SIGNATURES = Object.freeze([WORLD_MARKER, "__THREE__", "AGFzbQ"]);

const FORBIDDEN_URL = /\.(glb|gltf|wasm|ktx2|basis|drc)(\?|#|$)/i;
const FORBIDDEN_MIME = /^(model\/|application\/wasm|image\/ktx2)/i;
/** The CV is excluded from the Welcome/Quick budget (§8 "không tính CV"). */
const CV_URL = /\.pdf(\?|#|$)/i;

/**
 * @typedef {object} RecordedRequest
 * @property {string} url
 * @property {string} [resourceType] CDP resource type (Document, Script, Stylesheet, Font, Image, Fetch, …)
 * @property {string} [mimeType]
 * @property {number} [status]
 * @property {number} encodedBytes bytes received (compressed), 0 if failed
 * @property {number} startMs wall-clock epoch ms when the request was sent
 * @property {boolean} [failed]
 * @property {string[]} [signatures] WORLD_SIGNATURES found in the (decoded) response body
 */

/** Coarse category used for the budget breakdown. */
export function categorize(request) {
  const type = (request.resourceType ?? "").toLowerCase();
  const mime = (request.mimeType ?? "").toLowerCase();
  const pathname = safePath(request.url);
  if (type === "script" || /javascript|ecmascript/.test(mime) || /\.m?js$/.test(pathname)) return "js";
  if (type === "stylesheet" || mime.startsWith("text/css") || pathname.endsWith(".css")) return "css";
  if (type === "font" || mime.startsWith("font/") || /\.(woff2?|ttf|otf)$/.test(pathname)) return "font";
  if (type === "image" || mime.startsWith("image/")) return "image";
  if (type === "document" || mime.startsWith("text/html")) return "html";
  return "other";
}

/** Why a request counts as 3D (§8 row 2), or null. */
export function threeDReason(request) {
  if (FORBIDDEN_URL.test(request.url)) return `3D file type (${safePath(request.url).split("/").pop()})`;
  if (request.mimeType && FORBIDDEN_MIME.test(request.mimeType)) return `3D MIME type (${request.mimeType})`;
  const found = (request.signatures ?? []).filter((s) => WORLD_SIGNATURES.includes(s));
  if (found.length) return `world/3D JS chunk (${found.join(", ")})`;
  return null;
}

export function isCv(request) {
  return CV_URL.test(request.url);
}

/** Sums encoded bytes by category; CV excluded and reported separately. */
export function summarize(requests) {
  const byCategory = { html: 0, css: 0, js: 0, font: 0, image: 0, other: 0 };
  let total = 0;
  let cvBytes = 0;
  let failed = 0;
  for (const request of requests) {
    const bytes = Math.max(0, Number(request.encodedBytes) || 0);
    if (request.failed) failed++;
    if (isCv(request)) {
      cvBytes += bytes;
      continue;
    }
    byCategory[categorize(request)] += bytes;
    total += bytes;
  }
  return { count: requests.length, total, byCategory, cvBytes, failed };
}

/** Requests sent strictly before `t` (epoch ms) / within [from, to]. */
export function before(requests, t) {
  return requests.filter((r) => r.startMs < t);
}
export function between(requests, from, to) {
  return requests.filter((r) => r.startMs >= from && r.startMs <= to);
}

function gate(id, label, measured, limit, unit, pass) {
  return { id, label, measured, limit, unit, status: pass ? "PASS" : "FAIL" };
}

/**
 * Gate rows for one page load measured before any Enter World click (Welcome or Quick).
 * @param {RecordedRequest[]} requests every request of the initial window
 */
export function evaluateInitialPage(page, requests, budgets = BUDGETS) {
  const summary = summarize(requests);
  const forbidden = requests
    .map((r) => ({ url: r.url, reason: threeDReason(r) }))
    .filter((r) => r.reason !== null);
  return {
    page,
    summary,
    forbidden,
    gates: [
      gate(`${page}:initial-total`, `${page} initial transfer`, summary.total, budgets.initialTotalBytes, "bytes", summary.total <= budgets.initialTotalBytes),
      gate(`${page}:initial-js`, `${page} JS (gzip)`, summary.byCategory.js, budgets.initialJsBytes, "bytes", summary.byCategory.js <= budgets.initialJsBytes),
      gate(`${page}:no-3d-before-enter`, `${page} 3D requests before Enter World`, forbidden.length, budgets.forbidden3dBeforeEnter, "requests", forbidden.length <= budgets.forbidden3dBeforeEnter),
    ],
  };
}

/**
 * Gate rows for Enter World → player controllable.
 * @param {RecordedRequest[]} requests all requests of the Welcome page (initial + world phases)
 * @param {{ clickMs: number, playableMs: number | null }} timing epoch ms
 */
export function evaluateWorld(requests, timing, budgets = BUDGETS) {
  const playable = typeof timing.playableMs === "number";
  const inWindow = playable ? between(requests, timing.clickMs, timing.playableMs) : requests.filter((r) => r.startMs >= timing.clickMs);
  const summary = summarize(inWindow);
  const timeMs = playable ? timing.playableMs - timing.clickMs : null;
  return {
    summary,
    timeMs,
    gates: [
      gate("world-bytes", "3D bytes Enter World → playable", summary.total, budgets.worldToPlayableBytes, "bytes", playable && summary.total <= budgets.worldToPlayableBytes),
      gate("time-to-playable", "Time to playable", timeMs, budgets.timeToPlayableMs, "ms", playable && timeMs <= budgets.timeToPlayableMs),
    ],
  };
}

/**
 * Worst of N runs per gate (§8: "gate theo kết quả xấu nhất"). A missing measurement (null) is worst.
 * @param {{ gates: ReturnType<typeof gate>[] }[]} runs
 */
export function worstOf(runs) {
  const rows = new Map();
  for (const run of runs) {
    for (const g of run.gates) {
      const prev = rows.get(g.id);
      if (!prev) rows.set(g.id, { ...g, runs: [g.measured] });
      else {
        prev.runs.push(g.measured);
        const worse =
          g.status === "FAIL" && prev.status === "PASS" ? true
          : g.status === "PASS" && prev.status === "FAIL" ? false
          : g.measured === null ? true
          : prev.measured === null ? false
          : g.measured > prev.measured;
        if (worse) Object.assign(prev, { ...g, runs: prev.runs });
      }
    }
  }
  const gates = [...rows.values()];
  return { gates, ok: gates.length > 0 && gates.every((g) => g.status === "PASS") };
}

export function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return "n/a";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function fmtValue(value, unit) {
  if (value === null || value === undefined) return "n/a";
  if (unit === "bytes") return `${fmtBytes(value)} (${value} B)`;
  if (unit === "ms") return `${(value / 1000).toFixed(2)} s`;
  return String(value);
}

function fmtLimit(value, unit) {
  if (unit === "bytes") return `≤ ${fmtBytes(value)}`;
  if (unit === "ms") return `≤ ${(value / 1000).toFixed(0)} s`;
  return `= ${value}`;
}

/**
 * Markdown for a full measurement: per-run table per gate + worst row.
 * @param {{ runs: { label: string, gates: ReturnType<typeof gate>[] }[] }} result
 */
export function formatMarkdown(result) {
  const worst = worstOf(result.runs);
  const header = ["Gate (§8)", "Ngưỡng", ...result.runs.map((r) => r.label), "Xấu nhất", "Kết quả"];
  const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
  for (const w of worst.gates) {
    const cells = result.runs.map((r) => {
      const g = r.gates.find((x) => x.id === w.id);
      return g ? `${fmtValue(g.measured, g.unit)}${g.status === "FAIL" ? " ✗" : ""}` : "NOT RUN";
    });
    lines.push(`| ${w.label} | ${fmtLimit(w.limit, w.unit)} | ${cells.join(" | ")} | ${fmtValue(w.measured, w.unit)} | **${w.status}** |`);
  }
  lines.push("", `Tổng: **${worst.ok ? "PASS" : "FAIL"}** (gate theo kết quả xấu nhất của ${result.runs.length} lần cold load).`);
  return lines.join("\n");
}

function safePath(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

/** CLI: `node tools/load-budget/index.mjs <result.json>` → prints the Markdown table; exit 1 if any gate FAILs. */
export function main(argv = process.argv.slice(2)) {
  const file = argv[0];
  if (!file) {
    console.error("usage: node tools/load-budget/index.mjs <load-budget.json>");
    return 2;
  }
  const result = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  console.log(formatMarkdown(result));
  return worstOf(result.runs).ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
