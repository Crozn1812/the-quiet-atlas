import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  Bone, BoxGeometry, Camera, Group, MeshStandardMaterial, MeshToonMaterial, Scene,
  Skeleton, SkinnedMesh, Texture, type Material, type WebGLRenderer,
} from "three";
import {
  bakedUV, installBakedAppearance, setBakedAppearanceTransitionGuard, vehicleSurface, type BakedResources,
} from "../../../src/features/world/character/baked-appearance";

afterEach(() => vi.useRealTimers());

function fixture() {
  const mesh = new SkinnedMesh<BoxGeometry, Material>(new BoxGeometry(), new MeshToonMaterial());
  const bones = Array.from({ length: 19 }, (_, i) => { const bone = new Bone(); bone.name = `joint${i}`; return bone; });
  mesh.bind(new Skeleton(bones));
  const geometry = mesh.geometry, material = mesh.material;
  const scene = new Scene(), camera = new Camera();
  const attributes: Record<string, string> = { "data-world-quality": "high", "data-world-build": "done" };
  const renderer = { initTexture: vi.fn(), domElement: { closest: () => ({ getAttribute: (name: string) => attributes[name] }) } } as unknown as WebGLRenderer;
  return { mesh, geometry, material, camera, renderer, attributes, render() {
    mesh.updateMatrixWorld(); camera.updateMatrixWorld();
    mesh.onAfterRender(renderer, scene, camera, mesh.geometry, material, new Group());
  } };
}

function bundle(): BakedResources {
  const geometry = new BoxGeometry();
  geometry.userData.bones = Array.from({ length: 19 }, (_, i) => `joint${i}`);
  return { material: new MeshStandardMaterial({ normalMap: new Texture(), roughnessMap: new Texture() }), geometry, dispose: vi.fn() };
}

describe("GFX-P5 deferred appearance and LOD", () => {
  it("defers queued loads and applying late resources until the rider finishes transitioning", async () => {
    vi.useFakeTimers();
    const f = fixture(), resource = bundle();
    let resolve!: (value: BakedResources) => void;
    let transitioning = true;
    const load = vi.fn(() => new Promise<BakedResources>(done => { resolve = done; }));
    const appearance = installBakedAppearance(f.mesh, true, load);
    setBakedAppearanceTransitionGuard(f.mesh, () => transitioning);
    f.render(); await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    transitioning = false; f.render();
    transitioning = true; await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    transitioning = false; f.render(); await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(1);
    transitioning = true; resolve(resource); await Promise.resolve(); f.render();
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).toBe(f.geometry);
    expect(f.renderer.initTexture).not.toHaveBeenCalled();
    transitioning = false; f.render();
    expect(f.mesh.material).toBe(resource.material);
    expect(f.mesh.geometry).toBe(resource.geometry);
    expect(f.renderer.initTexture).toHaveBeenCalledTimes(2);
    transitioning = true; f.render(); transitioning = false; f.render();
    expect(f.renderer.initTexture).toHaveBeenCalledTimes(2);
    appearance.dispose();
  });
  it("waits for playable scenery and cancels queued loading outside the near LOD", async () => {
    vi.useFakeTimers();
    const f = fixture(), load = vi.fn().mockResolvedValue(bundle());
    const appearance = installBakedAppearance(f.mesh, true, load);
    f.attributes["data-world-build"] = "pending";
    f.render(); await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).toBe(f.geometry);
    f.attributes["data-world-build"] = "done";
    f.render(); f.camera.position.z = 40; f.render();
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    f.camera.position.z = 2; f.render(); await vi.runAllTimersAsync(); f.render();
    expect(load).toHaveBeenCalledTimes(1);
    appearance.dispose();
  });
  it("defers network beyond first render; Low and distant characters stay on the original skin", async () => {
    vi.useFakeTimers();
    const f = fixture(), resource = bundle();
    const load = vi.fn().mockResolvedValue(resource);
    const appearance = installBakedAppearance(f.mesh, true, load);
    appearance.setQuality("Low"); f.render();
    await vi.runAllTimersAsync(); expect(load).not.toHaveBeenCalled();
    appearance.setQuality("High"); f.camera.position.z = 30; f.render();
    await vi.runAllTimersAsync(); expect(load).not.toHaveBeenCalled();
    f.camera.position.z = 3; f.render();
    expect(load).not.toHaveBeenCalled();
    expect(f.mesh.geometry).toBe(f.geometry);
    await vi.runAllTimersAsync(); f.render();
    expect(load).toHaveBeenCalledTimes(1);
    expect(f.mesh.geometry).toBe(resource.geometry);
    expect(f.mesh.material).toBe(resource.material);
    const skeleton = f.mesh.skeleton;
    f.camera.position.z = 30; f.render();
    expect(f.mesh.geometry).toBe(f.geometry);
    expect(f.mesh.skeleton).toBe(skeleton);
    appearance.setQuality("Low"); f.render();
    expect(f.mesh.material).toBe(f.material);
    appearance.dispose(); appearance.dispose();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it("releases a late response on teardown and cancels a Low switch before the request", async () => {
    vi.useFakeTimers();
    const f = fixture(), resource = bundle();
    let resolve!: (value: BakedResources) => void;
    const load = vi.fn(() => new Promise<BakedResources>(done => { resolve = done; }));
    const appearance = installBakedAppearance(f.mesh, false, load);
    f.render(); appearance.setQuality("Low");
    await vi.runAllTimersAsync(); expect(load).not.toHaveBeenCalled();
    appearance.setQuality("High"); f.render(); await vi.runAllTimersAsync();
    appearance.dispose(); resolve(resource); await Promise.resolve();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
    expect(f.mesh.material).toBe(f.material);
  });

  it("rejects incompatible skin order and preserves the live rig after a failed fetch", async () => {
    vi.useFakeTimers();
    const f = fixture(), resource = bundle();
    resource.geometry!.userData.bones.reverse();
    const load = vi.fn().mockResolvedValue(resource);
    const appearance = installBakedAppearance(f.mesh, true, load);
    f.render(); await vi.runAllTimersAsync(); f.render();
    expect(f.mesh.geometry).toBe(f.geometry);
    expect(resource.dispose).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    appearance.dispose();
    const failure = vi.fn().mockRejectedValue(new Error("missing texture"));
    const retry = installBakedAppearance(f.mesh, true, failure);
    f.render(); await vi.runAllTimersAsync(); f.render();
    expect(f.mesh.material).toBe(f.material);
    expect(failure).toHaveBeenCalledTimes(1);
    retry.dispose();
  });

  it.each(["Google SwiftShader", "llvmpipe (LLVM)", "softpipe", "Software Rasterizer"])("keeps pinned High cheap on %s without fetching bakes", async device => {
    vi.useFakeTimers();
    const f = fixture(), load = vi.fn();
    const getParameter = vi.fn(() => device);
    f.renderer.getContext = vi.fn(() => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }), getParameter,
    })) as unknown as WebGLRenderer["getContext"];
    const appearance = installBakedAppearance(f.mesh, true, load);
    appearance.setQuality("High"); f.render(); await vi.runAllTimersAsync(); f.render();
    expect(load).not.toHaveBeenCalled();
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).toBe(f.geometry);
    expect(getParameter).toHaveBeenCalledTimes(1);
    const dispose = vi.spyOn(f.material, "dispose");
    appearance.dispose(); appearance.dispose();
    // The character/vehicle owner releases the original material at teardown.
    expect(dispose).not.toHaveBeenCalled();
    expect(f.mesh.material).toBe(f.material);
  });

  it("switches adaptive Low immediately at the next draw even if High finishes late", async () => {
    vi.useFakeTimers();
    const f = fixture(), resource = bundle();
    let resolve!: (value: BakedResources) => void;
    const load = vi.fn(() => new Promise<BakedResources>(done => { resolve = done; }));
    const appearance = installBakedAppearance(f.mesh, true, load);
    f.render(); await vi.runAllTimersAsync();
    f.attributes["data-world-quality"] = "low"; f.render();
    resolve(resource); await Promise.resolve(); f.render();
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).toBe(f.geometry);
    f.attributes["data-world-quality"] = "high"; f.render();
    expect(f.mesh.material).toBe(resource.material);
    f.camera.position.z = 40; f.render();
    expect(f.mesh.material).toBe(f.material);
    expect(f.mesh.geometry).toBe(f.geometry);
    appearance.dispose();
  });

  it("uses separate High/Balanced resources and keeps the bike's geometry/pivots", async () => {
    vi.useFakeTimers();
    const f = fixture(), high = bundle(), balanced = bundle();
    high.geometry = balanced.geometry = undefined;
    const load = vi.fn().mockResolvedValueOnce(high).mockResolvedValueOnce(balanced);
    const appearance = installBakedAppearance(f.mesh, false, load);
    f.render(); await vi.runAllTimersAsync(); f.render();
    expect(f.mesh.geometry).toBe(f.geometry);
    expect(f.mesh.material).toBe(high.material);
    appearance.setQuality("Balanced"); f.render(); await vi.runAllTimersAsync(); f.render();
    expect(f.mesh.material).toBe(balanced.material);
    expect(load.mock.calls.map(call => call[1])).toEqual(["High", "Balanced"]);
    appearance.dispose();
  });
});

