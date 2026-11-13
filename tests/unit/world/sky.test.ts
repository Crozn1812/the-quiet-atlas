import { Color, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { fogAt, FOREST_ATMOSPHERE_TRANSITION, paletteColor, STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, cloneGrade, coastAtmosphereWeight, GRADE_COLORS, lightingAt, type LightingGrade } from "../../../src/features/world/sky/grade";
import { createGradeFollower } from "../../../src/features/world/sky/smoothing";
import { createCoastMountainMist, createSkyDome } from "../../../src/features/world/sky/dome";

// Execute the shipped GLSL arithmetic on the CPU; only GLSL types/vector syntax are adapted.
type CloudShape = { x: number; y: number; z: number };
type DomeEvaluator = (...args: unknown[]) => { color: number[]; density: number; shape: CloudShape };
const evaluators = new WeakMap<ReturnType<typeof createSkyDome>["mesh"]["material"], DomeEvaluator>();
function sampleDomeData(dome: ReturnType<typeof createSkyDome>, direction: Vector3) {
  const { uniforms, fragmentShader } = dome.mesh.material;
  const names = ["skyTop", "skyHorizon", "cloud", "cloudBase", "cloudTime", "sunDirection", "sunGlow", "coastWeight"];
  let evaluate = evaluators.get(dome.mesh.material);
  if (!evaluate) {
    const body = fragmentShader.slice(fragmentShader.indexOf("float cloudSeed"), fragmentShader.indexOf("void main()"))
      .replace(/\b(?:float|vec3) (\w+)\(([^)]*)\) \{/g, (_, name: string, params: string) =>
        "function " + name + "(" + params.replace(/\b(?:float|vec3) /g, "") + ") {")
      .replace(/\b(?:float|vec3) (\w+) =/g, "let $1 =")
      .replace("return color + sunGlow * radiance;", "return color.map((v, i) => v + sunGlow[i] * radiance);");
    evaluate = new Function("direction", ...names, "mix", "smoothstep", "max", "abs", "sqrt", "cos", "sin", "radians", "dot", "normalize", "fract", "floor", "mod", "atan", "min", "vec3",
      body + `
        const computeShape = cloudShape;
        const shape = computeShape(direction);
        cloudShape = () => shape;
        return { color: skyColor(direction), density: cloudDensity(direction), shape };
      `) as DomeEvaluator;
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
    (v: number) => v - Math.floor(v), Math.floor, (a: number, b: number) => a - b * Math.floor(a / b), Math.atan2,
    Math.min, (x: number, y: number, z: number) => ({ x, y, z }));
  return { color: new Color().setRGB(result.color[0]!, result.color[1]!, result.color[2]!), density: result.density, shape: result.shape };
}
function sampleDome(dome: ReturnType<typeof createSkyDome>, direction: Vector3): Color {
  return sampleDomeData(dome, direction).color;
}
const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const rayAt = (azimuth: number, elevation: number) => new Vector3(
  Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation),
);

// Four-connected silhouettes on the ticket's 360 × 90 angular grid. Join the seam
// and measure the shortest circular azimuth span, so a seam-crossing cloud is one cloud.
function cloudRegions(dome: ReturnType<typeof createSkyDome>) {
  const width = 360;
  const height = 90;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = Number(sampleDomeData(dome, rayAt((x + 0.5) * Math.PI / 180, (y + 0.5) * Math.PI / 180)).density >= 0.5);
    }
  }
  return connectedCloudRegions(mask, width, height, true);
}

function connectedCloudRegions(mask: Uint8Array, width: number, height: number, wrap = false) {
  const regions: { area: number; span: number; bottom: number; top: number }[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    const queue = [start];
    const columns = new Set<number>();
    let bottom = height;
    let top = 0;
    mask[start] = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!;
      const x = index % width;
      const y = Math.floor(index / width);
      columns.add(x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
      const left = x > 0 ? index - 1 : wrap ? index + width - 1 : -1;
      const right = x < width - 1 ? index + 1 : wrap ? index - width + 1 : -1;
      for (const next of [right, left, index - width, index + width]) {
        if (next < 0 || next >= mask.length || !mask[next]) continue;
        mask[next] = 0;
        queue.push(next);
      }
    }
    const sorted = [...columns].sort((a, b) => a - b);
    let gap = 0;
    sorted.forEach((column, i) => {
      const next = sorted[(i + 1) % sorted.length]! + (i === sorted.length - 1 ? width : 0);
      gap = Math.max(gap, next - column);
    });
    regions.push({ area: queue.length, span: wrap ? width - gap + 1 : sorted[sorted.length - 1]! - sorted[0]! + 1, bottom, top });
  }
  return regions;
}

