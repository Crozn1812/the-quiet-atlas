#!/usr/bin/env node
// L3-002 — Kiểm inventory asset (spec §7.3, §11.6): mỗi file trong `public/` phải có dòng
// trong `assets/LICENSES.csv` (khớp cột `file`) với `license` và `web_distribution_allowed` có giá trị.
//
// Node thuần (ESM), không dependency.
// Dùng: node tools/check-licenses/index.mjs [publicDir] [licensesCsv]
//   (mặc định: <repo>/public và <repo>/assets/LICENSES.csv)
// Cột `file` chấp nhận đường dẫn tương đối so với public/ (`models/tree.glb`), có thể kèm tiền tố
// `public/` hoặc `/`; dấu `\` được đổi thành `/`.
// Exit: 0 = đạt, 1 = thiếu/sai.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const DEFAULT_PUBLIC_DIR = path.join(REPO_ROOT, "public");
export const DEFAULT_CSV = path.join(REPO_ROOT, "assets", "LICENSES.csv");
export const REQUIRED_COLUMNS = Object.freeze(["file", "license", "web_distribution_allowed"]);
export const IGNORED_BASENAMES = Object.freeze(new Set([".gitkeep"]));
/** Giá trị phủ định rõ ràng: file nằm trong public/ (được phát hành web) mà không được phép → FAIL. */
const NEGATIVE_VALUES = new Set(["no", "n", "false", "0", "không", "khong"]);

/** CSV tối giản theo RFC 4180: dấu phẩy, ngoặc kép, "" thoát, CRLF/LF, BOM. Trả về [{ line, cells }]. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let cells = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
}

export function normalizeAssetPath(p) {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/^public\//, "");
}

/** Liệt kê file trong public/ (đường dẫn posix tương đối), bỏ `.gitkeep`. */
export function listPublicFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (!IGNORED_BASENAMES.has(ent.name)) out.push(path.relative(dir, abs).replace(/\\/g, "/"));
    }
  };
  walk(dir);
  return out;
}

/** Đọc inventory → { entries: Map<file, {line, record}>, errors, warnings }. */
export function readInventory(csvText) {
  const errors = [];
  const warnings = [];
  const entries = new Map();
  const rows = parseCsv(csvText);
  const header = (rows[0]?.cells ?? []).map((h) => h.trim().toLowerCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) errors.push(`LICENSES.csv thiếu cột tiêu đề \`${col}\``);
  }
  if (errors.length) return { entries, errors, warnings };
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(header.map((h, i) => [h, (row.cells[i] ?? "").trim()]));
    const file = normalizeAssetPath(record.file ?? "");
    if (!file) {
      errors.push(`LICENSES.csv dòng ${row.line}: cột \`file\` trống`);
      continue;
    }
    if (entries.has(file)) warnings.push(`LICENSES.csv dòng ${row.line}: trùng file ${file} (dùng dòng đầu tiên)`);
    else entries.set(file, { line: row.line, record });
  }
  return { entries, errors, warnings };
}

export function checkLicenses({ publicDir = DEFAULT_PUBLIC_DIR, csvFile = DEFAULT_CSV } = {}) {
  const files = listPublicFiles(publicDir);
  const errors = [];
  const warnings = [];
  if (!existsSync(publicDir)) warnings.push(`Không có thư mục public (${publicDir}) — coi như không có asset.`);
  if (!existsSync(csvFile)) {
    errors.push(`Không có file inventory ${csvFile}`);
    return { ok: false, files, errors, warnings };
  }
  const inv = readInventory(readFileSync(csvFile, "utf8"));
  errors.push(...inv.errors);
  warnings.push(...inv.warnings);
  if (inv.errors.length) return { ok: false, files, errors, warnings };

  for (const file of files) {
    const entry = inv.entries.get(file);
    if (!entry) {
      errors.push(`${file}: không có dòng trong LICENSES.csv`);
      continue;
    }
    const { license = "", web_distribution_allowed: web = "" } = entry.record;
    if (!license) errors.push(`${file}: dòng ${entry.line} thiếu \`license\``);
    if (!web) errors.push(`${file}: dòng ${entry.line} thiếu \`web_distribution_allowed\``);
    else if (NEGATIVE_VALUES.has(web.toLowerCase())) {
      errors.push(`${file}: dòng ${entry.line} web_distribution_allowed=${web} nhưng file nằm trong public/`);
    }
  }
  const present = new Set(files);
  for (const file of inv.entries.keys()) {
    if (!present.has(file)) warnings.push(`LICENSES.csv có ${file} nhưng không thấy trong public/ (asset ngoài public hoặc đã xóa?)`);
  }
  return { ok: errors.length === 0, files, errors, warnings };
}

export function formatReport(report) {
  const lines = [`check-licenses (§7.3) — public files: ${report.files.length} (excluding .gitkeep)`];
  if (report.warnings.length) lines.push("", "Warnings:", ...report.warnings.map((w) => `  - ${w}`));
  if (report.errors.length) lines.push("", "Errors:", ...report.errors.map((e) => `  - ${e}`));
  lines.push("", report.ok ? "RESULT: PASS" : "RESULT: FAIL");
  return lines.join("\n");
}

/** CLI: trả về exit code. */
export function main(argv = process.argv.slice(2)) {
  const report = checkLicenses({
    publicDir: argv[0] ? path.resolve(argv[0]) : DEFAULT_PUBLIC_DIR,
    csvFile: argv[1] ? path.resolve(argv[1]) : DEFAULT_CSV,
  });
  const text = formatReport(report);
  if (report.ok) console.log(text);
  else console.error(text);
  return report.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  process.exitCode = main();
}