it("keeps the nine padded atlas cells distinct, including leather/rubber/metal", () => {
  expect(vehicleSurface("long_seat", false)).toBe("leather");
  expect(vehicleSurface("wheel", false)).toBe("rubber");
  expect(vehicleSurface("spoke", true)).toBe("metal");
  expect(vehicleSurface("tote_bag", false)).toBe("linen");
  const skin = bakedUV("skin", 0, 0), glass = bakedUV("glass", 1, 1);
  expect(skin[0]).toBeGreaterThan(2 / 3);
  expect(skin[1]).toBeGreaterThan(2 / 3);
  expect(glass[0]).toBeLessThan(2 / 3);
  expect(glass[1]).toBeGreaterThan(1 / 3);
});

it("ships a single UV-mapped compatible 19-joint skin and linear KTX2 tier sizes", () => {
  const buffer = readFileSync("public/world/character/character-duy-c.glb");
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(json.meshes).toHaveLength(1);
  expect(json.meshes[0].primitives).toHaveLength(1);
  expect(json.skins[0].joints).toHaveLength(19);
  expect(buffer.byteLength).toBeLessThan(600000);
  const uv = json.meshes[0].primitives[0].attributes.TEXCOORD_0;
  expect(uv).toBeTypeOf("number");
  const files = readdirSync("public/world/character");
  expect(files.reduce((sum, file) => sum + statSync(`public/world/character/${file}`).size, 0)).toBeLessThanOrEqual(2000000);
  expect(files.some(file => file.includes("2048"))).toBe(false);
  for (const size of [1024, 512]) {
    for (const kind of ["normal", "orm"]) {
      const texture = readFileSync(`public/world/character/${kind}-${size}.ktx2`);
      expect(texture.readUInt32LE(20)).toBe(size);
      expect(texture.readUInt32LE(24)).toBe(size);
    }
  }
});
