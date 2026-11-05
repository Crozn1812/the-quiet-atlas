import { Color, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { fogAt, STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, cloneGrade, coastAtmosphereWeight, GRADE_COLORS, lightingAt } from "../../../src/features/world/sky/grade";
import { createGradeFollower } from "../../../src/features/world/sky/smoothing";
import { createCoastMountainMist, createSkyDome } from "../../../src/features/world/sky/dome";

// Execute the shipped GLSL arithmetic on the CPU; only GLSL types/vector syntax are adapted.
type DomeEvaluator = (...args: unknown[]) => { color: number[]; density: number };
const evaluators = new WeakMap<ReturnType<typeof createSkyDome>["mesh"]["material"], DomeEvaluator>();
function sampleDomeData(dome: ReturnType<typeof createSkyDome>, direction: Vector3) {
  const { uniforms, fragmentShader } = dome.mesh.material;
  const names = ["skyTop", "skyHorizon", "cloud", "cloudBase", "cloudTime", "sunDirection", "sunGlow", "coastWeight"];
  let evaluate = evaluators.get(dome.mesh.material);
  if (!evaluate) {
    const body = fragmentShader.slice(fragmentShader.indexOf("float cloudHash"), fragmentShader.indexOf("void main()"))
      .replace(/\b(?:float|vec3) (\w+)\(([^)]*)\) \{/g, (_, name: string, params: string) =>
        "function " + name + "(" + params.replace(/\b(?:float|vec3) /g, "") + ") {")
      .replace(/\b(?:float|vec3) (\w+) =/g, "let $1 =")
      .replace("return color + sunGlow * radiance;", "return color.map((v, i) => v + sunGlow[i] * radiance);");
    evaluate = new Function("direction", ...names, "mix", "smoothstep", "max", "abs", "sqrt", "cos", "sin", "radians", "dot", "normalize", "fract", "floor", "mod", "atan",
      body + " return { color: skyColor(direction), density: cloudDensity(direction) };") as DomeEvaluator;
    evaluators.set(dome.mesh.material, evaluate);
  }
  const mix = (a: number | number[], b: number | number[], t: number): number | number[] =>
    Array.isArray(a) ? a.map((v, i) => v + ((b as number[])[i]! - v) * t) : a + ((b as number) - a) * t;
  const smoothstep = (a: number, b: number, x: number) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const values = names.map(name => {
    const value = uniforms[name]!.value;
    return value instanceof Color ? value.toArray() : value;
  });
  const result = evaluate(direction.clone().normalize(), ...values, mix, smoothstep, Math.max, Math.abs, Math.sqrt, Math.cos, Math.sin,
    (degrees: number) => degrees * Math.PI / 180, (a: Vector3, b: Vector3) => a.dot(b), (v: Vector3) => v.clone().normalize(),
    (v: number) => v - Math.floor(v), Math.floor, (a: number, b: number) => a - b * Math.floor(a / b), Math.atan2);
  return { color: new Color().setRGB(result.color[0]!, result.color[1]!, result.color[2]!), density: result.density };
}
function sampleDome(dome: ReturnType<typeof createSkyDome>, direction: Vector3): Color {
  return sampleDomeData(dome, direction).color;
}
const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const rayAt = (azimuth: number, elevation: number) => new Vector3(
  Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation),
);

function placedGrade(t: number) {
  const tod = timeOfDayAt(t);
  return applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
}

function tint(key: keyof typeof PALETTE, amount: number) {
  return new Color(PALETTE.paper).lerp(new Color(PALETTE[key]), amount);
}

const coastHorizon = new Color(PALETTE.skyLow).lerp(new Color(PALETTE.sunGold), 0.55);
const coastTop = new Color(PALETTE.skyHigh);
const coastFog = tint("mist", 0.18).lerp(coastHorizon, 0.2);

