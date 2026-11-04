#!/usr/bin/env node
// L5-012 — Kiểm Terraform TĨNH, giống bước CI (.github/workflows/pr.yml, job "terraform"):
//   với mỗi root (infra/bootstrap, infra/envs/prod) và infra/modules:
//     terraform fmt -check -recursive -diff
//   với mỗi root:
//     terraform init -backend=false -input=false [-lockfile=readonly nếu đã có .terraform.lock.hcl]
//     terraform validate
//
// KHÔNG plan/apply/import, KHÔNG backend, KHÔNG credential: mọi biến AWS_* / TF_VAR_* bị gỡ khỏi môi trường
// tiến trình con, tắt IMDS. `init` chỉ tải provider từ registry.terraform.io.
// Binary: $TERRAFORM_BIN hoặc `terraform` trên PATH. Gốc repo suy ra từ vị trí script, không từ cwd.
// Exit: 0 = PASS; 1 = có lỗi fmt/init/validate; 2 = BLOCKED (không chạy được terraform) — không phải PASS.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const ROOTS = Object.freeze(["infra/bootstrap", "infra/envs/prod"]);
export const FMT_DIRS = Object.freeze([...ROOTS, "infra/modules"]);
export const LOCKFILE = ".terraform.lock.hcl";
// Lệnh duy nhất được phép chạy. Mọi thứ khác (plan/apply/import/state/...) bị từ chối trước khi spawn.
export const ALLOWED_SUBCOMMANDS = Object.freeze(["version", "fmt", "init", "validate"]);

const STRIP_ENV = /^(AWS_|TF_VAR_|TF_CLI_ARGS|TF_WORKSPACE$|TF_TOKEN_)/;

/** Môi trường cho terraform: không credential AWS, không biến TF ngoài ý muốn, không hỏi input. */
export function sanitizeEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || STRIP_ENV.test(k)) continue;
    out[k] = v;
  }
  out.AWS_EC2_METADATA_DISABLED = "true";
  out.TF_IN_AUTOMATION = "1";
  out.TF_INPUT = "0";
  out.CHECKPOINT_DISABLE = "1";
  return out;
}

export function initArgs(hasLockfile) {
  const args = ["init", "-backend=false", "-input=false", "-no-color"];
  if (hasLockfile) args.push("-lockfile=readonly");
  return args;
}

/** Danh sách bước theo thứ tự; `hasLock(root)` cho biết root đã có lockfile chưa. */
export function buildSteps(hasLock) {
  const steps = FMT_DIRS.map((dir) => ({ label: `fmt ${dir}`, dir, args: ["fmt", "-check", "-recursive", "-diff", "-no-color"] }));
  for (const root of ROOTS) {
    steps.push({ label: `init ${root}`, dir: root, args: initArgs(hasLock(root)), root });
    steps.push({ label: `validate ${root}`, dir: root, args: ["validate", "-no-color"], root });
  }
  return steps;
}

export function assertAllowed(args) {
  if (!ALLOWED_SUBCOMMANDS.includes(args[0])) throw new Error(`lệnh terraform không được phép: ${args[0]}`);
}

function blocked(msg) {
  console.error(`BLOCKED: ${msg}`);
  return 2;
}

export function main(env = process.env, { run = spawnSync, repoRoot = REPO_ROOT } = {}) {
  const bin = env.TERRAFORM_BIN || "terraform";
  const childEnv = sanitizeEnv(env);
  const exec = (args, cwd, stdio) => {
    assertAllowed(args);
    return run(bin, args, { cwd, env: childEnv, encoding: "utf8", stdio, shell: false });
  };

  const ver = exec(["version"], repoRoot, "pipe");
  if (ver.error || ver.status !== 0) {
    return blocked(
      [
        `không chạy được "${bin} version" (${ver.error?.message ?? `exit ${ver.status}`}); fmt/validate KHÔNG được chạy (kết quả: không phải PASS).`,
        "Cài Terraform >= 1.10 rồi đặt PATH hoặc TERRAFORM_BIN:",
        '  PowerShell: $env:TERRAFORM_BIN = "C:/duong-dan/terraform.exe"; node tools/checks/terraform.mjs',
      ].join("\n"),
    );
  }
  console.log(`${`${ver.stdout ?? ""}`.split(/\r?\n/)[0]} (TERRAFORM_BIN=${bin})`);

  const isCi = env.CI === "true";
  const hasLock = (root) => existsSync(path.join(repoRoot, root, LOCKFILE));
  let failed = 0;
  const results = [];

  for (const root of ROOTS) {
    if (!existsSync(path.join(repoRoot, root))) return blocked(`thiếu thư mục ${root}`);
    if (!hasLock(root)) {
      if (isCi) {
        console.error(`FAIL: ${root}/${LOCKFILE} chưa được commit (CI yêu cầu lockfile để ghim hash provider).`);
        failed++;
      } else {
        console.warn(`CẢNH BÁO: ${root}/${LOCKFILE} chưa có — init sẽ tạo mới; nhớ commit file này.`);
      }
    }
  }

  for (const step of buildSteps(hasLock)) {
    if (step.root && results.some((r) => r.root === step.root && !r.ok)) {
      console.log(`\nSKIP: ${step.label} (bước trước của root này đã lỗi)`);
      continue;
    }
    console.log(`\n$ (${step.dir}) terraform ${step.args.join(" ")}`);
    const r = exec(step.args, path.join(repoRoot, step.dir), "inherit");
    const ok = !r.error && r.status === 0;
    if (r.error) console.error(`LỖI chạy terraform (${step.label}): ${r.error.message}`);
    console.log(ok ? `PASS: ${step.label}` : `FAIL: ${step.label} (exit ${r.status})`);
    results.push({ ...step, ok });
    if (!ok) failed++;
  }

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  console.log(failed === 0 ? `\nterraform: PASS (${passed}/${total})` : `\nterraform: FAIL (${failed} lỗi; ${passed}/${total} bước đạt)`);
  return failed === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