// Angular sky crop: 55° azimuth × 30° above the horizon, quarter-degree cells.
// Gameplay yaw 0 looks towards -Z; camera translation/path grade cannot rotate the sky.
function cloudViewport(dome: ReturnType<typeof createSkyDome>, yaw = 0) {
  const step = 0.25;
  const width = 55 / step;
  const height = 30 / step;
  const densities = Array.from({ length: width * height }, (_, index) => sampleDomeData(dome, rayAt(
    -Math.PI / 2 - yaw + ((index % width + 0.5) * step - 27.5) * Math.PI / 180,
    (Math.floor(index / width) + 0.5) * step * Math.PI / 180,
  )).density);
  const mask = Uint8Array.from(densities, density => Number(density >= 0.5));
  const coverage = mask.reduce((sum, value) => sum + value, 0) / mask.length;
  const regions = connectedCloudRegions(mask, width, height);
  // Require a real 5°-tall clear patch, above the 6° horizon haze, not a single
  // empty scanline or a winding connected background slipping between puffs.
  let clearSpan = 0;
  for (let y = 6 / step; y <= height - 5 / step; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      let clear = true;
      for (let dy = 0; dy < 5 / step; dy++) {
        if (densities[(y + dy) * width + x]! > 0.1) { clear = false; break; }
      }
      run = clear ? run + 1 : 0;
      clearSpan = Math.max(clearSpan, run * step);
    }
  }
  return { coverage, regions, clearSpan, step };
}

// Frozen pre-B2-188 density, evaluated by the same CPU GLSL adapter as production.
const legacyCloudDensity = `
      float cloudHash(float x, float y, float period) {
        return fract(sin(mod(x, period) * 127.1 + y * 311.7) * 43758.5453);
      }
      float oldCloudNoise(float x, float y, float period) {
        float ix = floor(x);
        float iy = floor(y);
        float fx = fract(x);
        float fy = fract(y);
        float ux = fx * fx * (3.0 - 2.0 * fx);
        float uy = fy * fy * (3.0 - 2.0 * fy);
        return mix(mix(cloudHash(ix, iy, period), cloudHash(ix + 1.0, iy, period), ux),
          mix(cloudHash(ix, iy + 1.0, period), cloudHash(ix + 1.0, iy + 1.0, period), ux), uy);
      }
      float cloudDensity(vec3 direction) {
        float band = smoothstep(sin(radians(5.0)), sin(radians(10.0)), direction.y);
        band *= 1.0 - smoothstep(sin(radians(30.0)), sin(radians(35.0)), direction.y);
        float x = atan(direction.z, direction.x) * 5.09295818 + 16.0 + cloudTime * 0.025;
        float y = direction.y * 12.0;
        float puffs = 0.72 * oldCloudNoise(x, y, 32.0) + 0.21 * oldCloudNoise(x * 2.0, y * 2.0, 64.0);
        puffs += 0.07 * oldCloudNoise(x * 4.0, y * 4.0, 128.0);
        return band * smoothstep(0.52, 0.66, puffs);
      }
`;

// Interpolated angular distances between actual 10% and 90% crossings, in both
// directions. Ignore incomplete wisps that never reach an opaque core.
function edgeWidths(densities: number[], step: number) {
  const widths: number[] = [];
  for (const invert of [false, true]) {
    let start: number | undefined;
    for (let i = 1; i < densities.length; i++) {
      const a = invert ? 1 - densities[i - 1]! : densities[i - 1]!;
      const b = invert ? 1 - densities[i]! : densities[i]!;
      if (b <= 0.1) start = undefined;
      if (a <= 0.1 && b > 0.1) start = i - 1 + (0.1 - a) / (b - a);
      if (start !== undefined && a < 0.9 && b >= 0.9) {
        widths.push((i - 1 + (0.9 - a) / (b - a) - start) * step);
        start = undefined;
      }
    }
  }
  return widths.sort((a, b) => a - b);
}

function placedGrade(t: number) {
  const tod = timeOfDayAt(t);
  return applyCoastAtmosphere(directGrade(lightingAt(tod), tod), t);
}