describe("position-driven sky grade", () => {
  it.each([
    { tod: 0, sun: 0.24, intensity: 2.3, direction: [-0.9, 0.2, 0.4], hemi: 0,
      ground: 0.25, ambient: 1, shadow: 0.2 },
    { tod: 0.5, sun: 0.08, intensity: 2.8, direction: [0, 0.94, 0.34], hemi: 0.15,
      ground: 0.3, ambient: 2, shadow: 0.26 },
    { tod: 1, sun: 0.4, intensity: 1.7, direction: [0.8, 0.14, -0.6], hemi: 0,
      ground: 0.2, ambient: 0.95, shadow: 0.16 },
  ])("matches the palette-derived direction A keyframe at $tod", spec => {
    const grade = lightingAt(spec.tod);
    const expected = {
      sunColor: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), spec.sun),
      hemiSky: new Color(PALETTE.skyLow).lerp(new Color(PALETTE.skyHigh), spec.hemi),
      hemiGround: new Color(PALETTE.grassDry).lerp(new Color(PALETTE.skyLow), spec.ground).multiplyScalar(0.88),
      fogColor: spec.tod === 1 ? coastFog : new Color(PALETTE.skyLow),
      skyHorizon: spec.tod === 1 ? coastHorizon : new Color(PALETTE.skyLow), skyTop: coastTop,
      shadowTint: new Color(PALETTE.skyHigh).lerp(new Color(PALETTE.cloud), spec.shadow),
    };
    for (const key of GRADE_COLORS) {
      expect(grade[key].toArray()).toEqual(expected[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(grade.sunIntensity).toBe(spec.intensity);
    expect(grade.hemiIntensity).toBe(spec.ambient);
    expect(grade.sunDirection.distanceTo(new Vector3(...spec.direction).normalize())).toBeLessThan(1e-12);
    expect(grade.sunColor.r).toBeGreaterThan(grade.sunColor.g);
    expect(grade.sunColor.g).toBeGreaterThan(grade.sunColor.b);
    expect(grade.sunColor.r - grade.sunColor.g).toBeLessThan(0.16); // Warm white, never red dawn.
    expect(grade.hemiSky.b).toBeGreaterThan(grade.hemiSky.g);
    expect(grade.hemiGround.g).toBeGreaterThan(grade.hemiGround.b);
    expect(grade.shadowTint.b).toBeGreaterThan(grade.shadowTint.g);
    expect(grade.shadowTint.g).toBeGreaterThan(grade.shadowTint.r);
    expect(luma(grade.shadowTint)).toBeGreaterThan(0.2);
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
        expect((max - Math.min(...components)) / max).toBeLessThanOrEqual(0.92);
        // Also check displayed sRGB, rather than only the linear working values.
        const srgb = grade[key].clone().convertLinearToSRGB().toArray();
        expect((Math.max(...srgb) - Math.min(...srgb)) / Math.max(...srgb)).toBeLessThanOrEqual(0.92);
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
    expect(lightingAt(0).skyTop).toEqual(new Color(PALETTE.skyHigh));
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

  it("keeps a gold/blue horizon brighter and warmer than forest with blue overhead and 400 m fog", () => {
    const grade = placedGrade(0.9);
    const forest = placedGrade(0.3);
    expect(grade.skyHorizon.toArray()).toEqual(coastHorizon.toArray().map(v => expect.closeTo(v, 12)));
    expect(grade.skyHorizon.r - grade.skyHorizon.b).toBeGreaterThan(forest.skyHorizon.r - forest.skyHorizon.b);
    expect(grade.skyTop).toEqual(new Color(PALETTE.skyHigh));
    expect(luma(grade.skyHorizon)).toBeGreaterThan(luma(grade.skyTop));
    for (const zone of ZONES.filter(zone => zone.biome === "coast-dusk")) {
      expect(fogAt(zone.t, STYLE_PRESETS.C)).toEqual({ near: 100, far: 400 });
    }
  });

  it("restores coast colors after direction overrides and blends smoothly from the hill in either direction", () => {
    const hill = placedGrade(0.76);
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
  it("copies the position mask without sharing state and clears it when snapping back to forest", () => {
    const coast = placedGrade(0.9);
    const follower = createGradeFollower(2);
    const copy = cloneGrade(coast);
    coast.coastWeight = 0.5;
    expect(copy.coastWeight).toBe(1);
    expect(follower.snap(copy).coastWeight).toBe(1);
    expect(follower.update(placedGrade(0.3), 0.1).coastWeight).toBeCloseTo(Math.exp(-0.2), 12);
    expect(follower.snap(placedGrade(0.3))).toEqual(placedGrade(0.3));
  });

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
  it.each([0.3, 0.9])("keeps 15–35 percent solid-angle cloud cover in the 5–35 degree band at path %s", pathT => {
    const dome = createSkyDome(placedGrade(pathT));
    const reference = createSkyDome(placedGrade(pathT));
    try {
      // Isolate clouds from sunlight. A black cloud reference would distort contrast:
      // replace only the density return in the same shader to sample the unobscured sky.
      reference.mesh.material.fragmentShader = reference.mesh.material.fragmentShader
        .replace("return band * smoothstep(0.52, 0.66, puffs);", "return 0.0;");
      dome.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
      reference.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
      const low = Math.sin(5 * Math.PI / 180);
      const high = Math.sin(35 * Math.PI / 180);
      for (const seconds of [0, 120, 600]) {
        dome.mesh.material.uniforms.cloudTime!.value = seconds;
        let cloudy = 0;
        let minimumContrast = Infinity;
        const densities: number[] = [];
        for (let row = 0; row < 48; row++) {
          // Equal increments of sin(elevation) give equal solid-angle samples.
          const elevation = Math.asin(low + (high - low) * (row + 0.5) / 48);
          for (let column = 0; column < 192; column++) {
            const ray = rayAt((column + 0.5) * 2 * Math.PI / 192, elevation);
            const sample = sampleDomeData(dome, ray);
            densities.push(sample.density);
            if (sample.density >= 0.5) {
              cloudy++;
              minimumContrast = Math.min(minimumContrast, luma(sample.color) - luma(sampleDome(reference, ray)));
            }
          }
        }
        const coverage = cloudy / (48 * 192);
        expect(coverage).toBeGreaterThanOrEqual(0.15);
        expect(coverage).toBeLessThanOrEqual(0.35);
        expect(minimumContrast).toBeGreaterThanOrEqual(0.15);
        expect(densities.some(value => value > 0 && value < 0.5)).toBe(true); // Soft painted edges.
        expect(densities.some(value => value > 0.99)).toBe(true); // White opaque cores.
      }
      for (const elevation of [-20, 0, 5, 35, 60, 90]) {
        for (let azimuth = 0; azimuth < 360; azimuth += 15) {
          expect(sampleDomeData(dome, rayAt(azimuth * Math.PI / 180, elevation * Math.PI / 180)).density).toBeCloseTo(0, 12);
        }
      }
    } finally { dome.dispose(); reference.dispose(); }
  });

  it("drifts slowly, pauses without jumping under reduced motion, resumes and is frame independent", () => {
    const grade = lightingAt(0);
    const dome = createSkyDome(grade);
    const twin = createSkyDome(grade);
    const rays = Array.from({ length: 32 }, (_, i) => rayAt(i * 2 * Math.PI / 32, 20 * Math.PI / 180));
    const samples = () => rays.map(ray => sampleDomeData(dome, ray));
    try {
      const initial = samples();
      dome.update(grade, 120, true);
      expect(samples()).toEqual(initial);
      dome.update(grade, 1);
      const moving = samples();
      expect(moving).not.toEqual(initial);
      expect(Math.max(...moving.map((sample, i) => Math.abs(sample.density - initial[i]!.density)))).toBeLessThan(0.15);
      for (let i = 0; i < 60; i++) twin.update(grade, 1 / 60);
      expect(twin.mesh.material.uniforms.cloudTime!.value).toBeCloseTo(1, 12);
      for (const ray of rays) expect(sampleDomeData(twin, ray).density).toBeCloseTo(sampleDomeData(dome, ray).density, 12);
      dome.update(lightingAt(1), 600, true);
      expect(samples().map(sample => sample.density)).toEqual(moving.map(sample => sample.density));
      expect(dome.mesh.material.uniforms.skyHorizon!.value).toEqual(lightingAt(1).skyHorizon);
      dome.update(grade, 1);
      expect(samples()).not.toEqual(moving);
      dome.update(grade, 1278); // Full azimuth period wraps seamlessly.
      expect(samples()).toEqual(initial);
      for (const dt of [-1, NaN, Infinity]) expect(() => dome.update(grade, dt)).toThrow(RangeError);
      for (const radius of [-1, 0, NaN, Infinity]) expect(() => createSkyDome(grade, radius)).toThrow(RangeError);
    } finally { dome.dispose(); twin.dispose(); }
  });

  it("is deterministic and continuous across the azimuth seam", () => {
    const dome = createSkyDome();
    const twin = createSkyDome();
    try {
      for (const seconds of [0, 500, 1280]) {
        dome.update(lightingAt(0), seconds);
        twin.update(lightingAt(0), seconds);
        for (let elevation = 6; elevation < 35; elevation++) {
          const ray = rayAt(Math.PI - 1e-8, elevation * Math.PI / 180);
          const sample = sampleDomeData(dome, ray);
          expect(sampleDomeData(twin, ray)).toEqual(sample);
          expect(sampleDomeData(dome, rayAt(-Math.PI + 1e-8, elevation * Math.PI / 180)).density).toBeCloseTo(sample.density, 5);
        }
      }
    } finally { dome.dispose(); twin.dispose(); }
  });

  it("warms and brightens the sea-facing sky at 3 degrees, with a small disc and broad horizon halo", () => {
    const grade = placedGrade(0.9);
    const dome = createSkyDome(grade);
    try {
      const elevation = 3 * Math.PI / 180;
      const toward = new Vector3(grade.sunDirection.x, 0, grade.sunDirection.z).normalize().multiplyScalar(Math.cos(elevation));
      toward.y = Math.sin(elevation);
      const away = new Vector3(-toward.x, toward.y, -toward.z);
      const warm = sampleDome(dome, toward);
      const cool = sampleDome(dome, away);
      const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma(warm) - luma(cool)).toBeGreaterThanOrEqual(0.08);
      expect(dome.mesh.material.uniforms.sunGlow!.value).toEqual(new Color(PALETTE.sunGold));
      expect(warm.r - warm.b).toBeGreaterThan(cool.r - cool.b);
      const azimuth = new Vector3(0, 1, 0).cross(grade.sunDirection).normalize();
      const atAngle = (degrees: number) => sampleDome(dome, grade.sunDirection.clone().applyAxisAngle(azimuth, degrees * Math.PI / 180));
      expect(luma(atAngle(0)) - luma(atAngle(1.2))).toBeGreaterThan(0.3);
      // A 20-degree sideways sample still catches the halo; at 35 degrees it is gone.
      const haloAt = (degrees: number) => {
        const ray = toward.clone().applyAxisAngle(new Vector3(0, 1, 0), degrees * Math.PI / 180);
        const lit = sampleDome(dome, ray);
        // Preserve the coast gradient while disabling radiance for the reference.
        const glow = dome.mesh.material.uniforms.sunGlow!.value as Color;
        const saved = glow.clone();
        glow.setRGB(0, 0, 0);
        dome.update(grade);
        const unlit = sampleDome(dome, ray);
        glow.copy(saved);
        return luma(lit) - luma(unlit);
      };
      expect(haloAt(20)).toBeGreaterThan(0.01);
      expect(haloAt(35)).toBeCloseTo(0, 12);
      expect(grade.skyHorizon.r - grade.skyTop.r).toBeGreaterThan(0.25);
      expect(grade.skyTop.b).toBeGreaterThan(grade.skyTop.r);
    } finally { dome.dispose(); }
  });

  it("follows the graded sun direction and retains a clear gold sun in the morning", () => {
    const grade = placedGrade(0.9);
    const dome = createSkyDome(grade);
    try {
      const ray = grade.sunDirection.clone();
      const before = sampleDome(dome, ray);
      grade.sunDirection.set(-ray.x, ray.y, -ray.z);
      dome.update(grade);
      expect(dome.mesh.material.uniforms.sunDirection!.value).toEqual(grade.sunDirection);
      expect(before.r - sampleDome(dome, ray).r).toBeGreaterThan(0.5);
      dome.update(placedGrade(0.3));
      expect(dome.mesh.material.uniforms.coastWeight!.value).toBe(0);
      const morningSun = placedGrade(0.3).sunDirection;
      const glow = dome.mesh.material.uniforms.sunGlow!.value as Color;
      const lit = sampleDome(dome, morningSun);
      glow.setRGB(0, 0, 0);
      expect(luma(lit) - luma(sampleDome(dome, morningSun))).toBeGreaterThan(0.3);
    } finally { dome.dispose(); }
  });

  it("uses skyHigh overhead and brighter skyLow at the forest horizon without a paper wash", () => {
    const dome = createSkyDome(placedGrade(0.3));
    try {
      dome.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
      const horizon = sampleDome(dome, new Vector3(1, 0, 0));
      const zenith = sampleDome(dome, new Vector3(0, 1, 0));
      expect(horizon).toEqual(new Color(PALETTE.skyLow));
      expect(zenith.toArray()).toEqual(new Color(PALETTE.skyHigh).toArray().map(v => expect.closeTo(v, 12)));
      expect(luma(horizon)).toBeGreaterThan(luma(zenith));
      expect(dome.mesh.material.fragmentShader).not.toContain("paperBand");
    } finally { dome.dispose(); }
  });

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
    expect(material.fragmentShader).toContain("cloudDensity");
    expect(mesh.geometry.index!.count / 3).toBe(528); // One draw, no extra cloud geometry/pass.
    expect(Object.values(material.uniforms).some(u => u.value?.isTexture)).toBe(false);
    expect(material.uniforms.cloud!.value).toEqual(new Color(PALETTE.cloud));
    expect(material.uniforms.cloudBase!.value).toEqual(new Color(PALETTE.cloud).lerp(new Color(PALETTE.skyLow), 0.28));
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(material.uniforms.sunDirection!.value).toBeInstanceOf(Vector3);
    expect(material.uniforms.coastWeight!.value).toBe(0);
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
