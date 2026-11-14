import { reportBudget } from "../report-budget";
﻿import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { flattenDressing, type DressingAsset } from "../../../../src/features/world/props/library-batch";
import { createLastPostcardDressing, lastPostcardDressingSites } from "../../../../src/features/world/zones/last-postcard-dressing";
import { createLastPostcardScene } from "../../../../src/features/world/zones/last-postcard";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { PATH_WIDTH, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { ZONE_BUDGET, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 108, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false };
const anchor = { x: 5.1, z: 0, sign: 1 };
const renderer = {} as WebGLRenderer;
function source(asset: DressingAsset) {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  root.add(new Mesh(geometry, material));
  const result = flattenDressing(root, asset); geometry.dispose(); material.dispose();
  return result;
}

describe("Last Postcard C dressing", () => {
  it("retains eight draws including the dressing, original collision boxes and bounded geometry", () => {
    const scene = createLastPostcardScene(context);
    try {
      const dressing = scene.group.getObjectByName("last-postcard-dressing") as Mesh;
      const sites = dressing.userData.sites;
      expect(sites.length).toBeGreaterThanOrEqual(8);
      expect(new Set(sites.map((site: { asset: string }) => site.asset)).size).toBe(6);
      let calls = 0, triangles = 0;
      scene.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        calls++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
      });
      expect(calls).toBe(8); reportBudget("tests/unit/world/zones/last-postcard-dressing.test.ts:37 calls", calls, ZONE_BUDGET.drawCalls);
      reportBudget("tests/unit/world/zones/last-postcard-dressing.test.ts:38 triangles", triangles, ZONE_BUDGET.triangles);
      let detailed = 0;
      for (const site of sites) {
        const bytes = readFileSync(`public/world/lib/${site.asset}-lod1.glb`);
        const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        for (const mesh of gltf.meshes) for (const part of mesh.primitives)
          detailed += gltf.accessors[part.indices ?? part.attributes.POSITION].count / 3;
      }
      const base = triangles - dressing.geometry.getAttribute("position").count / 3;
      reportBudget("tests/unit/world/zones/last-postcard-dressing.test.ts:47 base + detailed", base + detailed, ZONE_BUDGET.triangles);
      console.info(`GFX-Z-last-postcard detailed: ${base + detailed} triangles / ${calls} draws`);
      expect(scene.colliders).toHaveLength(8);
      expect(scene.interactable.position.toArray()).toEqual([4.75, expect.closeTo(2.135, 6), -0.45]);
      expect(scene.group.getObjectByName("last-postcard-wood")!.userData.photoSurface).toBe("bark");
      console.info(`GFX-Z-last-postcard flat: before 2394 triangles / 8 draws; after ${triangles} triangles / ${calls} draws; ${sites.length} sites`);
    } finally { scene.dispose(); }
  });

  it("checks filled envelopes on both banks and rejects small water/path intrusions", () => {
    const sites = lastPostcardDressingSites(context, anchor, []);
    expect(sites).toHaveLength(11);
    expect(sites).toEqual(lastPostcardDressingSites(context, anchor, []));
    expect(sites).not.toEqual(lastPostcardDressingSites({ ...context, seed: 109 }, anchor, []));
    const mirror = lastPostcardDressingSites(context, { x: -5.1, z: 0, sign: -1 }, []);
    expect(mirror.map(site => [site.x, site.z])).toEqual(sites.map(site => [-site.x, -site.z]));
    for (const patch of [{ underWater: () => true }, { onPath: () => true }, { heightAt: () => NaN }])
      expect(lastPostcardDressingSites({ ...context, ...patch }, anchor, [])).toEqual([]);
    const first = sites[0]!;
    const wet = { ...context, underWater: (x: number, z: number) => Math.abs(x - first.x) < 0.12 && Math.abs(z - first.z) < 0.12 };
    expect(lastPostcardDressingSites(wet, anchor, []).some(site => site.x === first.x && site.z === first.z)).toBe(false);
  });

  it("grounds all added vertices on the real shore without crossing the road or sea", () => {
    const [scene] = placeZoneScenes(surfaceHeight, ["last-postcard"]);
    try {
      const mesh = scene!.group.getObjectByName("last-postcard-dressing") as Mesh;
      const positions = mesh.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(0);
      for (let i = 0; i < positions.count; i++) {
        const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        expect(p.y).toBeGreaterThanOrEqual(surfaceHeight(p.x, p.z) - 0.026);
        expect(surfaceHeight(p.x, p.z)).toBeGreaterThan(waterLevelAt(p.z));
        expect(nearestPath(p.x, p.z).distance).toBeGreaterThan(PATH_WIDTH / 2);
      }
      console.info(`GFX-Z-last-postcard real terrain: ${mesh.userData.sites.length} sites, ${positions.count / 3} fallback triangles; transform ${scene!.group.position.toArray()} scale ${scene!.group.scale.toArray()}`);
    } finally { scene!.dispose(); }
  });

  it("loads only after playable paint, retains Low, deduplicates requests and culls by distance", async () => {
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => source(asset));
    const batch = createLastPostcardDressing(context, anchor, [], load), root = new Group();root.add(batch.mesh);
    try {
      const fallback = batch.mesh.geometry;
      batch.mesh.onAfterRender(renderer, new Scene(), new PerspectiveCamera(), fallback, batch.mesh.material, null!);
      expect(load).not.toHaveBeenCalled();
      setBakedPropQuality(root, "Low"); await batch.loadDetail(renderer); expect(load).not.toHaveBeenCalled();
      setBakedPropQuality(root, "High"); await batch.loadDetail(renderer); expect(load).toHaveBeenCalledTimes(6);
      const detail = batch.mesh.geometry; expect(detail).not.toBe(fallback);
      expect(detail.getAttribute("position").count / 3).toBe(11 * 12);
      setBakedPropQuality(root, "Low");expect(batch.mesh.geometry).toBe(fallback);
      setBakedPropQuality(root, "Balanced");expect(batch.mesh.geometry).toBe(detail);
      const camera = new PerspectiveCamera(), scene = new Scene(); batch.mesh.updateMatrixWorld(true);
      const render = () => batch.mesh.onBeforeRender(renderer, scene, camera, batch.mesh.geometry, batch.mesh.material, null!);
      camera.position.set(0, 2, 150);camera.updateMatrixWorld();render();expect(detail.drawRange.count).toBe(0);
      camera.position.set(5, 2, 0);camera.updateMatrixWorld();render();expect(detail.drawRange.count).toBe(Infinity);
      const releases = [fallback, detail, batch.mesh.material].map(resource => vi.spyOn(resource, "dispose"));
      batch.dispose();batch.dispose();releases.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    } finally { batch.dispose(); }
  });

  it("retains fallback on failed loads and releases a source arriving after teardown", async () => {
    const failed = createLastPostcardDressing(context, anchor, [], async () => { throw new Error("offline"); });
    try {
      const fallback = failed.mesh.geometry;
      await failed.loadDetail(renderer);
      expect(failed.mesh.geometry).toBe(fallback);
    } finally { failed.dispose(); }

    let resolve!: (value: ReturnType<typeof source>) => void;
    const late = createLastPostcardDressing(context, anchor, [], () => new Promise(done => { resolve = done; }));
    const pending = late.loadDetail(renderer);
    late.dispose();
    const loaded = source("rock-boulder-1"), release = vi.spyOn(loaded, "dispose");
    resolve(loaded);
    await pending;
    expect(release).toHaveBeenCalledOnce();
  });
});