const dawnTop = new Color(paletteColor(STYLE_PRESETS.R.background.sky.dawn.top));
const dawnHorizon = new Color(paletteColor(STYLE_PRESETS.R.background.sky.dawn.horizon));
const coastHorizon = new Color(paletteColor(STYLE_PRESETS.R.background.sky.dusk.horizon));
const coastTop = new Color(paletteColor(STYLE_PRESETS.R.background.sky.dusk.top));
const coastFog = coastTop.clone().lerp(coastHorizon, 0.55);

// Fixed 40% linear matte reference, no exposure/tone mapping/fog. Compare the mean of
// an upward plane and a wall facing the sun's azimuth. This is an illumination proxy,
// not a rendered-scene average; the separate shaded-prop check uses real palette finishes.
function referenceLuma(grade: LightingGrade) {
  const horizontalSun = Math.hypot(grade.sunDirection.x, grade.sunDirection.z);
  const floor = 0.4 * luma(grade.sunColor.clone().multiplyScalar(grade.sunIntensity * Math.max(0, grade.sunDirection.y))
    .add(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity)));
  const wall = 0.4 * luma(grade.sunColor.clone().multiplyScalar(grade.sunIntensity * horizontalSun)
    .add(grade.hemiGround.clone().lerp(grade.hemiSky, 0.5).multiplyScalar(grade.hemiIntensity)));
  return { floor, wall, mean: (floor + wall) / 2 };
}

describe("V6 dawn to dusk CPU reference", () => {
  it("keeps Horizon at the clear late-sun hill grade, brighter than forest and sea", () => {
    const horizon = ZONES.find(zone => zone.id === "horizon")!;
    const grade = placedGrade(horizon.t);
    expect(timeOfDayAt(horizon.t)).toBe(0.5);
    expect(grade.sunIntensity).toBe(2.2);
    expect(grade.hemiIntensity).toBe(1.6);
    expect(Math.asin(grade.sunDirection.y) * 180 / Math.PI).toBeCloseTo(35);
    expect(fogAt(horizon.t)).toEqual({ near: 120, far: 700 * WORLD_SCALE, forestWeight: 0 });
    expect(grade.fogColor).toEqual(new Color(PALETTE.skyLow));
    const reference = referenceLuma(grade).mean;
    for (const zone of ZONES.filter(zone => zone.biome !== "hill")) {
      expect(reference).toBeGreaterThan(referenceLuma(placedGrade(zone.t)).mean);
    }
  });

  it("preserves Old Trail's illumination while extending late sun to Horizon", () => {
    const oldTrail = ZONES.find(zone => zone.id === "old-trail")!;
    const legacyProgress = (oldTrail.t - 0.2) / 0.7;
    const legacy = referenceLuma(lightingAt(legacyProgress * legacyProgress * (3 - 2 * legacyProgress)));
    const current = referenceLuma(placedGrade(oldTrail.t));
    for (const key of ["floor", "wall", "mean"] as const) {
      expect(Math.abs(current[key] - legacy[key])).toBeLessThan(0.01);
    }
  });

  it.each([
    { t: 0.15, min: 0.20, max: 0.26, low: 3, high: 7 },
    { t: 0.93, min: 0.24, max: 0.30, low: 2, high: 5 },
  ])("keeps the two-plane mean and sun elevation within the $t target", ({ t, min, max, low, high }) => {
    const grade = placedGrade(t);
    const estimate = referenceLuma(grade);
    expect(estimate.mean).toBeGreaterThanOrEqual(min);
    expect(estimate.mean).toBeLessThanOrEqual(max);
    const elevation = Math.asin(grade.sunDirection.y) * 180 / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(low);
    expect(elevation).toBeLessThanOrEqual(high);
    if (t === 0.93) expect(grade.sunColor.r / grade.sunColor.b).toBeGreaterThanOrEqual(1.5);
    expect(referenceLuma(placedGrade(0.55)).mean).toBeGreaterThan(estimate.mean);
  });

  it("bounds each plane and the mean by 0.02 per 0.005 path step, including reversal", () => {
    let maximum = 0;
    // Offset the 0.005 windows by 0.001 as well, catching a peak between the main samples.
    for (let i = 5; i <= 1000; i++) {
      const a = referenceLuma(placedGrade((i - 5) / 1000));
      const b = referenceLuma(placedGrade(i / 1000));
      for (const key of ["floor", "wall", "mean"] as const) {
        const delta = Math.abs(b[key] - a[key]);
        maximum = Math.max(maximum, delta);
        expect(delta).toBeLessThanOrEqual(0.02);
      }
      expect(referenceLuma(placedGrade((i - 5) / 1000))).toEqual(a);
    }
    process.stdout.write(`B2-239 CPU maximum plane/mean step luma=${maximum.toFixed(5)} (path step 0.005)\n`);
  });

  it("releases forest sky/fog over the same 40 m in both directions, independently of light following", () => {
    const { start, end } = FOREST_ATMOSPHERE_TRANSITION;
    expect((end - start) * pathLength()).toBeCloseTo(40, 10);
    const dawn = placedGrade(start);
    const hill = placedGrade(end);
    const mid = placedGrade((start + end) / 2);
    expect(dawn.skyTop).toEqual(dawnTop);
    expect(hill.skyTop).toEqual(new Color(PALETTE.skyHigh));
    for (const key of ["skyTop", "skyHorizon", "fogColor"] as const) {
      expect(mid[key].toArray()).toEqual(dawn[key].clone().lerp(hill[key], 0.5).toArray().map(v => expect.closeTo(v, 12)));
      for (const boundary of [start, end]) {
        const before = placedGrade(boundary - 1e-7)[key];
        const after = placedGrade(boundary + 1e-7)[key];
        expect(Math.hypot(...before.toArray().map((v, i) => v - after.toArray()[i]!))).toBeLessThan(1e-6);
      }
    }
    placedGrade(end);
    expect(placedGrade(start)).toEqual(dawn);
  });

  it("retains >=0.12 displayed luma on shaded prop finishes at 15 m without direct sun", () => {
    const finishes = [new Color(PALETTE.rock), new Color(PALETTE.rockDark),
      new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.62)];
    for (const t of [0.15, 0.55, 0.93]) {
      const grade = placedGrade(t);
      expect(fogAt(t).near).toBeGreaterThan(15); // Native distance fog has not started.
      for (const normalY of [0, 1]) {
        const fill = grade.hemiGround.clone().lerp(grade.hemiSky, (normalY + 1) / 2).multiplyScalar(grade.hemiIntensity);
        for (const finish of finishes) {
          expect(luma(finish.clone().multiply(fill).convertLinearToSRGB())).toBeGreaterThanOrEqual(0.12);
        }
      }
    }
  });

  it("shares the opening dawn and final ending sunset grade with the walking scene", () => {
    const opening = directGrade(lightingAt(0), 0);
    const ending = applyCoastAtmosphere(directGrade(lightingAt(1), 1), 1);
    for (const key of GRADE_COLORS) {
      expect(placedGrade(0)[key].toArray()).toEqual(opening[key].toArray().map(v => expect.closeTo(v, 12)));
      expect(placedGrade(0.93)[key].toArray()).toEqual(ending[key].toArray().map(v => expect.closeTo(v, 12)));
    }
    expect(ending.sunDirection).toEqual(placedGrade(0.93).sunDirection);
    expect(ending.sunIntensity).toBe(placedGrade(0.93).sunIntensity);
  });
});

