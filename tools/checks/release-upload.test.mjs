import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const helper = fileURLToPath(new URL("./upload-asset-metadata.sh", import.meta.url)).replaceAll("\\", "/");

test("deploy workflow: all inline Bash blocks parse; assets and checks precede invalidation/OIDC", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const lines = workflow.split(/\r?\n/);
  let blocks = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "        run: |") continue;
    const block = [];
    while (++i < lines.length && (lines[i] === "" || lines[i].startsWith("          "))) {
      block.push(lines[i].slice(10));
    }
    i--;
    const result = spawnSync("bash", ["-n"], { input: block.join("\n"), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    blocks++;
  }
  assert.ok(blocks >= 4);
  assert.ok(workflow.indexOf("pnpm check:assets") < workflow.indexOf("Assume site deploy role via OIDC"));
  assert.ok(workflow.indexOf("Upload world assets before HTML") < workflow.indexOf("Sync mutable files"));
  assert.ok(workflow.indexOf("bash tools/checks/upload-asset-metadata.sh") < workflow.indexOf("aws cloudfront create-invalidation"));
  assert.ok(workflow.includes("paths=('/' '/world/*')"));
  assert.ok(workflow.includes("--exclude '_next/static/*' --exclude 'world/*'"));
});

test("deploy metadata: real Bash helper, mocked AWS; MIME/cache, unchanged files, fail closed", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rel03-upload-"));
  const out = path.join(dir, "out");
  const log = path.join(dir, "calls.jsonl");
  const assets = {
    "world/tex/a.ktx2": "image/ktx2",
    "world/character/a.glb": "model/gltf-binary",
    "world/env/sky.ktx2": "image/ktx2",
    "world/env/sky.hdr": "application/octet-stream",
    "world/lib/a.wasm": "application/wasm",
    "media/preview space.webm": "video/webm",
    "media/MODEL.GLB": "model/gltf-binary",
    "media/a.gltf": "model/gltf+json",
    "_next/static/media/a.woff2": "font/woff2",
    "fonts/a.woff": "font/woff",
    "fonts/a.ttf": "font/ttf",
    "fonts/a.otf": "font/otf",
    "fonts/a.eot": "application/vnd.ms-fontobject",
  };
  try {
    for (const key of ["index.html", "world/manifest.json", ...Object.keys(assets)]) {
      const target = path.join(out, key);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from([0, 1, 2, 255]));
    }
    // Shell function intercepts every AWS invocation; never runs the real CLI.
    const command = `
      aws() {
        node -e 'require("node:fs").appendFileSync(process.env.UPLOAD_LOG, JSON.stringify(process.argv.slice(1))+"\\n")' "$@"
        if [ "$MOCK_FAIL" = 1 ]; then return 7; fi
      }
      export -f aws
      bash "$1" "$2" test-bucket
    `;
    const run = (extraEnv = {}) => spawnSync("bash", ["-c", command, "--", helper, out.replaceAll("\\", "/")], {
      encoding: "utf8", env: { ...process.env, UPLOAD_LOG: log, MOCK_FAIL: "0", ...extraEnv },
    });
    for (let pass = 0; pass < 2; pass++) {
      writeFileSync(log, "");
      const result = run();
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      assert.equal(calls.length, Object.keys(assets).length);
      for (const [key, mime] of Object.entries(assets)) {
        const call = calls.find((args) => args[3] === `s3://test-bucket/${key}`);
        assert.ok(call, key);
        assert.deepEqual(call.slice(0, 2), ["s3", "cp"]);
        assert.equal(call[call.indexOf("--content-type") + 1], mime);
        assert.equal(call[call.indexOf("--cache-control") + 1], key.startsWith("_next/static/")
          ? "public, max-age=31536000, immutable" : "no-cache, max-age=0, must-revalidate");
        assert.ok(!call.includes("--content-encoding"));
        assert.ok(!call.includes("--delete"));
        assert.deepEqual(readFileSync(path.join(out, key)), Buffer.from([0, 1, 2, 255]));
      }
    }
    assert.equal(run({ MOCK_FAIL: "1" }).status, 7, "upload failure must stop deployment");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
