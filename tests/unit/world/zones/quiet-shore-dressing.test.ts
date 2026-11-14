import { reportBudget } from "../report-budget";
import { readFileSync } from "node:fs";
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene,
  Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { flattenDressing, type DressingAsset, type DressingSite, type LibrarySource } from "../../../../src/features/world/props/library-batch";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createQuietShoreDressing, quietShoreDressingSites } from "../../../../src/features/world/zones/quiet-shore-dressing";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 107, heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false };
const porch = { x: 6, z: 9, side: 1 };
const renderer = {} as WebGLRenderer;
function moss() {
  const box = new BoxGeometry(), geometry = box.toNonIndexed(); box.dispose();
  geometry.translate(6, 0.5, 9);
  geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 3).fill(1), 3));
  return geometry;
}
function source(asset: DressingAsset): LibrarySource {
  const group = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  group.add(new Mesh(geometry, material));
  const result = flattenDressing(group, asset); geometry.dispose(); material.dispose();
  return result;
}
const triangles = (mesh: Mesh) => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;

describe("Quiet Shore direction-C dressing", () => {
  it("follows both porch frames and rejects wet corners, paths, solids and invalid terrain", () => {
    const sites = quietShoreDressingSites(context, porch);
    expect(sites).toHaveLength(7);
    expect(sites).toEqual(quietShoreDressingSites(context, porch));
    expect(sites).not.toEqual(quietShoreDressingSites({ ...context, seed: 42 }, porch));
    const opposite = quietShoreDressingSites(context, { x: -6, z: -4, side: -1 });
    sites.forEach((site, i) => {
      expect(opposite[i]!.x).toBe(-site.x);
      expect(opposite[i]!.z).toBeCloseTo(5 - site.z);
      expect(opposite[i]!.yaw).toBeCloseTo(site.yaw + Math.PI);
      expect(Math.hypot(site.x - 4.79, site.z - 9.35)).toBeGreaterThan(2.5);
    });
    for (const overrides of [{ underWater: () => true }, { onPath: () => true }, { heightAt: () => NaN }, { heightAt: () => 40 }])
      expect(quietShoreDressingSites({ ...context, ...overrides }, porch)).toEqual([]);
    const rock = sites[0]!;
    expect(quietShoreDressingSites({ ...context, underWater: (x, z) => x > rock.x + 0.6 && z > rock.z }, porch)
      .some(site => site.x === rock.x && site.z === rock.z)).toBe(false);
    expect(quietShoreDressingSites(context, porch, [{ center: new Vector3(rock.x, 0, rock.z), size: new Vector3(1, 1, 1) }]))
      .not.toContainEqual(rock);
    const slope = createQuietShoreDressing({ ...context, heightAt: (x, z) => x * 0.03 + z * 0.02 }, moss(), porch, []);
    const positions = slope.mesh.geometry.getAttribute("position");
    for (let i = 36; i < positions.count; i++)
      expect(positions.getY(i) - positions.getX(i) * 0.03 - positions.getZ(i) * 0.02).toBeGreaterThanOrEqual(-0.02501);
    slope.dispose();
  });

  it("defers unique assets until play, keeps moss through quality changes, culls and disposes once", async () => {
    const releases: ReturnType<typeof vi.fn>[] = [];
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => {
      const result = source(asset), dispose = vi.fn(result.dispose); releases.push(dispose);
      return { ...result, dispose };
    });
    const retained = moss(), releaseMoss = vi.spyOn(retained, "dispose");
    const batch = createQuietShoreDressing(context, retained, porch, [], load), root = new Group(); root.add(batch.mesh);
    const fallback = batch.mesh.geometry;
    expect("update" in batch).toBe(false);
    expect(fallback.groups).toHaveLength(0);
    setBakedPropQuality(root, "Low"); await batch.loadDetail(renderer); expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(root, "High");
    const viewport = { getAttribute: (key: string) => key === "data-world-build" ? "done" : "playing" };
    const pendingRenderer = { domElement: { closest: () => viewport } } as unknown as WebGLRenderer;
    batch.mesh.onAfterRender(pendingRenderer, new Scene(), new PerspectiveCamera(), fallback, batch.mesh.material, null!);
    expect(load).not.toHaveBeenCalled();
    await batch.loadDetail(renderer); expect(load).toHaveBeenCalledTimes(5);
    expect(triangles(batch.mesh)).toBe(12 + 7 * 12);
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
    expect(releaseMoss).toHaveBeenCalledOnce(); expect(root.children).toHaveLength(0);
  });

  it("keeps its fallback on missing assets and releases results arriving after teardown", async () => {
    const failed = createQuietShoreDressing(context, moss(), porch, [], async () => { throw new Error("offline"); });
    const fallback = failed.mesh.geometry;
    await failed.loadDetail(renderer); expect(failed.mesh.geometry).toBe(fallback); failed.dispose();
    let resolve!: (value: LibrarySource) => void;
    const batch = createQuietShoreDressing(context, moss(), porch, [], () => new Promise(done => { resolve = done; }));
    const pending = batch.loadDetail(renderer); batch.dispose();
    const late = source("prop-fern"), dispose = vi.spyOn(late, "dispose");
    resolve(late); await pending; expect(dispose).toHaveBeenCalledOnce();
  });

  it("fits the real terrain within 6000 triangles and the existing draws, using only existing assets", () => {
    const [zone] = placeZoneScenes(surfaceHeight, ["quiet-shore"]);
    try {
      const meshes: Mesh[] = []; zone!.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
      const leaf = zone!.group.getObjectByName("quiet-shore-leaf") as Mesh;
      const sites = leaf.userData.dressingSites as DressingSite[];
      expect(sites).toHaveLength(7);
      const manifest = JSON.parse(readFileSync("public/world/lib/manifest.json", "utf8"));
      const costs = Object.fromEntries(manifest.assets.map((asset: { id: string; lods: { level: number; triangles: number }[] }) =>
        [asset.id, asset.lods.find(lod => lod.level === 1)!.triangles]));
      const fallbackTotal = meshes.reduce((sum, mesh) => sum + triangles(mesh), 0);
      const retained = leaf.geometry.userData.retainedVertices / 3;
      const high = fallbackTotal - triangles(leaf) + retained + sites.reduce((sum, site) => sum + costs[site.asset], 0);
      reportBudget("tests/unit/world/zones/quiet-shore-dressing.test.ts:118 meshes.length", meshes.length, ZONE_BUDGET.drawCalls);
      reportBudget("tests/unit/world/zones/quiet-shore-dressing.test.ts:119 fallbackTotal", fallbackTotal, ZONE_BUDGET.triangles);
      reportBudget("tests/unit/world/zones/quiet-shore-dressing.test.ts:120 high", high, ZONE_BUDGET.triangles);
      reportBudget("tests/unit/world/zones/quiet-shore-dressing.test.ts:121 high", high, 5465 * 1.25);
      process.stdout.write(`GFX-Z-quiet-shore: ${JSON.stringify({ fallback: fallbackTotal, high, draws: meshes.length,
        sites, addedAssetBytes: 0, anchor: zone!.group.position.toArray(), rotation: zone!.group.quaternion.toArray(), scale: zone!.group.scale.toArray() })}\n`);
    } finally { zone!.dispose(); }
  });
});
