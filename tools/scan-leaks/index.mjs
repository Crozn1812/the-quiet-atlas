#!/usr/bin/env node
// L3-002 — Quét rò rỉ thông tin (spec §4.6) trong nội dung nguồn và artifact build.
// Chạy sau `pnpm build`. Bổ sung (không thay thế) gitleaks với `.gitleaks.toml`.
//
// Luật:
//   R1 aws-account-id   12 chữ số đứng riêng (xem heuristic ở isLikelyAwsAccountId)
//   R2 aws-arn          chuỗi `arn:aws:` (kể cả phân vùng arn:aws-cn:, arn:aws-us-gov:)
//   R3 azure-guid       GUID 8-4-4-4-12 hex, chỉ khi có subscription|tenant|directory trong ±80 ký tự
//   R4 internal-ip      10/8, 172.16/12, 192.168/16
//   R4 internal-domain  tên miền kết thúc .internal .local .corp .lan
//   R5 denylist         tên khách hàng/đối tác, email đồng nghiệp — file NGOÀI repo qua $TQA_DENYLIST_FILE
//   R6 email            mọi email không có trong allowlist.json
//
// Không bao giờ in nguyên giá trị khớp: chỉ vài ký tự đầu + độ dài.
// Node thuần (ESM), không dependency.
// Dùng: node tools/scan-leaks/index.mjs [dir...]   (mặc định: src/content out)
// Exit: 0 = sạch, 1 = có phát hiện, 2 = lỗi cấu hình/đầu vào.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const DEFAULT_DIRS = Object.freeze(["src/content", "out"]);
export const DEFAULT_ALLOWLIST_FILE = path.join(here, "allowlist.json");
export const DENYLIST_ENV = "TQA_DENYLIST_FILE";

export const RULES = Object.freeze({
  awsAccountId: { id: "R1", name: "aws-account-id" },
  awsArn: { id: "R2", name: "aws-arn" },
  azureGuid: { id: "R3", name: "azure-guid" },
  internalIp: { id: "R4", name: "internal-ip" },
  internalDomain: { id: "R4", name: "internal-domain" },
  denylist: { id: "R5", name: "denylist" },
  email: { id: "R6", name: "email" },
});

/** Không quét nội dung nhị phân (ngoài ra file có byte NUL cũng bị bỏ qua). */
export const BINARY_EXTENSIONS = Object.freeze(
  new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
    ".glb", ".wasm", ".ktx2", ".basis", ".bin",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp3", ".ogg", ".wav", ".mp4", ".webm",
    ".pdf", ".zip", ".gz", ".br",
  ]),
);

/** Đuôi file hay bị nhầm thành TLD trong "logo@2x.png" — không coi là email. */
const FILE_EXT_TLDS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "js", "mjs", "cjs", "ts", "tsx",
  "css", "html", "json", "txt", "map", "woff", "woff2", "ttf", "glb", "gltf", "wasm",
]);

// ---------------------------------------------------------------- regex ---

