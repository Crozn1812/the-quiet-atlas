import { reportBudget } from "../report-budget";
import { readFileSync } from "node:fs";
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene,
  type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { flattenDressing, type DressingAsset, type LibrarySource } from "../../../../src/features/world/props/library-batch";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createRootsDressing, rootsDressingSites } from "../../../../src/features/world/zones/roots-dressing";
import { PATH_CLEARANCE, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 102, heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false };
const renderer = {} as WebGLRenderer;
function source(asset: DressingAsset): LibrarySource {
  const group = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  group.add(new Mesh(geometry, material));
  const result = flattenDressing(group, asset);
  geometry.dispose(); material.dispose();
  return result;
}
function moss() {
  const indexed = new BoxGeometry(), geometry = indexed.toNonIndexed(); indexed.dispose();
  geometry.translate(6.4, 0.5, 0);
  geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 3).fill(1), 3));
  return geometry;
}
const triangles = (mesh: Mesh) => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;

describe("Roots dressing", () => {
  it("follows mirrored/offset tree placement and protects the complete path, water and E footprints", () => {
    const sites = rootsDressingSites(context);
    expect(sites).toHaveLength(14);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
    expect(sites).toEqual(rootsDressingSites(context));
    expect(sites).not.toEqual(rootsDressingSites({ ...context, seed: 42 }));
    const mirror = rootsDressingSites(context, -1, 8);
    sites.forEach((site, i) => {
      expect(mirror[i]!.x).toBe(-site.x);
      expect(mirror[i]!.z).toBe(site.z + 8);
      // Neither the E target nor the Skills easel/approach is dressed over.
      expect(Math.hypot(site.x - 4.7, site.z)).toBeGreaterThan(3);
      expect(Math.hypot(site.x - 4.5, site.z + 6)).toBeGreaterThan(3);
    });
    for (const overrides of [{ underWater: () => true }, { onPath: () => true }, { heightAt: () => NaN }])
      expect(rootsDressingSites({ ...context, ...overrides })).toEqual([]);
    // Reject a wet corner even when the asset centre remains dry.
    const rock = sites[0]!;
    expect(rootsDressingSites({ ...context, underWater: (x, z) => x > rock.x + 0.7 && z > rock.z })
      .some(site => site.x === rock.x && site.z === rock.z)).toBe(false);
    const slope = createRootsDressing({ ...context, heightAt: (x, z) => x * 0.03 + z * 0.02 }, moss());
    const p = slope.mesh.geometry.getAttribute("position");
    for (let i = 36; i < p.count; i++) expect(p.getY(i) - (p.getX(i) * 0.03 + p.getZ(i) * 0.02)).toBeGreaterThanOrEqual(-0.02501);
    slope.dispose();
  });

  it("retains the root moss in both LODs, requests each source once after play, and culls without updates", async () => {
    const releases: ReturnType<typeof vi.fn>[] = [];
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => {
      const result = source(asset), dispose = vi.fn(result.dispose); releases.push(dispose);
      return { ...result, dispose };
    });
    const retained = moss(), releaseMoss = vi.spyOn(retained, "dispose");
    const batch = createRootsDressing(context, retained, 1, 0, load), root = new Group(); root.add(batch.mesh);
    const fallback = batch.mesh.geometry;
    expect(batch.mesh.geometry.groups).toHaveLength(0);
    expect("update" in batch).toBe(false);
    setBakedPropQuality(root, "Low"); await batch.loadDetail(renderer);
    expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(root, "High");
    const viewport = { getAttribute: (key: string) => key === "data-world-build" ? "done" : "playing" };
    const pendingRenderer = { domElement: { closest: () => viewport } } as unknown as WebGLRenderer;
    batch.mesh.onAfterRender(pendingRenderer, new Scene(), new PerspectiveCamera(), fallback, batch.mesh.material, null!);
    expect(load).not.toHaveBeenCalled();
    await batch.loadDetail(renderer);
    expect(load).toHaveBeenCalledTimes(6);
    expect(triangles(batch.mesh)).toBe(12 + 14 * 12);
    expect(Array.from(batch.mesh.geometry.getAttribute("position").array).slice(0, 108))
      .toEqual(Array.from(retained.getAttribute("position").array));
    const detail = batch.mesh.geometry, material = batch.mesh.material;
    const disposals = [fallback, detail, material].map(resource => vi.spyOn(resource, "dispose"));
    setBakedPropQuality(root, "Low"); expect(batch.mesh.geometry).toBe(fallback);
    setBakedPropQuality(root, "Balanced"); expect(batch.mesh.geometry).toBe(detail);
    const camera = new PerspectiveCamera(), scene = new Scene(); batch.mesh.updateMatrixWorld(true);
    for (const [z, count] of [[150, 0], [0, Infinity]]) {
      camera.position.set(0, 2, z!); camera.updateMatrixWorld();
      batch.mesh.onBeforeRender(renderer, scene, camera, detail, material, null!);
      expect(detail.drawRange.count).toBe(count);
    }
    batch.dispose(); batch.dispose();
    disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    releases.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(releaseMoss).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });

  it("keeps the authored moss on decode failure and releases a late result after teardown", async () => {
    const failed = createRootsDressing(context, moss(), 1, 0, async () => { throw new Error("offline"); });
    const fallback = failed.mesh.geometry;
    await failed.loadDetail(renderer); expect(failed.mesh.geometry).toBe(fallback); failed.dispose();
    let resolve!: (value: LibrarySource) => void;
    const batch = createRootsDressing(context, moss(), 1, 0, () => new Promise(done => { resolve = done; }));
    const pending = batch.loadDetail(renderer); batch.dispose();
    const late = source("prop-fern"), dispose = vi.spyOn(late, "dispose");
    resolve(late); await pending; expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps the real terrain dressing within the existing draw and triangle budgets", () => {
    const [zone] = placeZoneScenes(surfaceHeight, ["roots"]);
    try {
      const mesh = zone!.group.getObjectByName("roots-moss") as Mesh;
      expect(mesh.userData.dressingSites).toBeGreaterThan(0);
      const all: Mesh[] = []; zone!.group.traverse(node => { if (node instanceof Mesh) all.push(node); });
      const base = mesh.geometry.userData.mossVertices / 3;
      const fallbackTotal = all.reduce((sum, part) => sum + triangles(part), 0);
      const before = fallbackTotal - triangles(mesh) + base;
      const manifest = JSON.parse(readFileSync("public/world/lib/manifest.json", "utf8"));
      const costs = Object.fromEntries(manifest.assets.map((asset: { id: string; lods: { level: number; triangles: number }[] }) =>
        [asset.id, asset.lods.find(lod => lod.level === 1)!.triangles]));
      // The real Roots bank is mirrored; use the accepted interaction as the placement contract.
      // All 14 sites is a conservative bound if the real path/water rejects some.
      const sites = rootsDressingSites(context, Math.sign(zone!.interactable.position.x), zone!.interactable.position.z);
      const upperDetail = before + sites.reduce((sum, site) => sum + costs[site.asset], 0);
      reportBudget("tests/unit/world/zones/roots-dressing.test.ts:124 all.length", all.length, 8);
      reportBudget("tests/unit/world/zones/roots-dressing.test.ts:125 upperDetail", upperDetail, before * 1.25);
      console.info("GFX-Z-roots budget:", { before, fallback: fallbackTotal, highUpperBound: upperDetail,
        drawCallsBefore: all.length, drawCallsAfter: all.length, sites: mesh.userData.dressingSites, addedAssetBytes: 0 });
      console.info("GFX-Z-roots pose:", zone!.group.position.toArray(), zone!.group.quaternion.toArray());
    } finally { zone!.dispose(); }
  });
});
