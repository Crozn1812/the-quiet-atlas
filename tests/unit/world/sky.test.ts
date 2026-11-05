import { Color, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { fogAt } from "../../../src/features/world/art/direction";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, cloneGrade, coastAtmosphereWeight, GRADE_COLORS, lightingAt } from "../../../src/features/world/sky/grade";
import { createGradeFollower } from "../../../src/features/world/sky/smoothing";
import { createCoastMountainMist, createSkyDome } from "../../../src/features/world/sky/dome";

function tint(key: keyof typeof PALETTE, amount: number) {
  return new Color(PALETTE.paper).lerp(new Color(PALETTE[key]), amount);
}

const coastHorizon = tint("dusk", 0.28).lerp(tint("flower", 0.28), 0.4);
const coastTop = tint("indigo", 0.64).lerp(new Color(PALETTE.mist), 0.04);
const coastFog = tint("mist", 0.18).lerp(coastHorizon, 0.2);

describe("position-driven sky grade", () => {
    // B2-031 Art Director r2: dawn sun 2 -> 2.3, hemisphere fill 1.5 -> 1.0 (dawn) and 1.4 -> 0.95 (dusk).
  it.each([
    { tod: 0, sun: 0.24, intensity: 2.3, direction: [-0.9, 0.2, 0.4], hemi: 0.25,
      ground: 0.28, ambient: 1.0, fog: tint("dusk", 0.1), top: tint("mist", 0.32), shadow: 0.32 },
    { tod: 0.5, sun: 0.08, intensity: 2.8, direction: [0, 0.94, 0.34], hemi: 0.4,
      ground: 0.22, ambient: 2, fog: tint("mist", 0.12), top: tint("mist", 0.55), shadow: 0.26 },
    // B2-155: sea-facing dusk replaces the inland sun and jade sky with diluted peach/indigo.
    { tod: 1, sun: 0.4, intensity: 1.7, direction: [0.8, 0.14, -0.6], hemi: 0.24,
      ground: 0.32, ambient: 0.95, fog: coastFog, top: coastTop, shadow: 0.36 },
  ])("matches the complete keyframe at $tod", spec => {
    const grade = lightingAt(spec.tod);
    const expected = {
      sunColor: tint(spec.tod === 0.5 ? "mist" : "dusk", spec.sun),
      // AD r3: preserve the palette hue, with 12% less linear ground bounce at every keyframe.
      hemiSky: tint("mist", spec.hemi), hemiGround: tint("indigo", spec.ground).multiplyScalar(0.88),
      fogColor: spec.fog, skyHorizon: spec.tod === 1 ? coastHorizon : spec.fog, skyTop: spec.top,
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

describe("coast dusk atmosphere", () => {
  it("keeps the sun low, seaward, on the walking route's right and ahead across the coast", () => {
    for (let i = 0; i <= 100; i++) {
      const t = 0.82 + 0.18 * i / 100;
      const { sunDirection } = lightingAt(timeOfDayAt(t));
      const forward = pathPointAt(Math.min(1, t + 0.001)).sub(pathPointAt(t - 0.001)).normalize();
      const right = forward.clone().cross(new Vector3(0, 1, 0));
      expect(sunDirection.z).toBeLessThan(0);
      expect(sunDirection.dot(right)).toBeGreaterThan(0);
      expect(sunDirection.dot(forward)).toBeGreaterThan(0);
      const elevation = Math.asin(sunDirection.y) * 180 / Math.PI;
      expect(elevation).toBeGreaterThan(0);
      expect(elevation).toBeLessThanOrEqual(12);
    }
  });

  it("dilutes the horizon between dusk and flower and retains pale blue overhead and 400 m fog", () => {
    const grade = lightingAt(1);
    const a = tint("dusk", 0.28);
    const b = tint("flower", 0.28);
    for (const channel of ["r", "g", "b"] as const) {
      expect(grade.skyHorizon[channel]).toBeGreaterThanOrEqual(Math.min(a[channel], b[channel]));
      expect(grade.skyHorizon[channel]).toBeLessThanOrEqual(Math.max(a[channel], b[channel]));
    }
    expect(grade.skyTop.b).toBeGreaterThan(grade.skyTop.r);
    for (const color of [grade.skyHorizon, grade.skyTop]) {
      const srgb = color.clone().convertLinearToSRGB().toArray();
      expect(Math.min(...srgb)).toBeGreaterThan(0.6);
      expect(Math.max(...srgb) - Math.min(...srgb)).toBeLessThan(0.2);
    }
    for (const zone of ZONES.filter(zone => zone.biome === "coast-dusk")) {
      expect(fogAt(zone.t)).toEqual({ near: 40, far: 400 });
    }
  });

  it("restores coast colors after direction overrides and blends smoothly from the hill in either direction", () => {
    const hill = directGrade(lightingAt(timeOfDayAt(0.76)), timeOfDayAt(0.76));
    expect(applyCoastAtmosphere(cloneGrade(hill), 0.76)).toEqual(hill);
    const sample = (t: number) => {
      const tod = timeOfDayAt(t);
      return applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
    };
    let previous = sample(0.76);
    for (let i = 1; i <= 100; i++) {
      const t = 0.76 + (0.89 - 0.76) * i / 100;
      const grade = sample(t);
      for (const key of GRADE_COLORS) {
        expect(Math.hypot(...grade[key].toArray().map((v, j) => v - previous[key].toArray()[j]!))).toBeLessThan(0.01);
      }
      expect(sample(t)).toEqual(grade);
      previous = grade;
    }
    const end = sample(0.89);
    expect(end.skyHorizon.toArray()).toEqual(coastHorizon.toArray().map(v => expect.closeTo(v, 12)));
    expect(end.skyTop.toArray()).toEqual(coastTop.toArray().map(v => expect.closeTo(v, 12)));
    expect(end.fogColor.toArray()).toEqual(coastFog.toArray().map(v => expect.closeTo(v, 12)));
    expect(coastAtmosphereWeight((0.76 + 0.89) / 2)).toBeCloseTo(0.5);
    expect(coastAtmosphereWeight(NaN)).toBe(0);
    expect(coastAtmosphereWeight(-Infinity)).toBe(0);
    expect(coastAtmosphereWeight(Infinity)).toBe(1);
    expect(sample(0.76)).toEqual(hill);
  });
});

describe("coast mountain mist without a GPU", () => {
  it("uses one inland plane and one transparent pass, fades with the biome and releases resources once", () => {
    const mist = createCoastMountainMist();
    const { mesh } = mist;
    const material = mesh.material;
    const scene = new Scene();
    scene.add(mesh);
    expect(mesh.visible).toBe(false);
    expect(mesh.children).toHaveLength(0);
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(mesh.geometry.index!.count).toBe(6);
    expect(material.transparent).toBe(true);
    expect(material.forceSinglePass).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    const anchor = new Vector3(12, 4, -850);
    const grade = lightingAt(1);
    const color = material.uniforms.mistColor!.value;
    mist.update(0.76, anchor, grade);
    expect(mesh.visible).toBe(false);
    mist.update((0.76 + 0.89) / 2, anchor, grade);
    expect(material.uniforms.strength!.value).toBeCloseTo(0.21);
    mist.update(0.89, anchor, grade);
    expect(mesh.visible).toBe(true);
    expect(material.uniforms.strength!.value).toBe(0.42);
    expect(material.uniforms.mistColor!.value).toBe(color);
    expect(color).toEqual(tint("mist", 0.24).lerp(grade.fogColor, 0.2));
    expect(mesh.position).toEqual(anchor);
    mesh.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      expect(point.z).toBeGreaterThan(anchor.z); // No shelf over the -Z sea.
      expect(point.y).toBeGreaterThanOrEqual(anchor.y);
    }
    mist.update(0.76, anchor, grade);
    expect(mesh.visible).toBe(false);
    expect(material.uniforms.strength!.value).toBe(0);
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    mist.dispose();
    mist.dispose();
    mist.update(1, anchor, grade);
    expect(mesh.parent).toBeNull();
    expect(mesh.visible).toBe(false);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
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
