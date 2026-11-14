import { readFileSync } from "node:fs";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { flattenDressing, type DressingAsset, type LibrarySource } from "../../../../src/features/world/props/library-batch";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { createMilestonesDressing, milestonesDressingSites } from "../../../../src/features/world/zones/milestones-dressing";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 104, heightAt: () => 0, onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false };
const renderer = {} as WebGLRenderer;
function source(asset: DressingAsset): LibrarySource {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  root.add(new Mesh(geometry, material));
  try { return flattenDressing(root, asset); }
  finally { geometry.dispose(); material.dispose(); }
}
function assetTriangles(asset: DressingAsset) {
  const buffer = readFileSync(`public/world/lib/${asset}-lod1.glb`);
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  return gltf.meshes.flatMap((mesh: { primitives: { indices: number }[] }) => mesh.primitives)
    .reduce((sum: number, primitive: { indices: number }) => sum + gltf.accessors[primitive.indices].count / 3, 0) as number;
}

describe("Milestones static dressing", () => {
  it("composes three different stones, damp fern pockets, sunny grass and a fallen log deterministically", () => {
    const sites = milestonesDressingSites(context, 1, 0);
    expect(sites).toHaveLength(16);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
    expect(new Set(sites.filter(site => site.asset.startsWith("rock")).map(site => site.size)).size).toBe(3);
    expect(sites).toEqual(milestonesDressingSites(context, 1, 0));
    expect(sites).not.toEqual(milestonesDressingSites({ ...context, seed: 105 }, 1, 0));
    const mirrored = milestonesDressingSites(context, -1, -12);
    expect(mirrored).toEqual(sites.map(site => ({ ...site, x: -site.x, z: site.z - 12, yaw: -site.yaw })));
    for (const patch of [{ underWater: () => true }, { onPath: () => true }, { heightAt: () => NaN }])
      expect(milestonesDressingSites({ ...context, ...patch }, 1, 0)).toEqual([]);
    const wetEdge = milestonesDressingSites({ ...context, underWater: x => x > 7.7 && x < 7.8 }, 1, 0);
    expect(wetEdge.find(site => site.asset === "rock-boulder-3")).toBeUndefined();
  });

  it("fits the real hillside and budgets both the fallback and every deferred LOD1 instance", () => {
    const [zone] = placeZoneScenes(surfaceHeight, ["milestones"]);
    try {
      let triangles = 0, calls = 0;
      zone!.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        calls++;
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
      });
      expect(calls).toBe(6);
      expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
      const batch = createMilestonesDressing(context, 1, 0);
      try {
        const fallbackTriangles = batch.mesh.geometry.getAttribute("position").count / 3;
        const detailTriangles = milestonesDressingSites(context, 1, 0).reduce((sum, site) => sum + assetTriangles(site.asset), 0);
        expect(fallbackTriangles).toBeLessThanOrEqual(700);
        expect(detailTriangles).toBeLessThanOrEqual(2000);
        expect(2639 + detailTriangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
        expect(batch.mesh.material).toBeInstanceOf(MeshStandardMaterial);
      } finally { batch.dispose(); }
      const stones: Mesh[] = [];
      zone!.group.traverse(object => { if (object instanceof Mesh && ["weathered", "future"].includes(object.userData.milestonesSurface)) stones.push(object); });
      expect(stones).toHaveLength(2);
      expect(stones.every(mesh => mesh.name === "rock-stack-stones")).toBe(true);
      expect(stones[0]!.material).toBe(stones[1]!.material);
    } finally { zone!.dispose(); }
  });

  it("defers Low requests, restores its fallback, culls by distance and releases all owned resources once", async () => {
    const released: ReturnType<typeof vi.fn>[] = [];
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => {
      const loaded = source(asset), release = vi.fn(loaded.dispose); released.push(release);
      return { ...loaded, dispose: release };
    });
    const batch = createMilestonesDressing(context, 1, 0, load), root = new Group();
    root.add(batch.mesh);
    const fallback = batch.mesh.geometry;
    setBakedPropQuality(root, "Low"); await batch.loadDetail(renderer);
    expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(root, "High"); await batch.loadDetail(renderer);
    expect(load).toHaveBeenCalledTimes(6);
    const detail = batch.mesh.geometry;
    expect(detail).not.toBe(fallback);
    setBakedPropQuality(root, "Low"); expect(batch.mesh.geometry).toBe(fallback);
    setBakedPropQuality(root, "Balanced"); expect(batch.mesh.geometry).toBe(detail);
    const camera = new PerspectiveCamera(), scene = new Scene();
    root.updateMatrixWorld(true);
    for (const [distance, count] of [[0, Infinity], [160, 0], [0, Infinity]]) {
      camera.position.set(0, 2, distance!); camera.updateMatrixWorld();
      batch.mesh.onBeforeRender(renderer, scene, camera, batch.mesh.geometry, batch.mesh.material, null!);
      expect(batch.mesh.geometry.drawRange.count).toBe(count);
    }
    const disposals = [fallback, detail, batch.mesh.material].map(resource => vi.spyOn(resource, "dispose"));
    batch.dispose(); batch.dispose();
    disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    released.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(root.children).toHaveLength(0);
  });

  it("retains its complete fallback on failure and releases a load arriving after disposal", async () => {
    const failed = createMilestonesDressing(context, 1, 0, async () => { throw new Error("offline"); });
    const original = failed.mesh.geometry;
    await failed.loadDetail(renderer); expect(failed.mesh.geometry).toBe(original); failed.dispose();
    let resolve!: (value: LibrarySource) => void;
    const late = createMilestonesDressing(context, 1, 0, () => new Promise(done => { resolve = done; }));
    const pending = late.loadDetail(renderer);
    late.dispose();
    const loaded = source("rock-boulder-1"), release = vi.spyOn(loaded, "dispose");
    resolve(loaded); await pending;
    expect(release).toHaveBeenCalledOnce();
  });
});
