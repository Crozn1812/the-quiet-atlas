import { Color, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { GRADE_COLORS, lightingAt } from "../../../src/features/world/sky/grade";
import { createGradeFollower } from "../../../src/features/world/sky/smoothing";
import { createSkyDome } from "../../../src/features/world/sky/dome";

function tint(key: keyof typeof PALETTE, amount: number) {
  return new Color(PALETTE.paper).lerp(new Color(PALETTE[key]), amount);
}

describe("position-driven sky grade", () => {
    // B2-031 Art Director r2: dawn sun 2 -> 2.3, hemisphere fill 1.5 -> 1.0 (dawn) and 1.4 -> 0.95 (dusk).
  it.each([
    { tod: 0, sun: 0.24, intensity: 2.3, direction: [-0.9, 0.2, 0.4], hemi: 0.25,
      ground: 0.28, ambient: 1.0, fog: tint("dusk", 0.1), top: 0.32, shadow: 0.32 },
    { tod: 0.5, sun: 0.08, intensity: 2.8, direction: [0, 0.94, 0.34], hemi: 0.4,
      ground: 0.22, ambient: 2, fog: tint("mist", 0.12), top: 0.55, shadow: 0.26 },
    { tod: 1, sun: 0.4, intensity: 1.7, direction: [0.9, 0.16, 0.4], hemi: 0.24,
      ground: 0.32, ambient: 0.95, fog: tint("dusk", 0.22).lerp(new Color(PALETTE.flower), 0.025),
      top: 0.36, shadow: 0.36 },
  ])("matches the complete keyframe at $tod", spec => {
    const grade = lightingAt(spec.tod);
    const expected = {
      sunColor: tint(spec.tod === 0.5 ? "mist" : "dusk", spec.sun),
      hemiSky: tint("mist", spec.hemi), hemiGround: tint("indigo", spec.ground),
      fogColor: spec.fog, skyHorizon: spec.fog, skyTop: tint("mist", spec.top),
      shadowTint: tint("indigo", spec.shadow),
    };
    for (const key of GRADE_COLORS) {
      expect(grade[key].toArray()).toEqual(expected[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(grade.sunIntensity).toBe(spec.intensity);
    expect(grade.hemiIntensity).toBe(spec.ambient);
    expect(grade.sunDirection.distanceTo(new Vector3(...spec.direction).normalize())).toBeLessThan(1e-12);
  });

  it("uses smoothstep between the frames, with continuous muted colors throughout", () => {
    const dawn = lightingAt(0);
    const middle = lightingAt(0.5);
    const u = 0.2;
    const alpha = u * u * (3 - 2 * u);
    expect(lightingAt(0.1).skyTop.toArray()).toEqual(dawn.skyTop.clone().lerp(middle.skyTop, alpha).toArray());
    let previous = dawn;
    for (let i = 0; i <= 1000; i++) {
      const grade = lightingAt(i / 1000);
      for (const key of GRADE_COLORS) {
        const components = grade[key].toArray();
        const max = Math.max(...components);
        expect((max - Math.min(...components)) / max).toBeLessThanOrEqual(0.85);
        // Also check displayed sRGB, rather than only the linear working values.
        const srgb = grade[key].clone().convertLinearToSRGB().toArray();
        expect((Math.max(...srgb) - Math.min(...srgb)) / Math.max(...srgb)).toBeLessThanOrEqual(0.85);
        const delta = components.map((v, j) => v - previous[key].toArray()[j]!);
        expect(Math.hypot(...delta)).toBeLessThan(0.01);
      }
      expect(grade.sunDirection.length()).toBeCloseTo(1, 12);
      previous = grade;
    }
    expect(dawn.sunDirection.y).toBeLessThan(middle.sunDirection.y);
    expect(lightingAt(1).sunDirection.y).toBeLessThan(middle.sunDirection.y);
  });

  it("clamps position time and returns independent mutable colors and directions", () => {
    expect(lightingAt(-1)).toEqual(lightingAt(0));
    expect(lightingAt(Infinity)).toEqual(lightingAt(1));
    expect(lightingAt(NaN)).toEqual(lightingAt(0));
    const grade = lightingAt(timeOfDayAt(0.2));
    grade.skyTop.set(0);
    grade.sunDirection.set(0, 0, 0);
    expect(lightingAt(0).skyTop).toEqual(tint("mist", 0.32));
    expect(lightingAt(0).sunDirection.length()).toBeCloseTo(1);
    expect(lightingAt(timeOfDayAt(0.9))).toEqual(lightingAt(1));
  });
});

describe("grade follower", () => {
  it("follows exponentially, converges after reversal, and snaps on teleport", () => {
    const follower = createGradeFollower(3);
    const dawn = lightingAt(0);
    const dusk = lightingAt(1);
    expect(follower.update(dusk, 0)).toEqual(dawn);
    const first = follower.update(dusk, 0.1);
    expect(first.sunIntensity).toBeCloseTo(2.3 + (1.7 - 2.3) * (1 - Math.exp(-0.3)), 12);
    expect(first.sunDirection.length()).toBeCloseTo(1);
    for (let i = 0; i < 120; i++) follower.update(dusk, 1 / 30);
    expect(follower.update(dusk, 0).skyTop.r).toBeCloseTo(dusk.skyTop.r, 5);
    for (let i = 0; i < 120; i++) follower.update(dawn, 1 / 30);
    const result = follower.update(dawn, 0);
    for (const key of GRADE_COLORS) {
      expect(result[key].toArray()).toEqual(dawn[key].toArray().map(v => expect.closeTo(v, 5)));
    }
    expect(result.sunDirection.distanceTo(dawn.sunDirection)).toBeLessThan(0.0001);
    expect(follower.snap(dusk)).toEqual(dusk);
    dusk.skyTop.set(0);
    expect(follower.update(lightingAt(0), 0).skyTop).toEqual(lightingAt(1).skyTop);
  });

  it("has frame-independent exponential response and validates inputs", () => {
    const a = createGradeFollower(2);
    const b = createGradeFollower(2);
    const target = lightingAt(1);
    const oneStep = a.update(target, 1);
    for (let i = 0; i < 60; i++) b.update(target, 1 / 60);
    const manySteps = b.update(target, 0);
    for (const key of GRADE_COLORS) {
      expect(manySteps[key].toArray()).toEqual(oneStep[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(manySteps.sunIntensity).toBeCloseTo(oneStep.sunIntensity, 12);
    expect(manySteps.hemiIntensity).toBeCloseTo(oneStep.hemiIntensity, 12);
    expect(manySteps.sunDirection.distanceTo(oneStep.sunDirection)).toBeLessThan(1e-12);
    for (const rate of [0, -1, NaN, Infinity]) expect(() => createGradeFollower(rate)).toThrow(RangeError);
    for (const dt of [-1, NaN, Infinity]) expect(() => a.update(target, dt)).toThrow(RangeError);
  });
});

describe("sky dome without a GPU", () => {
  it("uses one cheap texture-free mesh, updates uniforms, follows the camera, and disposes once", () => {
    const dome = createSkyDome();
    const { mesh } = dome;
    const scene = new Scene();
    scene.add(mesh);
    const material = mesh.material;
    expect(mesh.children).toHaveLength(0);
    expect(mesh.geometry.getAttribute("position").count).toBeLessThan(400);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.fragmentShader).toContain("paperBand");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(Object.values(material.uniforms).every(uniform => uniform.value instanceof Color)).toBe(true);
    const top = material.uniforms.skyTop!.value;
    const grade = lightingAt(1);
    dome.update(grade);
    expect(material.uniforms.skyTop!.value).toBe(top);
    expect(top).toEqual(grade.skyTop);
    expect(material.uniforms.skyHorizon!.value).toEqual(grade.skyHorizon);
    grade.skyTop.set(0);
    expect(top).toEqual(lightingAt(1).skyTop);
    const camera = new PerspectiveCamera();
    camera.position.set(90, 5, -40);
    camera.rotation.y = 1;
    camera.updateMatrixWorld();
    mesh.onBeforeRender({} as WebGLRenderer, scene, camera, mesh.geometry, material, null!);
    expect(new Vector3().setFromMatrixPosition(mesh.matrixWorld)).toEqual(camera.position);
    expect(new Vector3().setFromMatrixColumn(mesh.matrixWorld, 1)).toEqual(new Vector3(0, 1, 0));
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    dome.dispose();
    dome.dispose();
    expect(mesh.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
