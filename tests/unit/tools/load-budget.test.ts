import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUDGETS,
  WORLD_MARKER,
  categorize,
  evaluateInitialPage,
  evaluateWorld,
  formatMarkdown,
  isCv,
  summarize,
  threeDReason,
  worstOf,
  type RecordedRequest,
} from "../../../tools/load-budget/index.mjs";
import { shouldCompress } from "../../../tools/load-budget/serve-gzip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../../../tools/load-budget/index.mjs");
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const KB = 1024;
const MB = 1024 * KB;
const req = (url: string, encodedBytes: number, extra: Partial<RecordedRequest> = {}): RecordedRequest => ({
  url: `http://127.0.0.1:4174${url}`,
  encodedBytes,
  startMs: 1_000,
  ...extra,
});

describe("categorize", () => {
  it("uses CDP resource type, then MIME, then extension", () => {
    expect(categorize(req("/a.js", 1, { resourceType: "Script" }))).toBe("js");
    expect(categorize(req("/x", 1, { mimeType: "text/javascript" }))).toBe("js");
    expect(categorize(req("/s.css", 1))).toBe("css");
    expect(categorize(req("/f.woff2", 1))).toBe("font");
    expect(categorize(req("/p.webp", 1, { resourceType: "Image" }))).toBe("image");
    expect(categorize(req("/en/", 1, { resourceType: "Document", mimeType: "text/html" }))).toBe("html");
    expect(categorize(req("/en/__next.x.txt", 1, { resourceType: "Fetch", mimeType: "text/plain" }))).toBe("other");
  });
});

describe("threeDReason", () => {
  it("flags 3D file types, 3D MIME types and world/3D JS chunks", () => {
    expect(threeDReason(req("/m/tree.glb", 1))).toMatch(/tree\.glb/);
    expect(threeDReason(req("/x/rapier_bg.wasm?v=1", 1))).toMatch(/wasm/);
    expect(threeDReason(req("/t/bark.ktx2", 1))).toMatch(/ktx2/);
    expect(threeDReason(req("/blob", 1, { mimeType: "model/gltf-binary" }))).toMatch(/MIME/);
    expect(threeDReason(req("/c.js", 1, { signatures: [WORLD_MARKER] }))).toMatch(/world\/3D JS chunk/);
    expect(threeDReason(req("/c.js", 1, { signatures: ["__THREE__"] }))).toMatch(/__THREE__/);
  });

  it("does not flag portfolio resources", () => {
    expect(threeDReason(req("/_next/static/chunks/app.js", 1, { signatures: [] }))).toBeNull();
    expect(threeDReason(req("/img/hero.webp", 1, { mimeType: "image/webp" }))).toBeNull();
  });
});

describe("summarize", () => {
  it("sums encoded bytes by category and excludes the CV", () => {
    const s = summarize([
      req("/en/", 4_000, { resourceType: "Document" }),
      req("/a.js", 100_000, { resourceType: "Script" }),
      req("/b.css", 2_000, { resourceType: "Stylesheet" }),
      req("/cv/duy-cv.pdf", 300_000),
      req("/gone.js", 0, { resourceType: "Script", failed: true }),
    ]);
    expect(s.total).toBe(106_000);
    expect(s.byCategory.js).toBe(100_000);
    expect(s.cvBytes).toBe(300_000);
    expect(s.failed).toBe(1);
    expect(isCv(req("/cv/duy-cv.pdf", 1))).toBe(true);
  });
});

describe("evaluateInitialPage (§8 rows 1–2)", () => {
  it("passes within budget", () => {
    const r = evaluateInitialPage("Welcome", [req("/en/", 5 * KB, { resourceType: "Document" }), req("/a.js", 140 * KB, { resourceType: "Script" })]);
    expect(r.gates.map((g) => g.status)).toEqual(["PASS", "PASS", "PASS"]);
  });

  it("fails JS over 150 KB, total over 1 MB and any 3D request", () => {
    const r = evaluateInitialPage("Welcome", [
      req("/a.js", 151 * KB, { resourceType: "Script" }),
      req("/hero.png", 900 * KB, { resourceType: "Image" }),
      req("/m/tree.glb", 10),
    ]);
    const byId = Object.fromEntries(r.gates.map((g) => [g.id, g]));
    expect(byId["Welcome:initial-js"]?.status).toBe("FAIL");
    expect(byId["Welcome:initial-total"]?.status).toBe("FAIL");
    expect(byId["Welcome:no-3d-before-enter"]?.status).toBe("FAIL");
    expect(r.forbidden).toHaveLength(1);
  });

  it("budget edges are inclusive", () => {
    const r = evaluateInitialPage("Q", [req("/a.js", BUDGETS.initialJsBytes, { resourceType: "Script" })]);
    expect(r.gates.find((g) => g.id === "Q:initial-js")?.status).toBe("PASS");
  });
});

