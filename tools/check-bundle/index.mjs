#!/usr/bin/env node
// L3-001 — Kiểm bundle sau `next build` (static export trong `out/`).
// Spec §5, §8, Q18: trang không-world không được tải chunk 3D trước Enter World,
// và phải nằm trong ngân sách tải lạnh (JS ≤ 150 KB gzip, tổng ≤ 1 MB nén).
//
// Node thuần (ESM), không dependency. Dùng: node tools/check-bundle/index.mjs [outDir]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** Chuỗi hợp đồng ranh giới từ L2-001: điểm vào world chứa chuỗi này. */
export const WORLD_MARKER = "__TQA_WORLD_CHUNK__";

/** Ngân sách §8 (KB = 1024 byte, MB = 1024 KB). */
export const BUDGETS = Object.freeze({
  jsGzipBytes: 150 * 1024,
  totalBytes: 1024 * 1024,
});

/** Đuôi file 3D cấm xuất hiện trong HTML trang không-world. */
export const FORBIDDEN_EXTENSIONS = Object.freeze(["glb", "gltf", "wasm", "ktx2", "basis"]);

/** Trang không-world: `required` = thiếu là FAIL; còn lại kiểm nếu có. */
export const DEFAULT_PAGES = Object.freeze([
  { file: "index.html", required: true },
  { file: "en/index.html", required: true },
  { file: "vi/index.html", required: true },
  { file: "en/quick/index.html", required: false },
  { file: "vi/quick/index.html", required: false },
  { file: "404.html", required: true },
]);

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".svg", ".json", ".txt"]);
const FORBIDDEN_RE = new RegExp(
  String.raw`[^\s"'<>()]*\.(?:${FORBIDDEN_EXTENSIONS.join("|")})(?=[?#"'\s<>)]|$)`,
  "gi",
);