describe("position-driven sky grade", () => {
  // B2-180 replaces the noon-like A snapshots with low, warm dawn/dusk and reduced fill.
  it.each([0, 0.5, 1])("keeps palette-derived warm light and cool shadows at %s", tod => {
    const grade = lightingAt(tod);
    expect(grade.sunColor.r).toBeGreaterThan(grade.sunColor.g);
    expect(grade.sunColor.g).toBeGreaterThan(grade.sunColor.b);
    expect(grade.hemiSky.b).toBeGreaterThan(grade.hemiSky.g);
    expect(grade.shadowTint.b).toBeGreaterThan(grade.shadowTint.g);
    expect(grade.shadowTint.g).toBeGreaterThan(grade.shadowTint.r);
    expect(grade.sunDirection.length()).toBeCloseTo(1, 12);
    if (tod === 0) {
      expect(grade.sunIntensity).toBe(0.78);
      expect(grade.hemiIntensity).toBe(0.58);
      expect(grade.sunColor).toEqual(new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.6).lerp(new Color(PALETTE.flower), 0.03));
      expect(grade.sunDirection.x).toBeLessThan(0);
      expect(grade.sunDirection.z).toBeGreaterThan(0);
    } else if (tod === 0.5) {
      expect(grade.sunIntensity).toBe(2.2); // Softer late morning avoids ground glare and large luma steps.
      expect(grade.hemiIntensity / 2).toBe(0.8);
    } else {
      expect(grade.hemiIntensity / 0.95).toBeCloseTo(0.6);
      expect(grade.sunColor).toEqual(new Color(PALETTE.sunGold).lerp(new Color(PALETTE.flower), 0.3));
    }
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
    expect(lightingAt(0).skyTop).toEqual(dawnTop);
    expect(lightingAt(0).sunDirection.length()).toBeCloseTo(1);
    expect(lightingAt(timeOfDayAt(0.93))).toEqual(lightingAt(1));
  });
});

