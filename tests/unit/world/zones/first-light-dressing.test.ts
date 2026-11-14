import { reportBudget } from "../report-budget";
import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderLib, Texture,
  type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createFirstLightDressing, firstLightDressingSites } from "../../../../src/features/world/zones/first-light-dressing";
import { createLibraryBatch, flattenDressing, type DressingAsset, type LibrarySource } from "../../../../src/features/world/props/library-batch";
import { setBakedPropQuality } from "../../../../src/features/world/props/batched";
import type { ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = { seed: 101, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false };
const renderer = {} as WebGLRenderer;
function source(asset: DressingAsset): LibrarySource {
  const root = new Group();
  const material = new MeshStandardMaterial({ color: new Color(0.2, 0.3, 0.15), map: new Texture() });
  root.add(new Mesh(new BoxGeometry(), material));
  const result = flattenDressing(root, asset);
  root.children.forEach(child => (child as Mesh).geometry.dispose()); material.dispose();
  return result;
}
function fallback() { const asset = source("prop-grass"); asset.maps.fill(null); return asset.geometry; }
const triangles = (mesh: Mesh) => mesh.geometry.getAttribute("position").count / 3;

describe("First Light library dressing", () => {
  it("authors uneven clusters with deterministic variation and rejects wet/path footprints", () => {
    const sites = firstLightDressingSites(context);
    expect(sites).toHaveLength(10);
    expect(new Set(sites.map(site => site.asset)).size).toBe(6);
    expect(sites).toEqual(firstLightDressingSites(context));
    expect(sites).not.toEqual(firstLightDressingSites({ ...context, seed: 102 }));
    expect(firstLightDressingSites({ ...context, underWater: () => true })).toEqual([]);
    expect(firstLightDressingSites({ ...context, onPath: () => true })).toEqual([]);
    expect(firstLightDressingSites({ ...context, heightAt: () => NaN })).toEqual([]);
  });

  it("preserves normalized attributes, source pigment, UVs and cutout routing", () => {
    const asset = source("prop-fern");
    expect(asset.maps[1]).toBeInstanceOf(Texture);
    expect(new Set(asset.geometry.getAttribute("dressingSurface").array)).toEqual(new Set([1]));
    expect(asset.geometry.getAttribute("uv").count).toBe(36);
    const color = asset.geometry.getAttribute("color");
    expect(color.getX(0)).toBeCloseTo(0.2);
    expect(color.getY(0)).toBeCloseTo(0.3);
    asset.dispose();
  });

  it("defers all requests on Low, reuses each source, restores Low and disposes once", async () => {
    const sites = firstLightDressingSites(context), released: ReturnType<typeof vi.fn>[] = [];
    const load = vi.fn(async (_renderer: WebGLRenderer, asset: DressingAsset) => {
      const loaded = source(asset), release = vi.fn(loaded.dispose); released.push(release);
      return { ...loaded, dispose: release };
    });
    const batch = createLibraryBatch(fallback(), sites, context.heightAt, load), root = new Group();
    root.add(batch.mesh);
    const original = batch.mesh.geometry;
    setBakedPropQuality(root, "Low"); await batch.loadDetail(renderer);
    expect(load).not.toHaveBeenCalled();
    setBakedPropQuality(root, "High"); await batch.loadDetail(renderer);
    expect(load).toHaveBeenCalledTimes(6);
    expect(triangles(batch.mesh)).toBe(120);
    const detail = batch.mesh.geometry;
    setBakedPropQuality(root, "Low"); expect(batch.mesh.geometry).toBe(original);
    setBakedPropQuality(root, "Balanced"); expect(batch.mesh.geometry).toBe(detail);
    const resources = [original, detail, batch.mesh.material];
    const disposals = resources.map(resource => vi.spyOn(resource, "dispose"));
    batch.dispose(); batch.dispose();
    disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    released.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(root.children).toHaveLength(0);
  });

  it("culls the entire batch by distance and returns it without a simulation update", () => {
    const batch = createFirstLightDressing(context), camera = new PerspectiveCamera(), scene = new Scene();
    batch.mesh.updateMatrixWorld(true);
    const render = () => batch.mesh.onBeforeRender(renderer, scene, camera, batch.mesh.geometry, batch.mesh.material, null!);
    camera.position.set(0, 2, 0); camera.updateMatrixWorld(); render();
    expect(batch.mesh.geometry.drawRange.count).toBe(Infinity);
    camera.position.set(0, 2, 150); camera.updateMatrixWorld(); render();
    expect(batch.mesh.geometry.drawRange.count).toBe(0);
    camera.position.set(0, 2, 0); camera.updateMatrixWorld(); render();
    expect(batch.mesh.geometry.drawRange.count).toBe(Infinity);
    reportBudget("tests/unit/world/zones/first-light-dressing.test.ts:80 triangles(batch.mesh)", triangles(batch.mesh), 300);
    const shader = { ...ShaderLib.standard, uniforms: {} } as WebGLProgramParametersWithUniforms;
    batch.mesh.material.onBeforeCompile(shader, renderer);
    expect(shader.vertexShader).toContain("vDressingUv = uv");
    expect(shader.fragmentShader).toContain("sampleColor.a < 0.5");
    batch.dispose();
  });

  it("retains fallback on failure and releases an asset arriving after teardown", async () => {
    const failed = createLibraryBatch(fallback(), firstLightDressingSites(context), context.heightAt, async () => { throw new Error("offline"); });
    const original = failed.mesh.geometry;
    await failed.loadDetail(renderer); expect(failed.mesh.geometry).toBe(original); failed.dispose();
    let resolve!: (value: LibrarySource) => void;
    const late = createLibraryBatch(fallback(), firstLightDressingSites(context), context.heightAt, () => new Promise(done => { resolve = done; }));
    const pending = late.loadDetail(renderer);
    late.dispose();
    const loaded = source("prop-fern"), release = vi.spyOn(loaded, "dispose");
    resolve(loaded); await pending;
    expect(release).toHaveBeenCalledOnce();
  });
});