describe("evaluateWorld (§8 rows 3 and time to playable)", () => {
  const requests = [
    req("/en/", 4_000, { startMs: 0 }),
    req("/world.js", 2 * MB, { startMs: 1_100, resourceType: "Script" }),
    req("/rapier.js", 1 * MB, { startMs: 1_500, resourceType: "Script" }),
    req("/late.glb", 50 * MB, { startMs: 9_000 }),
  ];

  it("counts only requests started between click and playable", () => {
    const r = evaluateWorld(requests, { clickMs: 1_000, playableMs: 4_000 });
    expect(r.summary.total).toBe(3 * MB);
    expect(r.timeMs).toBe(3_000);
    expect(r.gates.map((g) => g.status)).toEqual(["PASS", "PASS"]);
  });

  it("fails over 8 MB or over 10 s", () => {
    const r = evaluateWorld(requests, { clickMs: 1_000, playableMs: 12_000 });
    expect(r.gates.map((g) => g.status)).toEqual(["FAIL", "FAIL"]);
  });

  it("fails when the player never became controllable", () => {
    const r = evaluateWorld(requests, { clickMs: 1_000, playableMs: null });
    expect(r.timeMs).toBeNull();
    expect(r.gates.every((g) => g.status === "FAIL")).toBe(true);
  });
});

describe("worstOf (§8: gate on the worst of 3 cold loads)", () => {
  const run = (bytes: number, ms: number | null) => evaluateWorld([req("/w.js", bytes, { startMs: 1 })], { clickMs: 0, playableMs: ms });

  it("takes the largest value per gate; one failing run fails the gate", () => {
    const w = worstOf([run(1 * MB, 2_000), run(2 * MB, 11_000), run(1.5 * MB, 3_000)]);
    const time = w.gates.find((g) => g.id === "time-to-playable");
    expect(time?.measured).toBe(11_000);
    expect(time?.runs).toEqual([2_000, 11_000, 3_000]);
    expect(time?.status).toBe("FAIL");
    expect(w.gates.find((g) => g.id === "world-bytes")?.measured).toBe(2 * MB);
    expect(w.ok).toBe(false);
  });

  it("treats a missing measurement as worst and passes only when every run passes", () => {
    expect(worstOf([run(1 * MB, 2_000), run(1 * MB, null)]).ok).toBe(false);
    expect(worstOf([run(1 * MB, 2_000), run(1 * MB, 9_999)]).ok).toBe(true);
    expect(worstOf([]).ok).toBe(false);
  });

  it("renders a Markdown table with per-run columns and the worst column", () => {
    const md = formatMarkdown({ runs: [{ label: "Lần 1", gates: run(1 * MB, 2_000).gates }, { label: "Lần 2", gates: run(1 * MB, 12_000).gates }] });
    expect(md).toContain("| Gate (§8) | Ngưỡng | Lần 1 | Lần 2 | Xấu nhất | Kết quả |");
    expect(md).toMatch(/Time to playable \| ≤ 10 s \| 2\.00 s \| 12\.00 s ✗ \| 12\.00 s \| \*\*FAIL\*\*/);
    expect(md).toContain("Tổng: **FAIL**");
  });
});

describe("serve-gzip shouldCompress (CloudFront-like)", () => {
  it("compresses text types 1,000 B – 10,000,000 B only when the client accepts gzip", () => {
    expect(shouldCompress("text/javascript; charset=utf-8", 5_000, "gzip, deflate, br")).toBe(true);
    expect(shouldCompress("text/javascript; charset=utf-8", 999, "gzip")).toBe(false);
    expect(shouldCompress("text/javascript; charset=utf-8", 10_000_001, "gzip")).toBe(false);
    expect(shouldCompress("text/html; charset=utf-8", 5_000, "")).toBe(false);
    expect(shouldCompress("image/png", 50_000, "gzip")).toBe(false);
    expect(shouldCompress("font/woff2", 50_000, "gzip")).toBe(false);
  });
});

describe("CLI", () => {
  it("prints the table and exits 1 when a gate fails", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tqa-load-budget-"));
    tmpDirs.push(dir);
    const ok = path.join(dir, "ok.json");
    const bad = path.join(dir, "bad.json");
    const gates = (ms: number) => evaluateWorld([req("/w.js", 1 * MB, { startMs: 1 })], { clickMs: 0, playableMs: ms }).gates;
    writeFileSync(ok, JSON.stringify({ runs: [{ label: "Lần 1", gates: gates(3_000) }] }));
    writeFileSync(bad, JSON.stringify({ runs: [{ label: "Lần 1", gates: gates(30_000) }] }));
    const pass = spawnSync(process.execPath, [cli, ok], { encoding: "utf8" });
    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain("Tổng: **PASS**");
    expect(spawnSync(process.execPath, [cli, bad], { encoding: "utf8" }).status).toBe(1);
  });
});
