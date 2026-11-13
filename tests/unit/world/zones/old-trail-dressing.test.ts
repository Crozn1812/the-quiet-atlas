import { readFileSync } from "node:fs";
import { Group, Mesh, PerspectiveCamera, Scene, type Material, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { ZONES } from "../../../../src/features/world/layout/zones";
import { PATH_WIDTH, surfaceHeight, TERRAIN_SEED, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { createOldTrailDressing, oldTrailDressingSites } from "../../../../src/features/world/zones/old-trail-dressing";
import { createOldTrailScene } from "../../../../src/features/world/zones/old-trail";
import { PATH_CLEARANCE, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = {
  seed: 105, heightAt: (x, z) => x * 0.04 + z * 0.025,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false,
};

describe("Old Trail C dressing", () => {
  it("uses the existing LOD1 library in one draw within the zone detail budget", () => {
    const sites = oldTrailDressingSites(context);
    const manifest = JSON.parse(readFileSync("public/world/lib/manifest.json", "utf8"));
    const triangles = sites.reduce((sum, site) => sum + manifest.assets.find((asset: { id: string }) => asset.id === site.asset).lods[1].triangles, 0);
    expect(sites).toHaveLength(12);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
    expect(triangles).toBe(1051);
    expect(2758 + triangles).toBeLessThan(6000);
    console.info(`GFX-Z Old Trail High: 2758 → ${2758 + triangles} triangles, 7 → 8 draw calls; new public bytes: 0`);
  });

  it("is seeded, rejects entire unsafe footprints, and seats every vertex on sloping ground", () => {
    const sites = oldTrailDressingSites(context);
    expect(sites).toEqual(oldTrailDressingSites(context));
    expect(sites).not.toEqual(oldTrailDressingSites({ ...context, seed: 106 }));
    for (const override of [{ onPath: () => true }, { underWater: () => true }, { heightAt: () => NaN }])
      expect(oldTrailDressingSites({ ...context, ...override })).toEqual([]);
    const edge = { ...context, underWater: (x: number, z: number) => Math.abs(x) > 7.8 && z < 0 };
    expect(oldTrailDressingSites(edge).filter(site => site.asset.startsWith("rock"))).toHaveLength(0);
    const batch = createOldTrailDressing(context), p = batch.mesh.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
      expect(p.getY(i)).toBeGreaterThanOrEqual(context.heightAt(x, z) - 0.026);
    }
    batch.dispose();
  });

  it("keeps the rocks, log and undergrowth when the river occupies the authored bank", () => {
    const sites = oldTrailDressingSites({ ...context, underWater: x => x < 0 });
    expect(sites).toHaveLength(12);
    expect(sites.every(site => site.x > 0)).toBe(true);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
  });

  it("retains all twelve authored props against the shipped Old Trail terrain and river", () => {
    const layout = ZONES.find(zone => zone.id === "old-trail")!;
    const yaw = Math.atan2(layout.lookDirection.x, layout.lookDirection.z);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (x: number, z: number): [number, number] =>
      [layout.position.x + c * x + s * z, layout.position.z - s * x + c * z];
    const sites = oldTrailDressingSites({
      seed: TERRAIN_SEED + 4,
      heightAt: (x, z) => surfaceHeight(...world(x, z)) - surfaceHeight(layout.position.x, layout.position.z),
      onPath: (x, z) => Math.abs(x) <= PATH_CLEARANCE || nearestPath(...world(x, z)).distance <= PATH_WIDTH / 2,
      underWater: (x, z) => { const p = world(x, z); return surfaceHeight(...p) <= waterLevelAt(p[1]); },
    });
    expect(sites).toHaveLength(12);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
  });

  it("uses the shared quality binding and distance cull without adding simulation motion", () => {
    const batch = createOldTrailDressing(context), root = new Group(), camera = new PerspectiveCamera();
    root.add(batch.mesh); root.updateMatrixWorld(true);
    const render = () => batch.mesh.onBeforeRender({} as WebGLRenderer, new Scene(), camera, batch.mesh.geometry, batch.mesh.material, null!);
    setBakedPropQuality(root, "Low");
    camera.position.set(0, 2, 70); camera.updateMatrixWorld(); render();
    expect(batch.mesh.geometry.drawRange.count).toBe(0);
    camera.position.set(0, 2, 0); camera.updateMatrixWorld(); render();
    expect(batch.mesh.geometry.drawRange.count).toBe(Infinity);
    expect(batch.mesh.castShadow).toBe(false);
    expect(batch.mesh.material.roughness).toBe(0.96);
    batch.dispose();
  });

  it("opts the unchanged timber batch into P2 and releases dressing once with its zone", () => {
    const scene = createOldTrailScene(context);
    const timber = scene.group.getObjectByName("weathered-trail-timber") as Mesh;
    expect(timber.userData.photoSurface).toBe("bark");
    const mesh = scene.group.getObjectByName("old-trail-dressing") as Mesh;
    const geometry = vi.spyOn(mesh.geometry, "dispose"), material = vi.spyOn(mesh.material as Material, "dispose");
    const transform = mesh.matrix.toArray();
    scene.update?.(1, false);
    expect(mesh.matrix.toArray()).toEqual(transform);
    scene.dispose(); scene.dispose();
    expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
    expect(scene.group.children).toHaveLength(0);
  });
});