function getAttr(tag, name) {
  const m = new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`, "i").exec(tag);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

function hasAttr(tag, name) {
  return new RegExp(String.raw`\s${name}(?:\s*=|[\s/>])`, "i").test(tag);
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}

/**
 * Thu thập tài nguyên tham chiếu trực tiếp trong HTML:
 * <script src>, <link rel=preload|modulepreload|stylesheet href>, <img src>.
 * `nomodule` = script chỉ trình duyệt cũ tải (không tính vào ngân sách, vẫn kiểm marker).
 */
export function extractResources(html) {
  const out = [];
  const push = (raw, kind, nomodule = false) => {
    if (!raw) return;
    const url = decodeEntities(raw.trim());
    if (!url || url.startsWith("data:")) return;
    const existing = out.find((r) => r.url === url);
    if (existing) {
      // Cùng file tham chiếu qua preload + script: chỉ tính một lần; module thắng nomodule.
      if (!nomodule) existing.nomodule = false;
      return;
    }
    out.push({ url, kind, nomodule });
  };

  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0];
    const src = getAttr(tag, "src");
    if (src !== undefined) push(src, "script", hasAttr(tag, "nomodule"));
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rels = (getAttr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    if (rels.some((r) => r === "preload" || r === "modulepreload" || r === "stylesheet")) {
      const kind = rels.includes("stylesheet") ? "style" : (getAttr(tag, "as") ?? "script").toLowerCase();
      push(getAttr(tag, "href"), kind);
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    push(getAttr(m[0], "src"), "image");
  }
  return out;
}

/** Tìm tham chiếu .glb/.gltf/.wasm/.ktx2/.basis trong HTML. */
export function findForbiddenRefs(html) {
  return [...new Set([...html.matchAll(FORBIDDEN_RE)].map((m) => m[0]))];
}

function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
}

function resolveLocal(outDir, pageFile, url) {
  const clean = url.split(/[?#]/)[0] ?? "";
  const rel = clean.startsWith("/")
    ? clean.slice(1)
    : path.posix.join(path.posix.dirname(pageFile.replace(/\\/g, "/")), clean);
  const abs = path.resolve(outDir, decodeURIComponent(rel));
  const root = path.resolve(outDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return undefined;
  return abs;
}

function isJs(fileOrUrl) {
  return /\.m?js$/i.test(fileOrUrl.split(/[?#]/)[0] ?? "");
}

/** Byte truyền ước lượng: gzip (zlib) cho text, nguyên kích thước cho nhị phân đã nén. */
export function transferSize(buf, file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) ? gzipSync(buf, { level: 9 }).length : buf.length;
}

/** Kiểm một trang. Trả về số liệu + danh sách lỗi (rỗng = đạt). */
export function checkPage(outDir, pageFile, budgets = BUDGETS) {
  const errors = [];
  const warnings = [];
  const htmlPath = path.join(outDir, pageFile);
  const htmlBuf = readFileSync(htmlPath);
  const html = htmlBuf.toString("utf8");
  const htmlBytes = transferSize(htmlBuf, htmlPath);

  if (html.includes(WORLD_MARKER)) errors.push(`HTML chứa marker world ${WORLD_MARKER}`);
  for (const ref of findForbiddenRefs(html)) errors.push(`HTML tham chiếu tài nguyên 3D: ${ref}`);

  let jsGzip = 0;
  let total = htmlBytes;
  let jsCount = 0;
  const resources = [];
  for (const res of extractResources(html)) {
    if (isExternal(res.url)) {
      warnings.push(`Tài nguyên ngoài không đo được: ${res.url}`);
      continue;
    }
    const file = resolveLocal(outDir, pageFile, res.url);
    if (!file || !existsSync(file)) {
      errors.push(`Không tìm thấy tài nguyên: ${res.url}`);
      continue;
    }
    const buf = readFileSync(file);
    const bytes = transferSize(buf, file);
    const js = isJs(file);
    if (js && buf.toString("utf8").includes(WORLD_MARKER)) {
      errors.push(`JS tải trước Enter World chứa ${WORLD_MARKER}: ${res.url}`);
    }
    resources.push({ ...res, file, bytes, js });
    if (res.nomodule) continue; // trình duyệt hiện đại không tải script nomodule
    total += bytes;
    if (js) {
      jsGzip += bytes;
      jsCount += 1;
    }
  }

  if (jsGzip > budgets.jsGzipBytes) {
    errors.push(`JS gzip ${fmtKB(jsGzip)} > ngân sách ${fmtKB(budgets.jsGzipBytes)}`);
  }
  if (total > budgets.totalBytes) {
    errors.push(`Tổng initial transfer ${fmtKB(total)} > ngân sách ${fmtKB(budgets.totalBytes)}`);
  }

  return { page: pageFile.replace(/\\/g, "/"), htmlBytes, jsGzip, jsCount, total, resources, errors, warnings };
}

/** Kiểm toàn bộ thư mục out/. */
export function checkBundle(outDir, { pages = DEFAULT_PAGES, budgets = BUDGETS } = {}) {
  const errors = [];
  const results = [];
  if (!existsSync(outDir)) {
    return { ok: false, results, errors: [`Không có thư mục ${outDir} — chạy \`pnpm build\` trước.`] };
  }
  for (const p of pages) {
    if (!existsSync(path.join(outDir, p.file))) {
      if (p.required) errors.push(`${p.file}: thiếu trang bắt buộc`);
      continue;
    }
    const r = checkPage(outDir, p.file, budgets);
    results.push(r);
    for (const e of r.errors) errors.push(`${r.page}: ${e}`);
  }
  if (results.length === 0) errors.push("Không kiểm được trang nào.");
  return { ok: errors.length === 0, results, errors };
}

export function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Bảng kết quả dạng text. */
export function formatReport(report, budgets = BUDGETS) {
  const header = ["Page", "HTML gz", "JS files", "JS gzip", "Total", "Status"];
  const rows = report.results.map((r) => [
    r.page,
    fmtKB(r.htmlBytes),
    String(r.jsCount),
    fmtKB(r.jsGzip),
    fmtKB(r.total),
    r.errors.length === 0 ? "PASS" : "FAIL",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] ?? "").length)));
  const line = (cells) => "| " + cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(" | ") + " |";
  const sep = "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  const lines = [
    `check-bundle — budgets: JS ≤ ${fmtKB(budgets.jsGzipBytes)} gzip, total ≤ ${fmtKB(budgets.totalBytes)}; marker ${WORLD_MARKER}`,
    line(header),
    sep,
    ...rows.map(line),
  ];
  const warnings = report.results.flatMap((r) => r.warnings.map((w) => `${r.page}: ${w}`));
  if (warnings.length) lines.push("", "Warnings:", ...warnings.map((w) => `  - ${w}`));
  if (report.errors.length) lines.push("", "Errors:", ...report.errors.map((e) => `  - ${e}`));
  lines.push("", report.ok ? "RESULT: PASS" : "RESULT: FAIL");
  return lines.join("\n");
}

/** CLI: trả về exit code. */
export function main(argv = process.argv.slice(2)) {
  const outDir = path.resolve(argv[0] ?? "out");
  const report = checkBundle(outDir);
  const text = formatReport(report);
  if (report.ok) console.log(text);
  else console.error(text);
  return report.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  process.exitCode = main();
}
