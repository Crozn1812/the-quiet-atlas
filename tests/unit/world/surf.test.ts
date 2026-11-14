import { reportBudget } from "./report-budget";
import { Mesh, ShaderLib, UniformsUtils, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { SURF_PERIOD, SURF_TRAVEL, surfCycle, surfEnvelope, surfRunup } from "../../../src/features/audio/waves";
import { createSea } from "../../../src/features/world/water/sea";
import { createWaterMaterial } from "../../../src/features/world/water/material";
import { nearestSurf, surfAt } from "../../../src/features/world/shore/surf";
import { shoreGroundHeight } from "../../../src/features/world/shore/contour";
import { createPhotoFallback } from "../../../src/features/world/materials/cc0";

describe("shared shoreline surf", () => {
  it("advances 2.4 m, drains slowly, repeats after 8 s and offsets adjacent beach sections", () => {
    expect(SURF_PERIOD).toBeGreaterThanOrEqual(6);
    expect(SURF_PERIOD).toBeLessThanOrEqual(9);
    expect(surfRunup(0)).toBe(0);
    expect(surfRunup(0.44)).toBe(SURF_TRAVEL);
    expect(surfRunup(0.44)).toBeGreaterThanOrEqual(1);
    expect(surfRunup(0.44)).toBeLessThanOrEqual(3);
    expect(surfRunup(0.7)).toBeGreaterThan(0);
    expect(surfRunup(0.98)).toBe(0);
    for (const x of [-330, 0, 270]) for (let t = 0; t < 8; t += 0.1) {
      expect(surfCycle(t, x)).toBeCloseTo(surfCycle(t + SURF_PERIOD, x), 10);
    }
    expect(surfCycle(0, 10)).not.toBe(surfCycle(0, 30));
    expect(surfEnvelope(0.15).approach).toBeGreaterThan(surfEnvelope(0.15).break);
    expect(surfEnvelope(0.275).break).toBe(1);
    expect(surfEnvelope(0.65).retreat).toBe(1);
    expect(Object.values(surfEnvelope(0.99))).toEqual([0, 0, 0]);
  });

  it("uses finite coastline segments for distance and stereo, including returning inlet sides", () => {
    const segments = [{ a: { x: 0, z: 0 }, b: { x: 0, z: 10 }, length: 10 }];
    expect(nearestSurf(3, 5, segments)).toEqual({ distance: 3, x: 0, z: 5 });
    expect(nearestSurf(3, 14, segments)).toEqual({ distance: 5, x: 0, z: 10 });
  });

  it("reports ABBA CPU cost of 60 uniform updates and four listener/envelope samples per simulated second", () => {
    const sea = createSea("High");
    const strip = sea.mesh.children[0] as Mesh;
    let checksum = 0;
    function run(enabled: boolean, seconds: number) {
      const start = performance.now();
      for (let s = 0; s < seconds; s++) {
        for (let frame = 0; frame < 60; frame++) {
          checksum += frame;
          if (enabled) strip.onBeforeRender({} as WebGLRenderer, {} as never, {} as never, strip.geometry, strip.material as import("three").Material, null as never);
        }
        if (enabled) for (let sample = 0; sample < 4; sample++) {
          const listener = surfAt(21.34, -496.55, 1, 0)!;
          checksum += surfEnvelope(surfCycle(listener.seconds, listener.along)).break;
        }
      }
      return (performance.now() - start) / seconds;
    }
    try {
      run(true, 100); run(false, 100);
      const abba = [run(false, 1000), run(true, 1000), run(true, 1000), run(false, 1000)];
      const added = (abba[1]! + abba[2]! - abba[0]! - abba[3]!) / 2;
      console.info(`SURF-01 JS-only ABBA ms/s (60 frames + 4 audio samples): ${abba.map(n => n.toFixed(4)).join(" / ")}; added=${added.toFixed(4)}. Excludes native WebAudio/GPU and full-world scheduling.`);
      expect(Number.isFinite(checksum)).toBe(true);
    } finally { sea.dispose(); }
  });

  it("keeps static terrain-conforming geometry and follows replaced sea material clocks", () => {
    const sea = createSea("High");
    const strip = sea.mesh.children[0] as Mesh;
    const vertices = strip.geometry.getAttribute("position");
    const before = vertices.array.slice();
    const geometryDispose = vi.spyOn(strip.geometry, "dispose");
    const materialDispose = vi.spyOn(strip.material as import("three").Material, "dispose");
    try {
      expect(strip.userData.surf).toBe(true);
      reportBudget("tests/unit/world/surf.test.ts:72 strip.geometry.index!.count / 3", strip.geometry.index!.count / 3, 10_000);
      for (let i = 0; i < vertices.count; i++) {
        expect(vertices.getY(i)).toBeCloseTo(Math.max(0, shoreGroundHeight(vertices.getX(i), vertices.getZ(i))) + 0.018, 3);
      }
      sea.setTime(1); sea.setTime(4);
      expect(surfAt(0, -850, 1, 0)?.seconds).toBe(4);
      const old = sea.mesh.material;
      sea.mesh.material = createWaterMaterial("Low", { surface: "sea" });
      sea.mesh.material.setTime(4);
      sea.mesh.material.uniforms.uTime!.value = 4;
      sea.mesh.material.setTime(6);
      expect(surfAt(0, -850, 1, 0)?.seconds).toBe(6);
      sea.mesh.material.setReducedMotion(true);
      sea.mesh.material.setTime(99);
      expect(surfAt(0, -850, 1, 0)?.seconds).toBe(6);
      old.dispose();
      expect(vertices.array).toEqual(before);
      // Exercise the final material hook after the CC0 controller swaps materials.
      const shader = { ...ShaderLib.basic, uniforms: UniformsUtils.clone(ShaderLib.basic.uniforms) };
      strip.onBeforeRender({} as WebGLRenderer, {} as never, {} as never, strip.geometry, strip.material as import("three").Material, null as never);
      (strip.material as import("three").Material).onBeforeCompile(shader as never, {} as WebGLRenderer);
      expect(shader.fragmentShader).toContain("uSurfWetness");
      expect(shader.fragmentShader).toContain("wetReach");
      expect(shader.uniforms.uSurfTime!.value).toBe(6);
      expect(shader.uniforms.uSurfDetail!.value).toBe(0);
      const original = strip.material as import("three").Material;
      const fallback = createPhotoFallback("terrain", original);
      strip.material = fallback;
      strip.onBeforeRender({} as WebGLRenderer, {} as never, {} as never, strip.geometry, fallback, null as never);
      const swapped = { ...ShaderLib.basic, uniforms: UniformsUtils.clone(ShaderLib.basic.uniforms) };
      fallback.onBeforeCompile(swapped as never, {} as WebGLRenderer);
      expect(swapped.vertexShader.match(/attribute float surfDistance/g)).toHaveLength(1);
      expect(swapped.fragmentShader.match(/uniform float uSurfTime/g)).toHaveLength(1);
      fallback.dispose(); // Replacement lifetime belongs to the CC0 surface controller.
    } finally { sea.dispose(); sea.dispose(); }
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(surfAt(0, 0, 1, 0)).toBeUndefined();
  });
});
