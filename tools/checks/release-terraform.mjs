#!/usr/bin/env node
// Release audit: roots plus each child module in a disposable provider harness.
// Aliased providers make `validate` directly inside dns/static-site incomplete.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, assertAllowed, main, sanitizeEnv } from "./terraform.mjs";

const env = sanitizeEnv(process.env);
let failed = main();
const modules = ["dns", "monitoring", "static-site"];
let passed = 0;
for (const name of modules) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `rel03-${name}-`));
  try {
    const source = path.join(REPO_ROOT, "infra/modules", name).replaceAll("\\", "/");
    const aliases = name === "monitoring" ? "" : "aws.us_east_1 = aws.us_east_1";
    writeFileSync(path.join(dir, "main.tf"), `
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 6.71"
    }
  }
}
provider "aws" {
  region = "ap-southeast-1"
}
provider "aws" {
  alias = "us_east_1"
  region = "us-east-1"
}
module "subject" {
  source = ${JSON.stringify(source)}
  providers = {
    aws = aws
    ${aliases}
  }
  ${name === "static-site" ? 'bucket_name = "rel03-validation-only"' : ""}
}
`);
    copyFileSync(path.join(REPO_ROOT, "infra/envs/prod/.terraform.lock.hcl"), path.join(dir, ".terraform.lock.hcl"));
    let ok = true;
    for (const args of [["init", "-backend=false", "-input=false", "-lockfile=readonly", "-no-color"], ["validate", "-no-color"]]) {
      assertAllowed(args);
      console.log(`\n$ (infra/modules/${name}, temporary provider harness) terraform ${args.join(" ")}`);
      const result = spawnSync(process.env.TERRAFORM_BIN || "terraform", [`-chdir=${dir}`, ...args], { env, stdio: "inherit", shell: false });
      if (result.error || result.status !== 0) {
        console.error(`FAIL: ${name} ${args[0]} (${result.error?.message ?? `exit ${result.status}`})`);
        ok = false;
        break;
      }
    }
    if (ok) passed++;
    else failed = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nrelease terraform: ${failed === 0 ? "PASS" : "FAIL"} (roots + ${passed}/${modules.length} modules)`);
process.exitCode = failed;
