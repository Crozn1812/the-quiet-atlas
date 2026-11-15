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

it("keeps legacy geometry/fade identity on Low and never requests the retired tree library", () => {
  const fetch = serveAssets();
  vi.stubGlobal("window", { setTimeout });
  const foliage = createFoliage(2), crowns = foliage.species.broadleaf.crowns;
  const original = crowns.geometry;
  const alpha = new InstancedBufferAttribute(new Float32Array([.4, 1]), 1);
  original.setAttribute("crownAlpha", alpha);
  try {
    for (const quality of ["High", "Low", "High"] as const) {
      foliage.setQuality(quality); updateFoliageWind([crowns], 1 / 60, true);
      expect(crowns.geometry).toBe(original);
      expect(crowns.geometry.getAttribute("crownAlpha")).toBe(alpha);
      expect(fetch).not.toHaveBeenCalled();
    }
  } finally { foliage.dispose(); }
});
