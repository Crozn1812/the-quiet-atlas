import { reportBudget } from "../report-budget";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import { flattenDressing, type DressingAsset } from "../../../../src/features/world/props/library-batch";
import { createHorizonDressing, horizonDressingSites } from "../../../../src/features/world/zones/horizon-dressing";
import { horizonSites } from "../../../../src/features/world/zones/horizon";
import type { ZoneSceneContext } from "../../../../src/features/world/zones/types";
import library from "../../../../public/world/lib/manifest.json";

const flat: ZoneSceneContext = { seed: 106, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false };
const layout = horizonSites(flat);
function source(asset: DressingAsset) {
  const group = new Group(), material = new MeshStandardMaterial({ map: new Texture() });
  const mesh = new Mesh(new BoxGeometry(), material);
  group.add(mesh);
  const result = flattenDressing(group, asset);
  mesh.geometry.dispose(); material.dispose();
  return result;
}
function renderer(build = "done", intro = "done", paused = "false") {
  return { domElement: { closest: () => ({ getAttribute: (name: string) => ({
    "data-world-build": build, "data-world-intro": intro, "data-world-paused": paused,
  })[name] }) } } as unknown as WebGLRenderer;
}
function paint(batch: NonNullable<ReturnType<typeof createHorizonDressing>>, device: WebGLRenderer, camera = new PerspectiveCamera()) {
  batch.mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const scene = new Scene(), mesh = batch.mesh;
  mesh.onBeforeRender(device, scene, camera, mesh.geometry, mesh.material, null!);
  mesh.onAfterRender(device, scene, camera, mesh.geometry, mesh.material, null!);
}

describe("Horizon C dressing", () => {
  it("stays below the zone triangle budget with the actual CC0 LOD1 counts", () => {
    const sites = horizonDressingSites(flat, layout, []);
    const detail = sites.reduce((sum, site) => sum + library.assets.find(asset => asset.id === site.asset)!.lods[1]!.triangles, 0);
    const batch = createHorizonDressing(flat, layout, [])!;
    try {
      const fallback = batch.mesh.geometry.getAttribute("position").count / 3;
      reportBudget("tests/unit/world/zones/horizon-dressing.test.ts:39 detail", detail, 6000 - 1262);
      expect(fallback).toBeLessThan(detail);
      process.stdout.write(`GFX-Z-horizon flat: 7 -> 8 draws; 1262 -> ${1262 + fallback} fallback triangles; dressing LOD1=${detail} triangles (base deferred props counted separately)\n`);
    } finally { batch.dispose(); }
  });
  it("keeps deterministic stone/fern/grass/log islands away from water, path and interaction approaches", () => {
    const sites = horizonDressingSites(flat, layout, []);
    expect(sites).toHaveLength(25);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
    expect(sites).toEqual(horizonDressingSites(flat, layout, []));
    expect(sites).not.toEqual(horizonDressingSites({ ...flat, seed: 107 }, layout, []));
    for (const site of sites) {
      if (site.x > 0 && site.x < layout.bench[0] + 0.9) expect(Math.abs(site.z - layout.bench[1])).toBeGreaterThan(1.7);
      expect(Math.abs(site.x)).toBeGreaterThan(2.6);
    }
    for (const context of [{ ...flat, underWater: () => true }, { ...flat, onPath: () => true }, { ...flat, heightAt: () => NaN }]) {
      expect(horizonDressingSites(context, layout, [])).toEqual([]);
      expect(createHorizonDressing(context, layout, [])).toBeUndefined();
    }
    // Reject even an interior wet sample, and a box intersecting only the edge.
    const rock = sites[0]!;
    expect(horizonDressingSites({ ...flat, underWater: (x, z) => Math.abs(x - rock.x) < 0.18 && Math.abs(z - rock.z) < 0.18 }, layout, [])).not.toContainEqual(rock);
    expect(horizonDressingSites(flat, layout, [{ center: new Vector3(rock.x + 0.8, 0, rock.z), size: new Vector3(0.1, 1, 0.1) }])).not.toContainEqual(rock);
  });

  it("grounds the complete batch on slopes without adding raycast targets or simulation updates", () => {
    const heightAt = (x: number, z: number) => x * 0.08 + z * 0.04;
    const batch = createHorizonDressing({ ...flat, heightAt }, layout, [])!;
    try {
      expect(batch.mesh.geometry.groups).toEqual([]);
      expect(batch.mesh.castShadow).toBe(false);
      expect(batch.mesh.material).toBeInstanceOf(MeshStandardMaterial);
      const p = batch.mesh.geometry.getAttribute("position");
      let bottom = Infinity;
      for (let i = 0; i < p.count; i++) bottom = Math.min(bottom, p.getY(i) - heightAt(p.getX(i), p.getZ(i)));
      expect(bottom).toBeCloseTo(-0.025, 5);
      const hits: never[] = [];
      batch.mesh.raycast(null!, hits);
      expect(hits).toEqual([]);
      expect(batch).not.toHaveProperty("update");
    } finally { batch.dispose(); }
  });

  it("defers decoders until visible/playable/unpaused High, restores Low, and releases each source once", async () => {
    const releases: ReturnType<typeof vi.fn>[] = [];
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => {
      const loaded = source(asset), dispose = vi.fn(loaded.dispose);
      releases.push(dispose);
      return { ...loaded, dispose };
    });
    const batch = createHorizonDressing(flat, layout, [], load)!;
    const fallback = batch.mesh.geometry;
    try {
      setBakedPropQuality(batch.mesh, "Low");
      paint(batch, renderer());
      await batch.loadDetail(renderer());
      expect(load).not.toHaveBeenCalled();
      setBakedPropQuality(batch.mesh, "High");
      paint(batch, renderer("building"));
      paint(batch, renderer("done", "running"));
      paint(batch, renderer("done", "done", "true"));
      const far = new PerspectiveCamera(); far.position.set(500, 0, 0);
      paint(batch, renderer(), far);
      expect(batch.mesh.geometry.drawRange.count).toBe(0);
      expect(load).not.toHaveBeenCalled();
      paint(batch, renderer());
      await vi.waitFor(() => expect(batch.mesh.geometry).not.toBe(fallback));
      expect(load).toHaveBeenCalledTimes(6);
      expect(batch.mesh.geometry.groups).toEqual([]);
      setBakedPropQuality(batch.mesh, "Low");
      expect(batch.mesh.geometry).toBe(fallback);
      setBakedPropQuality(batch.mesh, "High");
      const detail = batch.mesh.geometry, releaseDetail = vi.spyOn(detail, "dispose");
      batch.dispose(); batch.dispose();
      releases.forEach(release => expect(release).toHaveBeenCalledOnce());
      expect(releaseDetail).toHaveBeenCalledOnce();
    } finally { batch.dispose(); }
  });

  it("retains the full fallback on failure and releases a source arriving after disposal", async () => {
    const failed = createHorizonDressing(flat, layout, [], async () => { throw new Error("offline"); })!;
    const fallback = failed.mesh.geometry;
    await failed.loadDetail(renderer());
    expect(failed.mesh.geometry).toBe(fallback);
    failed.dispose();
    let resolve!: (value: ReturnType<typeof source>) => void;
    const late = createHorizonDressing(flat, layout, [], () => new Promise(done => { resolve = done; }))!;
    const pending = late.loadDetail(renderer());
    late.dispose();
    const loaded = source("rock-boulder-1"), dispose = vi.spyOn(loaded, "dispose");
    resolve(loaded); await pending;
    expect(dispose).toHaveBeenCalledOnce();
  });
});
