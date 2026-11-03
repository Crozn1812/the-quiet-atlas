import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUDGETS,
  WORLD_MARKER,
  checkBundle,
  checkPage,
  extractResources,
  findForbiddenRefs,
  formatReport,
} from "../../../tools/check-bundle/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");
const cli = path.resolve(here, "../../../tools/check-bundle/index.mjs");
const onlyIndex = [{ file: "index.html", required: true }];

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeOut(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tqa-check-bundle-"));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

describe("extractResources", () => {
  it("collects script src, preload/modulepreload/stylesheet links and img, de-duplicated", () => {
    const html = [
      '<link rel="preload" as="script" href="/a.js"/>',
      '<script src="/a.js" async></script>',
      "<link rel='modulepreload' href='/b.js'>",
      '<link rel="stylesheet" href="/s.css">',
      '<link rel="icon" href="/favicon.ico">',
      '<img src="/p.png" alt="">',
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<script src="/legacy.js" noModule=""></script>',
      "<script>inline()</script>",
    ].join("");
    const res = extractResources(html);
    expect(res.map((r) => r.url)).toEqual(["/a.js", "/legacy.js", "/b.js", "/s.css", "/p.png"]);
    expect(res.find((r) => r.url === "/legacy.js")?.nomodule).toBe(true);
    expect(res.find((r) => r.url === "/a.js")?.nomodule).toBe(false);
  });
});

describe("findForbiddenRefs", () => {
  it("flags .glb/.gltf/.wasm/.ktx2/.basis references", () => {
    const html = '<a href="/m/tree.glb">x</a><link href="/x/rapier.wasm?v=2"><img src="t.ktx2"> scene.gltf y.basis';
    expect(findForbiddenRefs(html)).toEqual(["/m/tree.glb", "/x/rapier.wasm", "t.ktx2", "scene.gltf", "y.basis"]);
  });

  it("does not flag unrelated text", () => {
    expect(findForbiddenRefs("<p>glb wasm assembly basis of design</p>")).toEqual([]);
  });
});

describe("checkBundle on fixtures", () => {
  it("passes a clean static export", () => {
    const report = checkBundle(path.join(fixtures, "pass"));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.results.map((r) => r.page)).toEqual(["index.html", "en/index.html", "vi/index.html", "404.html"]);
    const index = report.results[0];
    // app.js counted once; nomodule legacy.js excluded from budget
    expect(index?.jsCount).toBe(1);
    expect(index?.resources.some((r) => r.url === "/logo.svg")).toBe(true);
    expect(formatReport(report)).toContain("RESULT: PASS");
  });

  it("fails when a pre-Enter-World JS chunk contains the world marker", () => {
    const report = checkBundle(path.join(fixtures, "world-leak"), { pages: onlyIndex });
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(WORLD_MARKER);
    expect(report.errors.join("\n")).toContain("world.js");
  });

  it("fails when HTML references 3D assets", () => {
    const result = checkPage(path.join(fixtures, "forbidden-3d"), "index.html");
    const threeD = result.errors.filter((e) => e.startsWith("HTML tham chiếu tài nguyên 3D"));
    expect(threeD).toHaveLength(2);
    expect(threeD.join("\n")).toMatch(/tree\.glb/);
    expect(threeD.join("\n")).toMatch(/rapier_bg\.wasm/);
  });

  it("fails when a required page is missing", () => {
    const report = checkBundle(path.join(fixtures, "world-leak"));
    expect(report.ok).toBe(false);
    expect(report.errors).toContain("404.html: thiếu trang bắt buộc");
  });

  it("fails when a referenced local file does not exist", () => {
    const out = makeOut({ "index.html": '<script src="/_next/missing.js"></script>' });
    const report = checkBundle(out, { pages: onlyIndex });
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain("/_next/missing.js");
  });

  it("fails when the output directory does not exist", () => {
    const report = checkBundle(path.join(fixtures, "does-not-exist"));
    expect(report.ok).toBe(false);
  });
});

describe("budgets (§8)", () => {
  it("fails when JS exceeds 150 KB gzip", () => {
    // Random bytes do not compress: ~200 KB raw ≈ ~200 KB gzip.
    const out = makeOut({
      "index.html": '<script src="/big.js"></script>',
      "big.js": `export const blob = "${randomBytes(150 * 1024).toString("base64")}";`,
    });
    const r = checkPage(out, "index.html");
    expect(r.jsGzip).toBeGreaterThan(BUDGETS.jsGzipBytes);
    expect(r.errors.join("\n")).toMatch(/JS gzip/);
  });

  it("fails when total initial transfer exceeds 1 MB", () => {
    const out = makeOut({
      "index.html": '<img src="hero.png" alt=""><script src="/small.js"></script>',
      "hero.png": randomBytes(1100 * 1024),
      "small.js": "export const x = 1;",
    });
    const r = checkPage(out, "index.html");
    expect(r.jsGzip).toBeLessThan(BUDGETS.jsGzipBytes);
    expect(r.total).toBeGreaterThan(BUDGETS.totalBytes);
    expect(r.errors.join("\n")).toMatch(/Tổng initial transfer/);
  });
});

describe("CLI exit code", () => {
  it("exits 0 on the clean fixture and non-zero on the world-leak fixture", () => {
    const ok = spawnSync(process.execPath, [cli, path.join(fixtures, "pass")], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("RESULT: PASS");

    const bad = spawnSync(process.execPath, [cli, path.join(fixtures, "world-leak")], { encoding: "utf8" });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain("RESULT: FAIL");
  });
});