// R1: đúng 12 chữ số, không dính chữ/số khác. Lọc tiếp bằng isLikelyAwsAccountId.
const AWS_ACCOUNT_RE = /(?<![A-Za-z0-9])\d{12}(?![A-Za-z0-9])/g;
const AWS_ARN_RE = /arn:aws(?:-[a-z]+(?:-[a-z]+)*)?:[^\s"'<>`]*/gi;
const GUID_RE = /(?<![A-Za-z0-9-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![A-Za-z0-9-])/gi;
const AZURE_KEYWORD_RE = /subscription|tenant|directory/gi;
export const AZURE_WINDOW = 80;
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const INTERNAL_IP_RE = new RegExp(
  String.raw`(?<![\d.])(?:10\.${OCTET}\.${OCTET}\.${OCTET}|172\.(?:1[6-9]|2\d|3[01])\.${OCTET}\.${OCTET}|192\.168\.${OCTET}\.${OCTET})(?!\.?\d)`,
  "g",
);
const INTERNAL_DOMAIN_RE =
  /(?<![\w.@-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:internal|local|corp|lan)(?![\w-]|\.[\w-])/gi;
const EMAIL_RE = /(?<![\w.%+-])[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+([A-Za-z]{2,24}))(?![\w-])/g;

/** Dải ký tự base64 chuẩn (gồm + / =) quanh vị trí khớp. */
function base64Run(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && /[A-Za-z0-9+/=]/.test(text[s - 1] ?? "")) s--;
  while (e < text.length && /[A-Za-z0-9+/=]/.test(text[e] ?? "")) e++;
  return text.slice(s, e);
}

/**
 * Heuristic R1 (giảm báo nhầm trên hash/integrity của build Next):
 *  a) regex đã yêu cầu không có chữ/số liền kề → 12 chữ số nằm trong chuỗi hex/base64/nanoid
 *     dài hơn (vd. `0a1b123456789012c`) không bao giờ khớp;
 *  b) bỏ qua khi là một phần số thực/phiên bản: đứng sau `<số>.` hoặc trước `.<số>`;
 *  c) bỏ qua khi nằm trong khối base64 rõ ràng: dải ký tự [A-Za-z0-9+/=] liền mạch quanh nó
 *     dài ≥ 32 và có cả chữ hoa lẫn chữ thường (SRI `sha384-…`, data: URI). Đường dẫn URL kiểu
 *     `/123456789012/` hay `https://123456789012.signin…` vẫn bị bắt vì không thỏa điều kiện này;
 *  d) bỏ qua khi là nhóm cuối toàn chữ số của một GUID 8-4-4-4-12 (GUID do R3 xử lý).
 */
export function isLikelyAwsAccountId(text, start, end) {
  if (/\d\.$/.test(text.slice(Math.max(0, start - 2), start))) return false;
  if (/^\.\d/.test(text.slice(end, end + 2))) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-$/i.test(text.slice(Math.max(0, start - 24), start))) return false;
  const run = base64Run(text, start, end);
  if (run.length >= 32 && /[A-Z]/.test(run) && /[a-z]/.test(run)) return false;
  return true;
}

/**
 * Heuristic R3: GUID chỉ bị báo khi có subscription|tenant|directory (không phân biệt hoa thường,
 * kể cả trong `subscriptionId`, `tenant_id`, `AZURE_DIRECTORY`…) cách GUID ≤ 80 ký tự
 * (khoảng trống giữa hai chuỗi, về trước hoặc về sau).
 */
export function hasAzureKeywordNearby(text, start, end, window = AZURE_WINDOW) {
  const lo = Math.max(0, start - window - 12); // 12 = độ dài từ khóa dài nhất ("subscription")
  for (const k of text.slice(lo, end + window + 12).matchAll(AZURE_KEYWORD_RE)) {
    const ks = lo + k.index;
    const ke = ks + k[0].length;
    const gap = ke <= start ? start - ke : ks >= end ? ks - end : 0;
    if (gap <= window) return true;
  }
  return false;
}

// ------------------------------------------------------------- helpers ---

/** Che giá trị: chỉ in vài ký tự đầu + độ dài. */
export function maskValue(value) {
  const keep = Math.min(4, Math.max(1, Math.floor(value.length / 4)));
  return `${value.slice(0, keep)}…(${value.length} chars)`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Danh sách cấm: mỗi dòng một mục, bỏ dòng trống và dòng bắt đầu bằng `#`. */
export function parseDenylist(text) {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    ),
  ];
}

export function compileDenylist(terms) {
  return terms.map((t) => new RegExp(String.raw`(?<![\p{L}\p{N}_])${escapeRegExp(t)}(?![\p{L}\p{N}_])`, "giu"));
}

export function loadAllowlist(file = DEFAULT_ALLOWLIST_FILE) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const lower = (arr) => (Array.isArray(arr) ? arr.map((v) => String(v).toLowerCase()) : []);
  return { emails: lower(raw.emails), values: lower(raw.values) };
}

/** Đọc denylist từ $TQA_DENYLIST_FILE. Không có biến → bỏ qua luật 5 kèm cảnh báo. */
export function loadDenylist(env = process.env) {
  const file = env[DENYLIST_ENV];
  if (!file) {
    return { terms: [], warning: `${DENYLIST_ENV} chưa đặt — bỏ qua luật R5 (denylist khách hàng/đối tác/email đồng nghiệp).` };
  }
  if (!existsSync(file)) throw new Error(`${DENYLIST_ENV} trỏ tới file không tồn tại.`);
  return { terms: parseDenylist(readFileSync(file, "utf8")), warning: undefined };
}

function lineCol(text, index) {
  let line = 1;
  let lastNl = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) {
    line++;
    lastNl = i;
  }
  return { line, col: index - lastNl };
}

// ---------------------------------------------------------------- scan ---

/**
 * Quét một chuỗi. options: { file, allowlist: {emails, values}, denylist: string[] }.
 * Trả về phát hiện có giá trị đã che (`masked`); giá trị gốc không được trả về.
 */
