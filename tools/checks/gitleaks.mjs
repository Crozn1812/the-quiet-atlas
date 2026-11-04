#!/usr/bin/env node
// L5-011 — Chạy gitleaks ở local giống hệt bước CI (.github/workflows/pr.yml, "Gitleaks (v8.28.0 ...)"):
//   gitleaks dir out          --config .gitleaks.toml --redact --no-banner --exit-code 1
//   gitleaks dir src/content  --config .gitleaks.toml --redact --no-banner --exit-code 1
//   gitleaks git .            --config .gitleaks.toml --redact --no-banner --exit-code 1
//
// Node thuần (ESM), không dependency, không tải gì từ mạng. Binary lấy từ $GITLEAKS_BIN
// (bản chính thức v8.28.0, Lead đã kiểm checksum). Gốc repo suy ra từ vị trí script, không từ cwd.
// Cần `out/` đã build (pnpm build) trước khi chạy.
// Exit: 0 = cả 3 lệnh đạt; 1 = có phát hiện/lỗi; 2 = BLOCKED (thiếu/sai GITLEAKS_BIN hoặc thiếu out/) — không phải PASS.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const EXPECTED_VERSION = "8.28.0";
export const COMMON_FLAGS = Object.freeze(["--config", ".gitleaks.toml", "--redact", "--no-banner", "--exit-code", "1"]);
export const COMMANDS = Object.freeze([
  Object.freeze({ label: "dir out", args: ["dir", "out"] }),
  Object.freeze({ label: "dir src/content", args: ["dir", "src/content"] }),
  Object.freeze({ label: "git .", args: ["git", "."] }),
]);

function blocked(msg) {
  console.error(`BLOCKED: ${msg}`);
  return 2;
}

export function main(env = process.env) {
  const bin = env.GITLEAKS_BIN;
  if (!bin) {
    return blocked(
      [
        "biến môi trường GITLEAKS_BIN chưa được đặt; gitleaks KHÔNG được chạy (kết quả: không phải PASS).",
        `Trỏ GITLEAKS_BIN tới binary gitleaks chính thức v${EXPECTED_VERSION} đã kiểm checksum (script này không tải gì từ mạng).`,
        "  Git Bash:   GITLEAKS_BIN=/đường/dẫn/gitleaks.exe node tools/checks/gitleaks.mjs",
        '  PowerShell: $env:GITLEAKS_BIN = "C:/duong-dan/gitleaks.exe"; node tools/checks/gitleaks.mjs',
        "Cần build trước: pnpm build (để có thư mục out/).",
      ].join("\n"),
    );
  }
  if (!existsSync(bin) || !statSync(bin).isFile()) {
    return blocked(`GITLEAKS_BIN không phải file tồn tại: ${bin}`);
  }
  if (!existsSync(path.join(REPO_ROOT, ".gitleaks.toml"))) {
    return blocked(`không thấy ${path.join(REPO_ROOT, ".gitleaks.toml")}`);
  }
  if (!existsSync(path.join(REPO_ROOT, "out"))) {
    return blocked("thiếu thư mục out/ — chạy `pnpm build` trước (CI quét out/ sau bước build).");
  }

  const ver = spawnSync(bin, ["version"], { cwd: REPO_ROOT, encoding: "utf8" });
  const verText = `${ver.stdout ?? ""}`.trim();
  if (ver.error || ver.status !== 0) return blocked(`không chạy được "${bin} version": ${ver.error?.message ?? ver.stderr}`);
  console.log(`gitleaks ${verText} (CI ghim v${EXPECTED_VERSION})`);
  if (!verText.includes(EXPECTED_VERSION)) {
    console.warn(`CẢNH BÁO: phiên bản khác v${EXPECTED_VERSION} của CI — kết quả có thể lệch.`);
  }

  let failed = 0;
  for (const { label, args } of COMMANDS) {
    console.log(`\n$ gitleaks ${label} ${COMMON_FLAGS.join(" ")}`);
    const r = spawnSync(bin, [...args, ...COMMON_FLAGS], { cwd: REPO_ROOT, stdio: "inherit" });
    if (r.error) {
      console.error(`LỖI chạy gitleaks (${label}): ${r.error.message}`);
      failed++;
    } else if (r.status !== 0) {
      console.error(`FAIL: gitleaks ${label} exit ${r.status}`);
      failed++;
    } else console.log(`PASS: gitleaks ${label}`);
  }
  console.log(failed === 0 ? "\ngitleaks: PASS (3/3)" : `\ngitleaks: FAIL (${failed}/3 lệnh không đạt)`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