describe("coast dusk atmosphere", () => {
  it("keeps the sun low, seaward, on the walking route's right and ahead across the coast", () => {
    for (let i = 0; i <= 100; i++) {
      const t = 0.82 + 0.18 * i / 100;
      const { sunDirection } = lightingAt(timeOfDayAt(t));
      const forward = pathPointAt(Math.min(1, t + 0.001)).sub(pathPointAt(t - 0.001)).normalize();
      const right = forward.clone().cross(new Vector3(0, 1, 0));
      // B2-239: the sun travels from the 35-degree Horizon grade into dusk,
      // rather than prematurely reaching sunset on the hill itself.
      if (t >= 0.89) expect(sunDirection.z).toBeLessThan(0);
      expect(sunDirection.dot(right)).toBeGreaterThan(0);
      if (t >= 0.93) expect(sunDirection.dot(forward)).toBeGreaterThan(0);
      const elevation = Math.asin(sunDirection.y) * 180 / Math.PI;
      expect(elevation).toBeGreaterThan(0);
      expect(elevation).toBeLessThanOrEqual(t >= 0.93 ? 5 : t >= 0.89 ? 15 : 35);
    }
  });

  it("keeps an orange horizon warmer than forest, with deep blue overhead and legacy 400 m fog", () => {
    const grade = placedGrade(0.9);
    const forest = placedGrade(0.3);
    expect(grade.skyHorizon.toArray()).toEqual(coastHorizon.toArray().map(v => expect.closeTo(v, 12)));
    expect(grade.skyHorizon.r - grade.skyHorizon.b).toBeGreaterThan(forest.skyHorizon.r - forest.skyHorizon.b);
    expect(grade.skyTop).toEqual(coastTop);
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
    // Twice the samples preserve the old per-sample colour bound with the stronger sunset hue.
    for (let i = 1; i <= 200; i++) {
      const t = 0.76 + (0.89 - 0.76) * i / 200;
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
    expect(color).toEqual(grade.fogColor); // Dusk air no longer mixes back toward white paper.
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
    expect(first.sunIntensity).toBeCloseTo(dawn.sunIntensity + (dusk.sunIntensity - dawn.sunIntensity) * (1 - Math.exp(-0.3)), 12);
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
  it.each([0.15, 0.55, 0.86])("leaves large clear sky between unequal cloud masses in the 55° × 30° yaw-0 frame at path %s", pathT => {
    const dome = createSkyDome(placedGrade(pathT));
    try {
      for (const seconds of [0, 120, 320, 600, 960]) {
        dome.mesh.material.uniforms.cloudTime!.value = seconds;
        const { regions, clearSpan, step, coverage } = cloudViewport(dome);
        const areas = regions.map(region => region.area).sort((a, b) => a - b);
        const median = (areas[Math.floor((areas.length - 1) / 2)]! + areas[Math.floor(areas.length / 2)]!) / 2;
        expect(regions.length).toBeGreaterThanOrEqual(4);
        expect(regions.length).toBeLessThanOrEqual(15);
        expect(areas[areas.length - 1]! / median).toBeGreaterThanOrEqual(4);
        expect(clearSpan, `clear patch after ${seconds}s`).toBeGreaterThanOrEqual(30);
        expect(coverage).toBeGreaterThanOrEqual(0.2);
        expect(coverage).toBeLessThanOrEqual(0.35);
        const largest = regions.reduce((a, b) => a.area > b.area ? a : b);
        expect(largest.span * step).toBeGreaterThanOrEqual(15);
        expect(largest.span * step).toBeLessThanOrEqual(40);
      }
    } finally { dome.dispose(); }
  });

  it.each([0, 120, 600, 960])("has no azimuth density correlation above 0.5 at any 10–90 degree lag after %s seconds", seconds => {
    const dome = createSkyDome();
    try {
      dome.mesh.material.uniforms.cloudTime!.value = seconds;
      // Quarter-degree sampling also checks periods between integer degrees.
      const samples = Array.from({ length: 1440 }, (_, i) =>
        sampleDomeData(dome, rayAt(i * Math.PI / 720, 15 * Math.PI / 180)).density);
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0);
      expect(variance / samples.length).toBeGreaterThan(0.05);
      for (let lag = 40; lag <= 360; lag++) {
        const covariance = samples.reduce((sum, value, i) =>
          sum + (value - mean) * (samples[(i + lag) % samples.length]! - mean), 0);
        expect(covariance / variance, `lag ${lag / 4}°`).toBeLessThanOrEqual(0.5);
      }
    } finally { dome.dispose(); }
  });

  it.each([0, 120, 600])("varies connected cloud sizes by at least 3× without a region spanning 120° after %s seconds", seconds => {
    const dome = createSkyDome();
    try {
      dome.mesh.material.uniforms.cloudTime!.value = seconds;
      const regions = cloudRegions(dome);
      // Ignore sub-grid flecks for the size comparison, but include every fleck in the span gate.
      const areas = regions.filter(region => region.area >= 4).map(region => region.area);
      expect(areas.length).toBeGreaterThan(20);
      expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...regions.map(region => region.span))).toBeLessThanOrEqual(120);
    } finally { dome.dispose(); }
  });

  it("keeps round overhead undersides translucent and dark, with no high-latitude cut or azimuth seam", () => {
    const dome = createSkyDome();
    try {
      let overheadCores = 0;
      for (let elevation = 76; elevation < 89; elevation += 0.5) {
        for (let azimuth = 0; azimuth < 360; azimuth += 2) {
          const { density, shape } = sampleDomeData(dome, rayAt(azimuth * Math.PI / 180, elevation * Math.PI / 180));
          if (shape.x < 0.1) continue;
          expect(density).toBeGreaterThan(0.7);
          expect(density).toBeLessThan(0.8);
          expect(shape.y).toBeLessThan(0.5); // The underside stays below the bright crown ramp.
          overheadCores++;
        }
      }
      expect(overheadCores).toBeGreaterThan(40);
      for (let elevation = 5; elevation <= 85; elevation++) {
        const a = sampleDomeData(dome, rayAt(-Math.PI + 1e-8, elevation * Math.PI / 180));
        const b = sampleDomeData(dome, rayAt(Math.PI - 1e-8, elevation * Math.PI / 180));
        expect(Math.abs(a.density - b.density)).toBeLessThan(1e-4);
      }
    } finally { dome.dispose(); }
  });

  it("makes painted 10–90 percent silhouette edges at least four times narrower than the old blur", () => {
    const dome = createSkyDome();
    const old = createSkyDome();
    old.mesh.material.fragmentShader = old.mesh.material.fragmentShader.replace(
      /float cloudDensity\(vec3 direction\) \{[^}]+\}/, legacyCloudDensity,
    );
    try {
      const step = 2 * Math.PI / 16384;
      const widths: number[][] = [[], []];
      for (const elevation of [12, 16, 20, 24, 28]) {
        for (const [index, sky] of [dome, old].entries()) {
          const samples = Array.from({ length: 16385 }, (_, i) =>
            sampleDomeData(sky, rayAt(-Math.PI + i * step, elevation * Math.PI / 180)).density);
          widths[index]!.push(...edgeWidths(samples, step));
        }
      }
      widths.forEach(values => {
        values.sort((a, b) => a - b);
        expect(values.length).toBeGreaterThan(40);
      });
      // Compare the distributions, rather than one convenient hand-picked edge.
      for (const quantile of [0.1, 0.5, 0.9]) {
        const current = widths[0]![Math.floor((widths[0]!.length - 1) * quantile)]!;
        const previous = widths[1]![Math.floor((widths[1]!.length - 1) * quantile)]!;
        expect(current).toBeLessThanOrEqual(previous / 4);
      }
    } finally { dome.dispose(); old.dispose(); }
  });

  it.each([0.15, 0.93])("gives individual cloud crowns at least 15 percent more luma than their bases at path %s", pathT => {
    const dome = createSkyDome(placedGrade(pathT));
    try {
      let pairs = 0;
      for (let column = 0; column < 96; column++) {
        let base: ReturnType<typeof sampleDomeData> | undefined;
        for (let row = 0; row < 512; row++) {
          const sample = sampleDomeData(dome, rayAt(column * 2 * Math.PI / 96, Math.asin((row + 0.5) / 512)));
          if (sample.density < 0.99) { base = undefined; continue; }
          if (sample.shape.y >= 0.12 && sample.shape.y <= 0.2) base = sample;
          if (base && sample.shape.y >= 0.72 && sample.shape.y <= 0.82) {
            expect(luma(sample.color)).toBeGreaterThanOrEqual(luma(base.color) * 1.15);
            pairs++;
            base = undefined;
          }
        }
      }
      expect(pairs).toBeGreaterThan(40);
      const crown = dome.mesh.material.uniforms.cloud!.value as Color;
      const base = dome.mesh.material.uniforms.cloudBase!.value as Color;
      expect(base.r).toBeGreaterThan(base.b); // Pink/peach condensation base.
      if (pathT === 0.15) expect(base.b).toBeGreaterThan(base.g); // Grey-pink, rather than brown.
      if (pathT === 0.93) {
        expect(crown.r).toBeGreaterThan(crown.g);
        expect(crown.b).toBeGreaterThan(crown.g); // Muted violet-grey away from the warm rim.
        expect(Math.max(crown.r, crown.g, crown.b) - Math.min(crown.r, crown.g, crown.b)).toBeLessThan(0.1);
      }
    } finally { dome.dispose(); }
  });

  it.each([0.15, 0.93])("puts the warm cloud rim on the sun-facing shoulder at path %s", pathT => {
    const dome = createSkyDome(placedGrade(pathT));
    try {
      let checked = 0;
      for (let row = 0; row < 32; row++) {
        const elevation = Math.asin(0.52 + row * 0.012);
        for (let column = 0; column < 128; column++) {
          const azimuth = column * 2 * Math.PI / 128;
          const ray = rayAt(azimuth, elevation);
          const { shape, density } = sampleDomeData(dome, ray);
          if (shape.x < 0.03 || shape.x > 0.12 || shape.y < 0.6 || Math.abs(shape.z) < 0.3 || density < 0.99) continue;
          // Above the halo and well away from the sun disc: only cloud lighting changes.
          const turn = Math.sign(shape.z) * Math.PI / 2;
          dome.mesh.material.uniforms.sunDirection!.value.copy(rayAt(azimuth + turn, 0.05));
          const lit = sampleDome(dome, ray);
          dome.mesh.material.uniforms.sunDirection!.value.copy(rayAt(azimuth - turn, 0.05));
          const shaded = sampleDome(dome, ray);
          expect(lit.r - lit.b).toBeGreaterThan(shaded.r - shaded.b);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(10);
    } finally { dome.dispose(); }
  });

  it("makes distant silhouettes smaller and flatter than the high cumulus crowns", () => {
    const dome = createSkyDome();
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    try {
      // B2-188b has no row centres. Compare complete connected silhouettes in
      // angular elevation ranges, including the intentionally sparse high clouds.
      const regions = cloudRegions(dome).filter(region => region.area >= 4);
      const sizes = [[5, 20], [30, 75]].map(([low, high]) => {
        const clouds = regions.filter(region => {
          const middle = (region.bottom + region.top + 1) / 2;
          return middle >= low! && middle <= high!;
        });
        expect(clouds.length).toBeGreaterThan(3);
        const widths = clouds.map(region => region.span * Math.cos((region.bottom + region.top + 1) * Math.PI / 360));
        const heights = clouds.map(region => region.top - region.bottom + 1);
        return { count: clouds.length, width: mean(widths), height: mean(heights) };
      });
      expect(sizes[0]!.count).toBeGreaterThan(sizes[1]!.count);
      expect(sizes[0]!.width).toBeLessThan(sizes[1]!.width * 0.9);
      expect(sizes[0]!.height).toBeLessThan(sizes[1]!.height * 0.5);
      expect(sizes[0]!.height / sizes[0]!.width).toBeLessThan(sizes[1]!.height / sizes[1]!.width * 0.75);
    } finally { dome.dispose(); }
  });

  it("makes the dusk halo warmer than dawn and gives dusk clouds orange undersides", () => {
    const grades = [placedGrade(0.15), placedGrade(0.93)];
    const domes = grades.map(grade => createSkyDome(grade));
    try {
      const warmth = domes.map((dome, i) => {
        const sun = grades[i]!.sunDirection;
        const ray = new Vector3(sun.x, 0, sun.z).normalize()
          .multiplyScalar(Math.cos(3 * Math.PI / 180)).setY(Math.sin(3 * Math.PI / 180))
          .applyAxisAngle(new Vector3(0, 1, 0), 20 * Math.PI / 180);
        const lit = sampleDome(dome, ray);
        dome.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
        const unlit = sampleDome(dome, ray);
        const halo = lit.sub(unlit);
        expect(luma(halo)).toBeGreaterThan(0.01);
        return (halo.r - halo.b) / luma(halo);
      });
      expect(warmth[1]).toBeGreaterThan(warmth[0]!);
      const base = domes[1]!.mesh.material.uniforms.cloudBase!.value as Color;
      expect(base.r).toBeGreaterThan(base.b);
      const dawnBase = domes[0]!.mesh.material.uniforms.cloudBase!.value as Color;
      expect(base.r - base.b).toBeGreaterThan(dawnBase.r - dawnBase.b);
      domes[0]!.update(grades[1]!);
      domes[1]!.update(grades[1]!); // Restore the glow disabled for the halo reference.
      for (const key of ["sunGlow", "cloud", "cloudBase"] as const) {
        expect(domes[0]!.mesh.material.uniforms[key]!.value).toEqual(domes[1]!.mesh.material.uniforms[key]!.value);
      }
    } finally { domes.forEach(dome => dome.dispose()); }
  });

  // B2-188c lowers cover to 20–35% to leave larger areas of quiet sky. Keep the
  // equal-solid-angle hemisphere measurement and all existing colour/edge checks.
  it.each([0.15, 0.3, 0.9, 0.93])("keeps 20–35 percent solid-angle cloud cover above the horizon at path %s", pathT => {
    const dome = createSkyDome(placedGrade(pathT));
    try {
      dome.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
      for (const seconds of [0, 120, 600]) {
        dome.mesh.material.uniforms.cloudTime!.value = seconds;
        let cloudy = 0;
        const densities: number[] = [];
        for (let row = 0; row < 48; row++) {
          // Equal increments of sin(elevation) give equal solid-angle samples.
          const elevation = Math.asin((row + 0.5) / 48);
          for (let column = 0; column < 192; column++) {
            const ray = rayAt((column + 0.5) * 2 * Math.PI / 192, elevation);
            const sample = sampleDomeData(dome, ray);
            densities.push(sample.density);
            if (sample.density >= 0.5) {
              cloudy++;
              expect(luma(sample.color)).toBeGreaterThan(0.06);
            }
          }
        }
        const coverage = cloudy / (48 * 192);
        expect(coverage).toBeGreaterThanOrEqual(0.20);
        expect(coverage).toBeLessThanOrEqual(0.35);
        expect(densities.some(value => value > 0 && value < 0.5)).toBe(true); // Soft painted edges.
        expect(densities.some(value => value > 0.99)).toBe(true); // White opaque cores.
      }
      for (const elevation of [-20, 0, 90]) {
        for (let azimuth = 0; azimuth < 360; azimuth += 15) {
          expect(sampleDomeData(dome, rayAt(azimuth * Math.PI / 180, elevation * Math.PI / 180)).density).toBeCloseTo(0, 12);
        }
      }
    } finally { dome.dispose(); }
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
          // Resolve the seam at 1e-10 radians now that painted edges are much steeper.
          const ray = rayAt(Math.PI - 1e-10, elevation * Math.PI / 180);
          const sample = sampleDomeData(dome, ray);
          expect(sampleDomeData(twin, ray)).toEqual(sample);
          expect(sampleDomeData(dome, rayAt(-Math.PI + 1e-10, elevation * Math.PI / 180)).density).toBeCloseTo(sample.density, 5);
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
      expect(dome.mesh.material.uniforms.sunGlow!.value).toEqual(grade.sunColor);
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

  it("uses pale blue-grey overhead and a peach/gold forest horizon without a paper wash", () => {
    const dome = createSkyDome(placedGrade(0.3));
    try {
      dome.mesh.material.uniforms.sunGlow!.value.setRGB(0, 0, 0);
      const horizon = sampleDome(dome, new Vector3(1, 0, 0));
      const zenith = sampleDome(dome, new Vector3(0, 1, 0));
      expect(horizon).toEqual(dawnHorizon);
      expect(horizon.r).toBeGreaterThan(horizon.b);
      expect(zenith.toArray()).toEqual(dawnTop.toArray().map(v => expect.closeTo(v, 12)));
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
    expect(material.uniforms.cloud!.value).toEqual(new Color(PALETTE.cloud).lerp(lightingAt(0).skyTop, 0.25).lerp(lightingAt(0).sunColor, 0.12));
    expect(material.uniforms.cloudBase!.value).toEqual(new Color(PALETTE.cloud).lerp(new Color(PALETTE.indigo), 0.7).lerp(new Color(PALETTE.vermilion), 0.18).lerp(dawnHorizon, 0.06).lerp(lightingAt(0).sunColor, 0.03));
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
