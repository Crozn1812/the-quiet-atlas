import { describe, expect, it, vi } from "vitest";
import { Color, Vector3, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { cloudLight } from "../../../src/features/world/sky/cloud-light";
import { ZONES } from "../../../src/features/world/layout/zones";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { directGrade } from "../../../src/features/world/scene/compose";
import { createCloudBake, isSoftwareSkyRenderer } from "../../../src/features/world/sky/cloud-bake";
import { createCloudNoise } from "../../../src/features/world/sky/cloud-volume";
import { createSkyDome } from "../../../src/features/world/sky/dome";
import { applyCoastAtmosphere, cloneGrade, lightingAt } from "../../../src/features/world/sky/grade";

describe("cloud incident light throughout the route", () => {
  it.each(ZONES)("receives the $id sun and sky without changing the world grade", zone => {
    const time = timeOfDayAt(zone.t);
    const grade = applyCoastAtmosphere(directGrade(lightingAt(time), time), zone.t);
    const copy = cloneGrade(grade), sun = new Color(), shade = new Color();
    cloudLight(grade, sun, shade);
    expect(grade).toEqual(copy);
    expect(sun.r).toBe(grade.sunColor.r);
    expect(sun.g).toBeLessThanOrEqual(grade.sunColor.g);
    expect(sun.b).toBeLessThanOrEqual(grade.sunColor.b);
    expect(Math.min(...shade.toArray())).toBeGreaterThan(0);
    if (["first-light", "quiet-shore", "last-postcard"].includes(zone.id)) {
      expect(sun.r / sun.b).toBeGreaterThan(2.5);
      expect(shade.r).toBeGreaterThan(shade.g);
      expect(shade.b).toBeGreaterThan(shade.g);
    }
    if (zone.id === "horizon") expect(sun.r / sun.b).toBeLessThan(1.5);
    const dome = createSkyDome(grade);
    const uniform = dome.mesh.material.uniforms.cloudSun!.value;
    expect(uniform).toEqual(sun);
    dome.update(lightingAt(1));
    cloudLight(lightingAt(1), sun, shade);
    expect(dome.mesh.material.uniforms.cloudSun!.value).toBe(uniform);
    expect(uniform).toEqual(sun);
    expect(dome.mesh.material.uniforms.cloudShade!.value).toEqual(shade);
    dome.dispose();
  });
});

function rendererStub() {
  const previous = { name: "post-target" };
  const renderer = {
    getRenderTarget: () => previous,
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 1,
    setRenderTarget: vi.fn(), render: vi.fn(), autoClear: false, xr: { enabled: true },
  };
  return { renderer, previous, gpu: renderer as unknown as WebGLRenderer };
}

describe("High volume bake and inexpensive skybox", () => {
  it("allocates lazily, caches stable sun, disposes resized targets, and restores render state", () => {
    const bake = createCloudBake(), { renderer, previous, gpu } = rendererStub();
    const sun = new Vector3(1, 0.2, 0).normalize();
    expect(bake.texture).toBeUndefined();
    bake.render(gpu, sun, "High", false);
    const first = renderer.setRenderTarget.mock.calls[0]![0] as WebGLRenderTarget;
    expect(first.width).toBe(2048);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previous, 2, 1);
    expect(renderer.autoClear).toBe(false); expect(renderer.xr.enabled).toBe(true);
    bake.render(gpu, sun, "High", false);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    const release = vi.spyOn(first, "dispose");
    bake.render(gpu, sun, "Low", true);
    expect(release).toHaveBeenCalledTimes(1);
    const low = renderer.setRenderTarget.mock.calls[2]![0] as WebGLRenderTarget;
    expect(low.width).toBe(256);
    bake.render(gpu, sun, "Low", true);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    bake.invalidate(); bake.render(gpu, sun, "Low", true);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    bake.dispose();
  });

  it("restores the active world framebuffer and XR flags even when the bake throws", () => {
    const bake = createCloudBake(), { renderer, previous, gpu } = rendererStub();
    renderer.render.mockImplementationOnce(() => { throw new Error("context lost"); });
    expect(() => bake.render(gpu, new Vector3(1, 0, 0), "Low", true)).toThrow("context lost");
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previous, 2, 1);
    expect(renderer.autoClear).toBe(false); expect(renderer.xr.enabled).toBe(true);
    bake.dispose();
  });

  it("re-bakes light when the authoritative sun turns, without changing the volume", () => {
    const bake = createCloudBake(), { renderer, gpu } = rendererStub();
    bake.render(gpu, new Vector3(1, 0, 0), "Low", true);
    const texture = bake.texture;
    bake.render(gpu, new Vector3(0, 0, -1), "Low", true);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(bake.texture).toBe(texture);
    bake.dispose();
  });

  it.each(["SwiftShader Device", "llvmpipe", "Microsoft Basic Render Driver", "lavapipe"])("detects %s before selecting a static bake", name => {
    const gpu = { getContext: () => ({ getExtension: () => null, getParameter: () => name }) } as unknown as WebGLRenderer;
    expect(isSoftwareSkyRenderer(gpu)).toBe(true);
  });

  it("freezes Low advection while still following world light", () => {
    const dome = createSkyDome(); dome.setQuality("Low");
    dome.update(lightingAt(1), 120);
    expect(dome.mesh.material.uniforms.cloudTime!.value).toBe(0);
    expect(dome.mesh.material.uniforms.sunDirection!.value).toEqual(lightingAt(1).sunDirection);
    dome.dispose();
  });

  it("builds deterministic, non-flat, continuous periodic noise with no fetched asset", () => {
    const a = createCloudNoise(), b = createCloudNoise();
    const data = a.image.data as Uint8Array;
    expect(data).toEqual(b.image.data);
    let wrapDifference = 0, innerDifference = 0;
    for (let z = 0; z < 64; z++) for (let y = 0; y < 64; y++) {
      const start = 64 * (y + 64 * z);
      wrapDifference += Math.abs(data[start]! - data[start + 63]!);
      innerDifference += Math.abs(data[start + 30]! - data[start + 31]!);
    }
    expect(wrapDifference / innerDifference).toBeGreaterThan(0.4);
    expect(wrapDifference / innerDifference).toBeLessThan(2);
    expect(new Set(data).size).toBeGreaterThan(100);
    a.dispose(); b.dispose();
  });
});