export function scanText(text, { file = "<text>", allowlist = { emails: [], values: [] }, denylist = [] } = {}) {
  const hits = [];
  const allowedValues = new Set(allowlist.values ?? []);
  const allowedEmails = new Set(allowlist.emails ?? []);
  const add = (rule, index, value) => {
    if (allowedValues.has(value.toLowerCase())) return;
    const { line, col } = lineCol(text, index);
    hits.push({ file, line, col, rule: rule.id, ruleName: rule.name, masked: maskValue(value) });
  };

  for (const m of text.matchAll(AWS_ACCOUNT_RE)) {
    if (isLikelyAwsAccountId(text, m.index, m.index + m[0].length)) add(RULES.awsAccountId, m.index, m[0]);
  }
  for (const m of text.matchAll(AWS_ARN_RE)) add(RULES.awsArn, m.index, m[0]);
  for (const m of text.matchAll(GUID_RE)) {
    if (hasAzureKeywordNearby(text, m.index, m.index + m[0].length)) add(RULES.azureGuid, m.index, m[0]);
  }
  for (const m of text.matchAll(INTERNAL_IP_RE)) add(RULES.internalIp, m.index, m[0]);
  for (const m of text.matchAll(INTERNAL_DOMAIN_RE)) add(RULES.internalDomain, m.index, m[0]);
  for (const re of compileDenylist(denylist)) {
    for (const m of text.matchAll(re)) add(RULES.denylist, m.index, m[0]);
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    const tld = (m[2] ?? "").toLowerCase();
    if (FILE_EXT_TLDS.has(tld)) continue;
    if (allowedEmails.has(m[0].toLowerCase())) continue;
    add(RULES.email, m.index, m[0]);
  }

  return hits.sort((a, b) => a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule));
}

/** Liệt kê đệ quy file trong dir (bỏ symlink), sắp xếp ổn định. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(abs);
    }
  };
  walk(dir);
  return out;
}

function isBinary(file, buf) {
  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) return true;
  return buf.subarray(0, 8192).includes(0);
}

/**
 * Quét các thư mục. Trả về { ok, hits, errors, warnings, filesScanned, filesSkipped }.
 * options: { allowlist, denylist, warnings, cwd } — `cwd` để in đường dẫn tương đối.
 */
export function scanDirs(dirs, { allowlist = { emails: [], values: [] }, denylist = [], warnings = [], cwd = process.cwd() } = {}) {
  const hits = [];
  const errors = [];
  let filesScanned = 0;
  let filesSkipped = 0;
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      errors.push(`Không có thư mục ${path.relative(cwd, dir) || dir}${path.basename(dir) === "out" ? " — chạy `pnpm build` trước." : "."}`);
      continue;
    }
    for (const abs of listFiles(dir)) {
      const buf = readFileSync(abs);
      if (isBinary(abs, buf)) {
        filesSkipped++;
        continue;
      }
      filesScanned++;
      const rel = path.relative(cwd, abs).replace(/\\/g, "/");
      hits.push(...scanText(buf.toString("utf8"), { file: rel, allowlist, denylist }));
    }
  }
  return { ok: hits.length === 0 && errors.length === 0, hits, errors, warnings: [...warnings], filesScanned, filesSkipped };
}

export function formatReport(report, dirs = []) {
  const lines = [
    `scan-leaks (§4.6) — dirs: ${dirs.join(", ") || "-"}; files scanned: ${report.filesScanned}, binary skipped: ${report.filesSkipped}`,
  ];
  if (report.warnings.length) lines.push("", "Warnings:", ...report.warnings.map((w) => `  - ${w}`));
  if (report.hits.length) {
    lines.push("", `Findings (${report.hits.length}):`);
    for (const h of report.hits) lines.push(`  ${h.file}:${h.line}:${h.col}  [${h.rule} ${h.ruleName}]  ${h.masked}`);
  }
  if (report.errors.length) lines.push("", "Errors:", ...report.errors.map((e) => `  - ${e}`));
  lines.push("", report.ok ? "RESULT: PASS" : "RESULT: FAIL");
  return lines.join("\n");
}

/** CLI: trả về exit code (0 sạch, 1 có phát hiện, 2 lỗi cấu hình/đầu vào). */
export function main(argv = process.argv.slice(2), env = process.env) {
  const dirArgs = argv.length ? argv : DEFAULT_DIRS.map((d) => path.join(REPO_ROOT, d));
  const dirs = dirArgs.map((d) => path.resolve(d));
  let allowlist;
  let deny;
  try {
    allowlist = loadAllowlist();
    deny = loadDenylist(env);
  } catch (err) {
    console.error(`scan-leaks: lỗi cấu hình — ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const report = scanDirs(dirs, {
    allowlist,
    denylist: deny.terms,
    warnings: deny.warning ? [deny.warning] : [],
  });
  const shown = dirs.map((d) => path.relative(process.cwd(), d).replace(/\\/g, "/") || ".");
  const text = formatReport(report, shown);
  if (report.ok) console.log(text);
  else console.error(text);
  if (report.errors.length) return 2;
  return report.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  process.exitCode = main();
}
