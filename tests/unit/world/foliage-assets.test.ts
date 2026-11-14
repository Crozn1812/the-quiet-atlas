import { reportBudget } from "./report-budget";
import { readFile } from "node:fs/promises";
import { InstancedBufferAttribute } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { createFoliage, updateFoliageWind } from "../../../src/features/world/foliage/instances";
import { createBroadleafCrown, fitAuthoredTree, loadAuthoredTrees } from "../../../src/features/world/foliage/shapes";

afterEach(() => vi.unstubAllGlobals());

it("rejects malformed authored attributes before touching the procedural fallback", () => {
  const template = createBroadleafCrown();
  const malformed = template.clone();
  malformed.deleteAttribute("color");
  const positions = Array.from(template.getAttribute("position").array);
  try {
    expect(() => fitAuthoredTree(malformed, template)).toThrow("Invalid authored tree attribute: color");
    expect(Array.from(template.getAttribute("position").array)).toEqual(positions);
  } finally { malformed.dispose(); template.dispose(); }
});

function serveAssets() {
  vi.stubGlobal("ProgressEvent", class { constructor(public type: string) {} });
  const fetch = vi.fn(async (request: Request) => {
    const file = await readFile(`public${new URL(request.url).pathname}`);
    return new Response(file, { headers: { "Content-Length": String(file.byteLength) } });
  });
  vi.stubGlobal("fetch", fetch);
  // GLTFLoader uses browser-relative URLs; Node's Request needs an origin.
  const NativeRequest = Request;
  vi.stubGlobal("Request", class extends NativeRequest {
    constructor(input: string, init?: RequestInit) { super(new URL(input, "http://localhost:4302"), init); }
  });
  return fetch;
}

it("decodes six real meshopt GLBs with vertex AO and fits the existing triangle slots", async () => {
  serveAssets();
  const assets = await loadAuthoredTrees();
  const template = createBroadleafCrown();
  const alpha = new InstancedBufferAttribute(new Float32Array([.4]), 1);
  template.setAttribute("crownAlpha", alpha);
  try {
    expect(assets).toHaveLength(6);
    expect(new Set(assets.map(asset => Array.from(asset.getAttribute("position").array).join(","))).size).toBe(6);
    for (const [index, asset] of assets.entries()) {
      const triangles = asset.getAttribute("position").count / 3;
      expect(triangles).toBe(index < 3 ? 460 : 380);
      reportBudget("tests/unit/world/foliage-assets.test.ts:47 triangles", triangles, index < 3 ? 1200 : 1500);
      expect(new Set(asset.getAttribute("color").array).size).toBeGreaterThan(20);
      if (index < 3) continue;
      const fitted = fitAuthoredTree(asset, template);
      expect(fitted.getAttribute("position").count).toBe(template.index!.count);
      expect(fitted.getAttribute("crownAlpha")).toBe(alpha);
      asset.computeBoundingBox();
      expect(asset.boundingBox!.min.y).toBeCloseTo(-5, 1);
      const surface = fitted.getAttribute("surface"), p = fitted.getAttribute("position");
      const original = template.toNonIndexed();
      for (let i = 0; i < surface.count; i++) if (surface.getX(i) === 2) {
        expect(p.getY(i)).toBe(original.getAttribute("position").getY(i));
      }
      original.dispose(); fitted.dispose();
    }
  } finally { template.dispose(); assets.forEach(asset => asset.dispose()); }
});

it("defers fetch until play, retains fade/mesh identity and restores Low geometry", async () => {
  const fetch = serveAssets();
  vi.stubGlobal("window", { setTimeout });
  const foliage = createFoliage(2);
  const crowns = foliage.species.broadleaf.crowns;
  const original = crowns.geometry;
  const variants = Object.values(foliage.species).flatMap(species => species.variants);
  const before = variants.map(({ crowns }) => crowns.geometry.index!.count / 3 + 42);
  const alpha = new InstancedBufferAttribute(new Float32Array([.4, 1]), 1);
  original.setAttribute("crownAlpha", alpha);
  try {
    updateFoliageWind([crowns], 0, false);
    expect(fetch).not.toHaveBeenCalled();
    foliage.setQuality("Low");
    updateFoliageWind([crowns], 1 / 60, false);
    expect(fetch).not.toHaveBeenCalled();
    foliage.setQuality("High");
    updateFoliageWind([crowns], 1 / 60, true);
    await vi.waitFor(() => expect(crowns.geometry).not.toBe(original), { timeout: 10000 });
    expect(fetch).toHaveBeenCalledTimes(6);
    for (const variant of variants) {
      expect(variant.crowns.geometry.index).toBeNull();
      for (const name of ["position", "normal", "color", "shapeA", "shapeB", "trailShape"]) {
        expect(Array.from(variant.crowns.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      }
    }
    expect(crowns.geometry.getAttribute("crownAlpha")).toBe(alpha);
    expect(crowns.geometry.getAttribute("position").count).toBe(original.index!.count);
    expect(foliage.group.children).toHaveLength(10);
    const after = variants.map(({ crowns }) => crowns.geometry.getAttribute("position").count / 3 + 42);
    expect(after).toEqual(before);
    process.stdout.write(`G-02 submitted triangles/tree: ${before.join("/")} -> ${after.join("/")}; slots=10 -> 10; extra passes=0\n`);
    const authored = crowns.geometry;
    foliage.setQuality("Low");
    expect(crowns.geometry).toBe(original);
    foliage.setQuality("High");
    expect(crowns.geometry).toBe(authored);
  } finally { foliage.dispose(); }
});
