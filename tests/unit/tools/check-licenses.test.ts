import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkLicenses,
  formatReport,
  listPublicFiles,
  normalizeAssetPath,
  parseCsv,
} from "../../../tools/check-licenses/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures", "check-licenses");
const cli = path.resolve(here, "../../../tools/check-licenses/index.mjs");
const HEADER = "file,creator_source,license,modify_allowed,web_distribution_allowed";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeRepo(files: Record<string, string>, csv: string): { publicDir: string; csvFile: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tqa-check-licenses-"));
  tmpDirs.push(dir);
  const publicDir = path.join(dir, "public");
  mkdirSync(publicDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(publicDir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const csvFile = path.join(dir, "LICENSES.csv");
  writeFileSync(csvFile, csv);
  return { publicDir, csvFile };
}

const fixture = (name: string) => ({
  publicDir: path.join(fixtures, name, "public"),
  csvFile: path.join(fixtures, name, "LICENSES.csv"),
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines, CRLF and BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\n\n');
    expect(rows.map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "z"],
    ]);
    expect(rows.map((r) => r.line)).toEqual([1, 2, 3]);
  });
});

describe("normalizeAssetPath", () => {
  it("accepts public/-prefixed, rooted and backslash paths", () => {
    expect(normalizeAssetPath("/public/models\\tree.glb")).toBe("models/tree.glb");
    expect(normalizeAssetPath("./fonts/a.woff2")).toBe("fonts/a.woff2");
  });
});

describe("checkLicenses", () => {
  it("passes when every public file has a complete row (.gitkeep ignored)", () => {
    const report = checkLicenses(fixture("pass"));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.files).toEqual(["fonts/sample.woff2", "models/tree.glb"]);
    expect(listPublicFiles(fixture("pass").publicDir)).not.toContain(".gitkeep");
    expect(formatReport(report)).toContain("RESULT: PASS");
  });

  it("fails on a file without a row and rows missing license / web_distribution_allowed", () => {
    const report = checkLicenses(fixture("missing"));
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      "img/banner.svg: dòng 3 thiếu `web_distribution_allowed`",
      "img/hero.png: dòng 2 thiếu `license`",
      "img/unlisted.svg: không có dòng trong LICENSES.csv",
    ]);
  });

  it("passes on an empty public/ with header-only CSV", () => {
    const report = checkLicenses(makeRepo({ ".gitkeep": "" }, `${HEADER}\n`));
    expect(report.ok).toBe(true);
    expect(report.files).toEqual([]);
  });

  it("fails when a required header column is missing", () => {
    const report = checkLicenses(makeRepo({}, "file,creator_source,license\n"));
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("web_distribution_allowed");
  });

  it("fails when a public file is explicitly not allowed on the web", () => {
    const report = checkLicenses(makeRepo({ "a.png": "x" }, `${HEADER}\na.png,Fake,CC0-1.0,yes,no\n`));
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain("web_distribution_allowed=no");
  });

  it("warns (not fails) on inventory rows without a public file", () => {
    const report = checkLicenses(makeRepo({}, `${HEADER}\nsrc-only/model.blend,Fake,CC0-1.0,yes,no\n`));
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(1);
  });

  it("fails when the CSV is missing", () => {
    const { publicDir } = makeRepo({}, "");
    expect(checkLicenses({ publicDir, csvFile: path.join(publicDir, "nope.csv") }).ok).toBe(false);
  });
});

describe("CLI exit code", () => {
  it("exits 0 on the pass fixture and 1 on the missing fixture", () => {
    const p = fixture("pass");
    const ok = spawnSync(process.execPath, [cli, p.publicDir, p.csvFile], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("RESULT: PASS");

    const m = fixture("missing");
    const bad = spawnSync(process.execPath, [cli, m.publicDir, m.csvFile], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("RESULT: FAIL");
  });
});
