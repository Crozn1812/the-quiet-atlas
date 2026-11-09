import { fract, waterNoiseFunctions, waterNoiseSampler } from "./water-noise";
import { Color, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { directGrade } from "../../../src/features/world/scene/compose";
import {
  createWaterMaterial, SEA_FOAM_MAX_SLOPE, SEA_SHORE_SAMPLES, SEA_WAVE_PERIOD, type WaterMaterial,
} from "../../../src/features/world/water/material";
import { WATER_LEVEL } from "../../../src/features/world/water/ribbon";
import { createSea, SEA_RENDER_SIZE } from "../../../src/features/world/water/sea";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

// Three's ACESFilmicToneMapping, exposure=1, followed by the output transfer.
function displayColor(linear: Color, aces = true): Color {
  if (!aces) return linear.clone().convertLinearToSRGB();
  const { r, g, b } = linear.clone().multiplyScalar(1 / 0.6);
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537)
    / (v * (0.983729 * v + 0.432951) + 0.238081);
  const x = fit(0.59719 * r + 0.35458 * g + 0.04823 * b);
  const y = fit(0.076 * r + 0.90834 * g + 0.01566 * b);
  const z = fit(0.0284 * r + 0.13383 * g + 0.83777 * b);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return new Color().setRGB(clamp(1.60475 * x - 0.53108 * y - 0.07367 * z),
    clamp(-0.10208 * x + 1.10813 * y - 0.00605 * z),
    clamp(-0.00327 * x - 0.07276 * y + 1.07602 * z)).convertLinearToSRGB();
}

// Execute the actual scalar GLSL in JS, so width/strength/foam regressions cannot
// leave a separately copied CPU formula passing. Only trusted local shader text runs.
const scalarPrograms = new WeakMap<WaterMaterial, Map<string, (inputs: Record<string, unknown>) => Record<string, number>>>();
function scalars(material: WaterMaterial, start: string, end: string, inputs: Record<string, unknown>, outputs: string[]) {
  const key = JSON.stringify([start, end, Object.keys(inputs), outputs]);
  let programs = scalarPrograms.get(material);
  if (!programs) {
    programs = new Map();
    scalarPrograms.set(material, programs);
  }
  const cached = programs.get(key);
  if (cached) return cached(inputs);
  const startIndex = material.fragmentShader.indexOf(start);
  const endIndex = material.fragmentShader.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  const source = material.fragmentShader.slice(startIndex, endIndex)
    .replace(/\b(float|int)\s+/g, "let ")
    .replace(/\bfloat\(/g, "Number(")
    .replace(/\bint\(/g, "Math.trunc(")
    .replace(/uSunDirection\.y/g, "sunElevation")
    .replace(/length\(horizonRay\)/g, "horizonRange")
    .replace(/viewMatrix\[1\]\[2\]/g, "cameraDownTilt")
    .replace(/\b(sin|cos|sqrt|abs|max|min|floor)\(/g, "Math.$1(")
    .replace(/SEA_FOAM_MAX_SLOPE/g, String(SEA_FOAM_MAX_SLOPE))
    .replace(/fwidth\(alongSun \* 0.24 \* perspective\)/g, "washPixelWidth")
    .replace(/fwidth\(alongSun \* 1.7\)/g, "glimmerPixelWidth")
    .replace(/#ifndef SEA_WATER[\s\S]*?#endif/g, "")
    .replace(/#ifdef SEA_WATER|#endif/g, "")
    .replace(/fwidth\(offshore\)/g, "offshorePixelWidth");
  const evaluate = new Function("inputs", "smoothstep", "mix", "clamp", "fract", `
    "use strict";
    ${waterNoiseFunctions(material.fragmentShader)}
    const { ${Object.keys(inputs).join(", ")} } = inputs;
    ${source}
    return { ${outputs.join(", ")} };
  `);
  const program = (values: Record<string, unknown>) => evaluate(values, smoothstep, mix,
    (x: number, a: number, b: number) => Math.max(a, Math.min(b, x)), fract) as Record<string, number>;
  programs.set(key, program);
  return program(inputs);
}

function seaPigment(material: WaterMaterial, point: Vector3) {
  const uniform = material.uniforms;
  const { offshore, shallows } = scalars(material, "float shoreSample =", "color = mix(uDeepColor", {
    vWaterWorld: point,
    uShoreBounds: uniform.uShoreBounds!.value,
    uShoreZ: uniform.uShoreZ!.value,
    uHasShore: uniform.uHasShore!.value,
  }, ["offshore", "shallows"]);
  const color = (uniform.uDeepColor!.value as Color).clone().lerp(uniform.uEdgeColor!.value, shallows!);
  return { color, offshore: offshore!, shallows: shallows! };
}

function washAt(material: WaterMaterial, alongSun: number, signedAcrossSun: number, phase: number,
  washPixelWidth = 0, glimmerPixelWidth = 0) {
  return scalars(material, "// Sun wash scalars: also evaluated directly by the CPU colour regression.",
    "// End sun wash scalars.", {
      alongSun, signedAcrossSun, acrossSun: Math.abs(signedAcrossSun), phase,
      sunElevation: material.uniforms.uSunDirection!.value.y, washPixelWidth, glimmerPixelWidth,
    }, ["washStrength", "washWidth", "core", "glimmer", "washMarks", "distanceFade"]);
}

function sunsetAt(material: WaterMaterial, skyAlignment: number, grazing: number, horizonRange: number, offshore = 100, cameraDownTilt = 0) {
  return scalars(material, "// Begin sea sunset pigment scalars.", "// End sea sunset pigment scalars.", {
    skyAlignment, grazing, horizonRange, offshore, cameraDownTilt, sunElevation: material.uniforms.uSunDirection!.value.y,
  }, ["sunsetPigment"]).sunsetPigment!;
}

// Full sea pigment/swell/Fresnel/wash in linear working space, before
// renderer tone mapping and scene fog. Samples are offshore, beyond the foam.
function seaColor(material: WaterMaterial, point: Vector3, camera: Vector3, cameraDownTilt = 0): Color {
  const uniform = material.uniforms;
  const time = uniform.uTime!.value as number;
  const phase = time * Number((2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10));
  const { color, offshore } = seaPigment(material, point);
  expect(offshore).toBeGreaterThan(5);
  const skyMix = uniform.uSkyMix!.value as number;
  const { field } = waterNoiseSampler(material.fragmentShader);
  const swell = field(point.x, point.z - time * 0.05) - 0.5;
  const crossSwell = field(point.x + 0.11, point.z - time * 0.05) - 0.5;
  const { seaStroke } = scalars(material, "// Begin sea ripple scalars.", "// End sea ripple scalars.", {
    vWaterWorld: point, uTime: time, phase, offshore, uHasShore: uniform.uHasShore!.value,
    rippleDistanceFade: 1 - smoothstep(15, 40, point.distanceTo(camera)),
  }, ["seaStroke"]);
  color.lerp(uniform.uPaperColor!.value, 0.00875).multiplyScalar(1 + 0.24 * seaStroke!);
  if (material.defines.WATER_REFLECTION) {
    const normal = new Vector3(crossSwell * 0.006 * seaStroke!, 1, swell * 0.006 * seaStroke!).normalize();
    const grazing = 1 - Math.max(0, Math.min(1, normal.dot(camera.clone().sub(point).normalize())));
    const { reflection } = scalars(material, "float fresnel =", "color = mix(color, uSkyHorizon", {
      grazing, SKY_REFLECTION: Number(material.defines.SKY_REFLECTION), uSkyMix: skyMix, offshore,
    }, ["reflection"]);
    color.lerp(uniform.uSkyHorizon!.value, reflection!);
    const horizonRay = new Vector2(point.x - camera.x, point.z - camera.z);
    const horizonSun = new Vector2(uniform.uSunDirection!.value.x, uniform.uSunDirection!.value.z);
    const skyAlignment = horizonRay.dot(horizonSun) / Math.max(horizonRay.length() * horizonSun.length(), 0.0001);
    const { coolReflection } = scalars(material, "// Begin sea horizon scalars.", "// End sea horizon scalars.",
      { reflection, skyAlignment, grazing }, ["coolReflection"]);
    // Color.sub clamps negative channels; GLSL subtraction is signed.
    for (const channel of ["r", "g", "b"] as const) {
      color[channel] += (uniform.uDeepColor!.value[channel] - uniform.uSkyHorizon!.value[channel]) * coolReflection!;
    }
    color.lerp(uniform.uSunWashColor!.value,
      sunsetAt(material, skyAlignment, grazing, horizonRay.length(), offshore, cameraDownTilt));
  }
  const sun = uniform.uSunDirection!.value as Vector3;
  const axis = new Vector2(sun.x, sun.z).normalize();
  const offset = new Vector2(point.x - camera.x, point.z - camera.z);
  const strength = washAt(material, offset.dot(axis), offset.dot(new Vector2(-axis.y, axis.x)), phase).washStrength!;
  return color.lerp(uniform.uSunWashColor!.value, strength);
}

describe("B2-244 downward gameplay sunset", () => {
  it.each(["Low", "Balanced", "High"] as const)("lights distant %s gameplay water while preserving low ending views", quality => {
    const material = createWaterMaterial(quality, { surface: "sea" });
    try {
      material.setGrade(applyCoastAtmosphere(directGrade(lightingAt(1), 1), 1));
      const axis = (material.uniforms.uSunDirection!.value as Vector3).clone().setY(0).normalize()
        .applyAxisAngle(new Vector3(0, 1, 0), 25 * Math.PI / 180);
      for (const height of [8, 10, 12]) for (const distance of [40, 80, 120]) {
        const camera = new Vector3(0, WATER_LEVEL + height, 0);
        const point = axis.clone().multiplyScalar(distance).setY(WATER_LEVEL);
        const grazing = 1 - height / Math.hypot(height, distance);
        const pigment = sunsetAt(material, Math.cos(25 * Math.PI / 180), grazing, distance, 100, 0.5);
        expect(pigment).toBeGreaterThan(0.05);
        const warm = displayColor(seaColor(material, point, camera, 0.5));
        const prior = displayColor(seaColor(material, point, camera));
        expect(luma(warm)).toBeGreaterThan(luma(prior));
        expect(warm.r / warm.b).toBeGreaterThan(prior.r / prior.b + 0.3);
      }
      for (const height of [0.6, 2, 8]) for (const distance of [40, 80, 120]) {
        const grazing = 1 - height / Math.hypot(height, distance);
        // Ending's near-horizontal camera (about 4.6 degrees) never enables the new frame mask.
        expect(sunsetAt(material, 1, grazing, distance, 100, 0.08)).toBe(0);
      }
      expect(sunsetAt(material, 1, 1, 80, 100, 0.5)).toBe(0);
      expect(sunsetAt(material, -1, 0.9, 80, 100, 0.5)).toBe(0);
    } finally { material.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("opens only the coastal %s river into indigo and directional sunset", quality => {
    const river = createWaterMaterial(quality);
    const reference = createWaterMaterial(quality);
    try {
      const grade = directGrade(lightingAt(1), 1);
      reference.setGrade(grade);
      river.setGrade(applyCoastAtmosphere(directGrade(lightingAt(1), 1), 0.93));
      const deep = (river.uniforms.uDeepColor!.value as Color).clone();
      expect(deep.b).toBeGreaterThan(deep.r);
      expect(luma(deep)).toBeGreaterThan(luma(reference.uniforms.uDeepColor!.value));
      const sample = (riverAlignment: number, grazing: number) =>
        scalars(river, "// Begin river sunset scalars.", "// End river sunset scalars.", {
          uCoastWeight: river.uniforms.uCoastWeight!.value, riverAlignment, grazing,
        }, ["riverSunset"]).riverSunset!;
      expect(sample(1, 0.4)).toBeCloseTo(0.08);
      expect(sample(-1, 0.4)).toBe(0);
      expect(sample(1, 1)).toBe(0);
      river.setGrade(grade);
      expect(sample(1, 0.4)).toBe(0);
      expect(river.uniforms.uDeepColor!.value).toEqual(reference.uniforms.uDeepColor!.value);
      river.setGrade(applyCoastAtmosphere(directGrade(lightingAt(1), 1), 0.93));
      expect(river.uniforms.uDeepColor!.value).toEqual(deep);
    } finally { river.dispose(); reference.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps a chromatic %s sunset under a downward camera", quality => {
    const material = createWaterMaterial(quality, { surface: "sea",
      shoreline: { minX: -1000, width: 2000, z: Array<number>(SEA_SHORE_SAMPLES).fill(1000) },
    });
    try {
      material.setGrade(applyCoastAtmosphere(directGrade(lightingAt(1), 1), 1));
      // Outside the existing +/-12 degree glints: isolate the broad sunset pigment.
      const sun = (material.uniforms.uSunDirection!.value as Vector3).clone().setY(0).normalize()
        .applyAxisAngle(new Vector3(0, 1, 0), 25 * Math.PI / 180);
      let minimum = Infinity, maximum = 0;
      for (const distance of [20, 40, 80]) for (const heightRatio of [0.5, 1, 2]) {
        const camera = new Vector3(0, WATER_LEVEL + distance * heightRatio, 0);
        const point = sun.clone().multiplyScalar(distance).setY(WATER_LEVEL);
        const away = point.clone().multiplyScalar(-1).setY(WATER_LEVEL);
        for (const aces of [false, true]) {
          const warm = displayColor(seaColor(material, point, camera), aces);
          const cool = displayColor(seaColor(material, away, camera), aces);
          expect(warm.r / warm.b).toBeGreaterThan(cool.r / cool.b + 0.3);
          expect(warm.r - warm.b).toBeGreaterThan(cool.r - cool.b + 0.04); // Purple-to-orange shift, retaining blue at the fade.
          expect(cool.b).toBeGreaterThan(cool.r);
          expect(luma(warm)).toBeGreaterThan(luma(cool));
          expect(luma(warm)).toBeLessThan(0.35); // Surface samples, not frame luma.
          minimum = Math.min(minimum, luma(warm)); maximum = Math.max(maximum, luma(warm));
        }
      }
      process.stdout.write(`${quality} downward sunward surface luma=${minimum.toFixed(4)}-${maximum.toFixed(4)} (not frame luma)\n`);
    } finally { material.dispose(); }
  });

  it("fades the new pigment smoothly out of the ending horizon, far sea and unlit side", () => {
    const material = createWaterMaterial("Balanced", { surface: "sea" });
    try {
      expect(sunsetAt(material, 1, 0.2, 40)).toBeGreaterThan(0.05);
      let previous = sunsetAt(material, 1, 0.35, 80);
      for (let i = 1; i <= 100; i++) {
        const value = sunsetAt(material, 1, 0.35 + 0.3 * i / 100, 80);
        expect(value).toBeLessThanOrEqual(previous);
        expect(previous - value).toBeLessThan(0.002);
        previous = value;
      }
      for (const grazing of [0, 0.5, 0.9, 0.96, 1]) {
        expect(sunsetAt(material, -0.15, grazing, 40)).toBe(0);
        expect(sunsetAt(material, 1, grazing, 320)).toBe(0);
      }
      for (const distance of [20, 80, 160, 320]) expect(sunsetAt(material, 1, 0.65, distance)).toBe(0);
      expect(sunsetAt(material, 1, 0.5, 40, 6)).toBeLessThan(sunsetAt(material, 1, 0.5, 40, 60));
      material.setSunDirection(new Vector3(0.8, 0, -0.6));
      expect(sunsetAt(material, 1, 0.2, 40)).toBe(0);
      material.setSunDirection(new Vector3(0, 1, 0));
      expect(sunsetAt(material, 1, 0.2, 40)).toBe(0);
    } finally { material.dispose(); }
  });
});

describe("road-view sunset sea", () => {
  it.each(["Low", "Balanced", "High"] as const)("reflects a smooth indigo-to-orange sunset that follows the %s sun", quality => {
    const material = createWaterMaterial(quality, { surface: "sea",
      shoreline: { minX: -1000, width: 2000, z: Array<number>(SEA_SHORE_SAMPLES).fill(1000) },
    });
    const camera = new Vector3(0, WATER_LEVEL + 8, 0);
    const sample = (angle: number, distance = 120) => {
      const direction = (material.uniforms.uSunDirection!.value as Vector3).clone();
      direction.y = 0;
      direction.normalize().applyAxisAngle(new Vector3(0, 1, 0), angle * Math.PI / 180);
      return seaColor(material, direction.multiplyScalar(distance).setY(WATER_LEVEL), camera);
    };
    try {
      const grade = applyCoastAtmosphere(lightingAt(1), 1);
      material.setGrade(grade);
      const warm = sample(40); // Outside the narrow +/-12 degree glint corridor.
      const cool = sample(140);
      const sunward = sample(0, 80);
      expect(sunward.r).toBeGreaterThan(sunward.b);
      expect(warm.r / warm.b).toBeGreaterThan(cool.r / cool.b + 0.5);
      expect(cool.b).toBeGreaterThan(cool.r);
      expect(luma(warm)).toBeGreaterThan(luma(cool));
      let previous = sample(40);
      for (let angle = 41; angle <= 140; angle++) {
        const color = sample(angle);
        expect(Math.abs(luma(color) - luma(previous))).toBeLessThan(0.005);
        previous = color;
      }
      grade.sunDirection.applyAxisAngle(new Vector3(0, 1, 0), 0.6);
      material.setGrade(grade);
      for (const [angle, expected] of [[40, warm], [140, cool]] as const) {
        expect(sample(angle).toArray()).toEqual(expected.toArray().map(value => expect.closeTo(value, 12)));
      }
    } finally { material.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("reflects more of the grade horizon at grazing angles and farther offshore on %s", quality => {
    const material = createWaterMaterial(quality, { surface: "sea" });
    try {
      const reflectionAt = (grazing: number, offshore: number) => scalars(material,
        "float fresnel =", "color = mix(color, uSkyHorizon", {
          grazing, offshore, SKY_REFLECTION: Number(material.defines.SKY_REFLECTION), uSkyMix: 1,
        }, ["reflection"]).reflection!;
      expect(reflectionAt(0, 300)).toBe(0);
      expect(reflectionAt(1, 300)).toBeGreaterThan(reflectionAt(0.5, 300));
      expect(reflectionAt(1, 300)).toBeGreaterThan(reflectionAt(1, 5));
      const grade = applyCoastAtmosphere(lightingAt(1), 0.93);
      const noon = applyCoastAtmosphere(lightingAt(0.5), 0.55).skyHorizon;
      material.setGrade(grade);
      const horizon = (material.uniforms.uSkyHorizon!.value as Color).clone();
      expect(horizon.r / horizon.b).toBeGreaterThan(noon.r / noon.b);
      grade.skyHorizon.set(PALETTE.skyLow);
      material.setGrade(grade);
      expect(material.uniforms.uSkyHorizon!.value).not.toEqual(horizon);
    } finally { material.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps %s dusk water dark and warmer than noon, including the sun wash", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      const camera = new Vector3(0, 1.7, -860);
      const onAxis = new Vector3(64, WATER_LEVEL, -908);
      const points = [onAxis, ...[-40, 40].map(offset => onAxis.clone()
        .add(new Vector3(0.6, 0, 0.8).multiplyScalar(offset))),
      new Vector3(64, WATER_LEVEL, -1100), new Vector3(64, WATER_LEVEL, -1400)];
      const samples = (t: number) => {
        material.setGrade(applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t));
        return Array.from({ length: 17 }, (_, frame) => {
          material.uniforms.uTime!.value = frame * SEA_WAVE_PERIOD / 16;
          return points.map(point => seaColor(material, point, camera));
        }).flat();
      };
      const noon = samples(0.55), dusk = samples(0.93);
      for (let i = 0; i < dusk.length; i++) {
        const color = dusk[i]!;
        expect(luma(color)).toBeLessThanOrEqual(0.35);
        expect(color.r / color.b).toBeGreaterThan(noon[i]!.r / noon[i]!.b);
        expect(luma(color.clone().convertLinearToSRGB())).toBeGreaterThanOrEqual(0.06);
      }
      process.stdout.write(`${quality} t=0.93: maximum sea luma=${Math.max(...dusk.map(luma)).toFixed(4)}\n`);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps the %s wash visibly brighter and warmer across the slow cycle", quality => {
    const camera = new Vector3(0, 1.7, -860);
    const sun = new Vector3(0.8, 0.14, -0.6);
    const sea = createSea(quality, { sunDirection: sun });
    try {
      const material = sea.mesh.material;
      const onAxis = new Vector3(64, WATER_LEVEL, -908);
      const offAxis = [-40, 40].map(offset => onAxis.clone().add(new Vector3(0.6, 0, 0.8).multiplyScalar(offset)));
      let minContrast = Infinity;
      let minWarmth = Infinity;
      for (const point of [onAxis, ...offAxis]) {
        expect(worldHeight(point.x, point.z)).toBeLessThan(WATER_LEVEL);
      }
      // 0.35 is the current composed dusk grade; 0 and 1 cover the public sky-mix range.
      for (const skyMix of [0, 0.35, 1]) {
        sea.setSkyMix(skyMix);
        for (let frame = 0; frame <= 32; frame++) {
          material.uniforms.uTime!.value = frame * SEA_WAVE_PERIOD / 32;
          const centre = seaColor(material, onAxis, camera);
          for (const point of offAxis) {
            const outside = seaColor(material, point, camera);
            minContrast = Math.min(minContrast, luma(centre) - luma(outside));
            minWarmth = Math.min(minWarmth, (centre.r - centre.b) - (outside.r - outside.b));
            expect(luma(centre) - luma(outside), `${quality}, grade=${skyMix}, frame=${frame}`).toBeGreaterThanOrEqual(0.07); // 70% of the former contrast, per B2-229.
            expect(centre.r - centre.b).toBeGreaterThan(outside.r - outside.b);
          }
        }
      }
      console.info(`${quality} sunset: minimum luma gain=${minContrast.toFixed(4)}, R-B gain=${minWarmth.toFixed(4)}`);
    } finally { sea.dispose(); }
  });

  it("spreads toward the viewer, keeps a distant core and breaks transverse glints into short marks", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      expect(washAt(material, 40, 0, 0).washWidth).toBeGreaterThan(washAt(material, 300, 0, 0).washWidth!);
      expect(washAt(material, 300, 0, 0).core).toBeGreaterThan(washAt(material, 40, 0, 0).core!);
      expect(washAt(material, -40, 0, 0).washStrength).toBe(0);
      const crestPhase = Math.PI / 2 - 80 * 1.7;
      const glints = Array.from({ length: 161 }, (_, i) => washAt(material, 80, (i - 80) / 10, crestPhase).glimmer!);
      expect(Math.max(...glints)).toBeGreaterThan(0.5);
      expect(Math.min(...glints)).toBe(0);
      const row = Array.from({ length: 101 }, (_, i) => washAt(material, 75 + i / 10, 0, 0).glimmer!);
      expect(Math.max(...row)).toBeGreaterThan(0.5);
      expect(row.filter(value => value === 0).length).toBeGreaterThan(row.length / 2);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("has no continuous %s bright ray longer than 40 m toward the horizon", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      // River UV detail must be compiled out of the sea, rather than merely dimmed.
      expect(material.fragmentShader).toMatch(/#ifndef SEA_WATER\s+\/\/ River-only detail:[\s\S]*?float across =[\s\S]*?riverFoam \* 0\.06\);\s+#endif/);
      const step = 0.5;
      let longest = 0;
      let peak = 0;
      // Rays span both sides of the sun axis and several points through the full frozen/animated cycle.
      for (const angle of [-0.3, -0.12, -0.06, -0.02, 0, 0.02, 0.06, 0.12, 0.3]) {
        for (let frame = 0; frame <= 8; frame++) {
          let run = 0;
          for (let distance = 0; distance <= 800; distance += step) {
            const strength = washAt(material, distance * Math.cos(angle), distance * Math.sin(angle), frame * Math.PI / 4).washStrength!;
            peak = Math.max(peak, strength);
            // Even a 1% pigment contribution counts, including the wash base and core.
            run = strength > 0.01 ? run + step : 0;
            longest = Math.max(longest, run);
          }
        }
      }
      expect(peak).toBeGreaterThan(0.35); // Visibility gate follows the 30% strength reduction. // A missing reflection must not pass this gate.
      expect(longest).toBeLessThanOrEqual(40);
      console.info(`${quality} horizon: longest continuous wash >1% = ${longest.toFixed(1)} m`);
    } finally { sea.dispose(); }
  });

  it("compresses soft transverse wash marks and fades both wash and glimmer at distance", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      const longestMark = (from: number, to: number) => {
        let run = 0;
        let longest = 0;
        for (let distance = from; distance <= to; distance += 0.1) {
          run = washAt(material, distance, 0, 0).washMarks! > 0.01 ? run + 0.1 : 0;
          longest = Math.max(longest, run);
        }
        return longest;
      };
      expect(longestMark(320, 500)).toBeLessThan(longestMark(20, 120) * 0.6);
      const horizontal = Array.from({ length: 601 }, (_, i) => washAt(material, 80, (i - 300) / 10, 0).washStrength!);
      expect(horizontal.filter(value => value > 0.1).length * 0.1).toBeGreaterThan(longestMark(20, 120));
      expect(horizontal.some(value => value > 0 && value < 0.01)).toBe(true); // Soft edges.
      const fades = [80, 160, 300, 500, 640, 800].map(distance => washAt(material, distance, 0, 0).distanceFade!);
      expect(fades[0]).toBe(1);
      expect(fades).toEqual([...fades].sort((a, b) => b - a));
      for (const distance of [640, 800, 1600]) {
        for (const across of [-20, 0, 20]) {
          const sample = washAt(material, distance, across, Math.PI / 2);
          expect(sample.washStrength).toBe(0);
          expect(sample.glimmer).toBe(0);
        }
      }
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("filters subpixel %s rays from the 9 m quiet-shore wide camera", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      let longest = 0, peak = 0;
      // Tour wide uses a 55 degree camera, 9 m above the surface. Include road height too.
      for (const height of [1.7, 9]) for (const resolution of [720, 1080, 2160]) {
        const pixelAngle = 2 * Math.tan(55 * Math.PI / 360) / resolution;
        for (const angle of [-0.12, -0.02, 0, 0.02, 0.12]) for (const phase of [0, Math.PI / 2, Math.PI]) {
          let run = 0;
          // Pixel centres projected onto the flat water; a gap cannot hide between metres-based samples.
          let previous = 12;
          for (let row = Math.ceil(height / (800 * pixelAngle)); row <= height / (12 * pixelAngle); row++) {
            const distance = height / (row * pixelAngle);
            const near = height / ((row + 0.5) * pixelAngle);
            const far = height / ((row - 0.5) * pixelAngle);
            const along = distance * Math.cos(angle);
            const washPhase = (d: number) => {
              const a = d * Math.cos(angle);
              return a * 0.24 * mix(1, 2.5, smoothstep(120, 600, a));
            };
            const sample = washAt(material, along, distance * Math.sin(angle), phase,
              Math.abs(washPhase(far) - washPhase(near)), (far - near) * Math.cos(angle) * 1.7);
            const strength = sample.washStrength!;
            peak = Math.max(peak, strength);
            // Iterate far -> near; only adjacent lit pixels contribute a continuous interval.
            run = strength > 0.01 ? run + (previous === 12 ? 0 : previous - distance) : 0;
            previous = distance;
            longest = Math.max(longest, run);
            if (distance > 500) {
              expect(strength).toBe(0);
              expect(sample.glimmer).toBe(0);
            }
          }
        }
      }
      expect(peak).toBeGreaterThan(0.35); // Visibility gate follows the 30% strength reduction.
      expect(longest).toBeLessThanOrEqual(40);
      process.stdout.write(`${quality} projected road/wide: longest bright ray=${longest.toFixed(2)} m\n`);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("uses %s turquoise at 5 m and deep blue at 300 m from the sampled coast", quality => {
    const shallow = new Color(PALETTE.seaShallow);
    const deep = new Color(PALETTE.seaDeep);
    for (const slope of [-0.6, 0, 0.6]) {
      const material = createWaterMaterial(quality, {
        surface: "sea",
        shoreline: { minX: -400, width: 800,
          z: Array.from({ length: SEA_SHORE_SAMPLES }, (_, i) => -800 + i * 800 / (SEA_SHORE_SAMPLES - 1) * slope) },
      });
      try {
        for (const skyMix of [0, 0.35, 1]) {
          material.setSkyMix(skyMix);
          for (const x of [-400, -312.5, 0, 234.5, 400]) {
            let previousWeight = 1;
            for (const distance of [5, 40, 80, 160, 300]) {
              const point = new Vector3(x, WATER_LEVEL, -800 + (x + 400) * slope - distance * Math.sqrt(1 + slope * slope));
              const pigment = seaPigment(material, point);
              expect(pigment.offshore).toBeCloseTo(distance, 8);
              expect(pigment.shallows).toBeLessThanOrEqual(previousWeight);
              previousWeight = pigment.shallows;
              if (distance === 5) expect(pigment.color).toEqual(material.uniforms.uEdgeColor!.value);
              if (distance === 300) expect(pigment.color).toEqual(material.uniforms.uDeepColor!.value);
              if (distance >= 40) expect(pigment.shallows).toBe(0);
            }
          }
        }
      } finally { material.dispose(); }
    }
    expect(luma(shallow)).toBeGreaterThan(luma(deep));
  });

  it("uses deep pigment when no sampled coast is supplied", () => {
    const material = createWaterMaterial("Balanced", { surface: "sea" });
    try {
      expect(seaPigment(material, new Vector3(0, WATER_LEVEL, -5)).color).toEqual(material.uniforms.uDeepColor!.value);
    } finally { material.dispose(); }
  });

  it("keeps the eight-second gentle foam and suppresses it at steep coasts", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      const foam = (slope: number, phase: number) => scalars(material, "// One thin cream-white edge runs up and retreats over an eight-second breath.",
        "color = mix(color, uPaperColor, foam)", {
          phase, offshore: 0.26 + 0.04 * Math.cos(phase),
          offshorePixelWidth: 0.05, brush: 1, uHasShore: 1, slope,
        }, ["foam", "foamDistance"]);
      expect(SEA_WAVE_PERIOD).toBe(8);
      for (let i = 0; i <= 16; i++) {
        const phase = i * Math.PI / 8;
        expect(foam(0, phase).foam).toBeGreaterThan(0);
        expect(foam(0, phase).foam).toBeLessThanOrEqual(0.6);
        expect(foam(SEA_FOAM_MAX_SLOPE, phase).foam).toBe(0);
        expect(foam(-SEA_FOAM_MAX_SLOPE, phase).foam).toBe(0);
      }
      expect(foam(0, 0).foamDistance).toBeCloseTo(foam(0, 2 * Math.PI).foamDistance!);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("has zero %s foam at and beyond 5 m even with horizon-sized pixel derivatives", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      for (const offshorePixelWidth of [0.001, 0.25, 4, 1000]) {
        for (const slope of [-2, 0, 2, SEA_FOAM_MAX_SLOPE]) {
          for (let frame = 0; frame <= 16; frame++) {
            const phase = frame * Math.PI / 8;
            for (const offshore of [5, 5.001, 6.001, 10, 40, 300, 800]) {
              const sample = scalars(material, "// One thin cream-white edge runs up and retreats over an eight-second breath.",
                "color = mix(color, uPaperColor, foam)", {
                  phase, offshore, offshorePixelWidth, brush: 1, uHasShore: 1, slope,
                }, ["foam", "foamWidth"]);
              expect(sample.foam).toBe(0);
              expect(sample.foamWidth).toBeLessThanOrEqual(0.45);
            }
          }
        }
      }
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("uses at most 140 explicit uniform floats and no sampler on %s", quality => {
    const sea = createSea(quality);
    try {
      const floatCount = Object.values(sea.mesh.material.uniforms).reduce((sum, { value }) => {
        if (typeof value === "number") return sum + 1;
        if (Array.isArray(value)) return sum + value.length;
        if (value instanceof Color) return sum + 3;
        if (value instanceof Vector2) return sum + 2;
        if (value instanceof Vector3) return sum + 3;
        throw new Error("Unbudgeted sea uniform");
      }, 0);
      expect(floatCount).toBe(138);
      expect(floatCount).toBeLessThanOrEqual(140);
      expect(sea.mesh.material.fragmentShader).not.toMatch(/sampler|texture\s*\(/);
      expect(sea.mesh.geometry.index!.count / 3).toBe(2);
      expect(sea.mesh.geometry.boundingBox!.getSize(new Vector3()).x).toBe(SEA_RENDER_SIZE);
    } finally { sea.dispose(); }
  });
});


describe("B2-219 foam support and coverage", () => {
  it("covers 30?70 percent of the 0.6 m sea edge and never escapes it", () => {
    const material = createWaterMaterial("High", { surface: "sea" });
    try {
      for (const phase of [0, 1.5, 3, 5]) for (const offshorePixelWidth of [0.001, 1000]) {
        let covered = 0, samples = 0;
        for (let i = 0; i < 80; i++) for (let j = 0; j < 80; j++) {
          const offshore = (i + 0.5) / 80 * 0.6;
          const brush = 0.5 + 0.5 * Math.sin(j / 80 * Math.PI * 2);
          const sample = scalars(material, "// One thin cream-white edge runs up and retreats over an eight-second breath.",
            "color = mix(color, uPaperColor, foam)", {phase, offshore, offshorePixelWidth, brush, uHasShore: 1, slope: 0}, ["foam"]);
          covered += Number(sample.foam! > 0.01); samples++;
        }
        expect(covered / samples).toBeGreaterThanOrEqual(0.3);
        expect(covered / samples).toBeLessThanOrEqual(0.7);
        for (const offshore of [-1, 0, 0.6, 0.601, 1]) {
          expect(scalars(material, "// One thin cream-white edge runs up and retreats over an eight-second breath.",
            "color = mix(color, uPaperColor, foam)", {phase, offshore, offshorePixelWidth, brush: 1, uHasShore: 1, slope: 0}, ["foam"]).foam).toBe(0);
        }
      }
    } finally { material.dispose(); }
  });
});


describe("B2-229 dusk sea colour and sun corridor", () => {
  it.each(["Low", "Balanced", "High"] as const)("keeps %s offshore blue and nearshore jade at t=0.95", quality => {
    const t = 0.95;
    const material = createWaterMaterial(quality, { surface: "sea",
      grade: applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t),
      shoreline: { minX: -400, width: 800, z: Array<number>(SEA_SHORE_SAMPLES).fill(-800) },
    });
    try {
      const near = seaPigment(material, new Vector3(0, WATER_LEVEL, -805)).color;
      expect(near.g).toBeGreaterThanOrEqual(near.b);
      for (const distance of [40.01, 60, 160, 300]) {
        const point = new Vector3(0, WATER_LEVEL, -800 - distance);
        const pigment = seaPigment(material, point).color;
        expect(pigment.b).toBeGreaterThan(pigment.g);
        expect(pigment.b).toBeGreaterThan(pigment.r);
        // Looking away from the sun includes paper and sky reflection, without orange wash.
        const color = seaColor(material, point, point.clone().add(new Vector3(0, 1.7, -30)));
        expect(color.b).toBeGreaterThan(color.g);
        expect(color.b).toBeGreaterThan(color.r);
      }
    } finally { material.dispose(); }
  });

  it("bounds half-intensity to 12 degrees, with soft edges and at most 70% of the old strength", () => {
    const material = createWaterMaterial("High", { surface: "sea" });
    try {
      let lit = 0;
      for (const along of [5, 12, 25, 40, 80, 160, 300, 500]) {
        for (const phase of [0, 1, 3, 5]) {
          const centre = washAt(material, along, 0, phase).washStrength!;
          for (let angle = -20; angle <= 20; angle += 0.25) {
            const across = along * Math.tan(angle * Math.PI / 180);
            const sample = washAt(material, along, across, phase);
            if (Math.abs(angle) >= 12) expect(sample.washStrength!).toBeLessThan(1e-12);
            if (centre > 0.01 && sample.washStrength! >= centre * 0.5) expect(Math.abs(angle)).toBeLessThanOrEqual(12);
            // Old transverse envelope/width; other brush and distance factors are unchanged.
            const oldWidth = mix(30, 7, smoothstep(12, 360, along));
            const oldWash = (1 - smoothstep(oldWidth * 0.18, oldWidth, Math.abs(across)))
              * smoothstep(0, 12, along) * sample.distanceFade!
              * smoothstep(0, 0.08, material.uniforms.uSunDirection!.value.y)
              * (1 - smoothstep(0.25, 0.8, material.uniforms.uSunDirection!.value.y));
            const oldCore = (1 - smoothstep(oldWidth * 0.12, oldWidth * 0.4, Math.abs(across))) * smoothstep(20, 220, along);
            const oldStrength = oldWash * sample.washMarks! * (0.5 + 0.14 * oldCore + 0.24 * sample.glimmer!);
            expect(sample.washStrength!).toBeLessThanOrEqual(oldStrength * 0.7 + 1e-12);
            if (sample.washStrength! > 0 && sample.washStrength! < centre * 0.1) lit++;
          }
        }
      }
      expect(lit).toBeGreaterThan(0);
    } finally { material.dispose(); }
  });
});

// Regression for the shipped coast, including the steep secants between headlands.
describe("B2-229b dusk sea without fan bands", () => {
  it.each(["Low", "Balanced", "High"] as const)("bounds %s displayed offshore luma across Last Postcard azimuths", quality => {
    const sea = createSea(quality);
    const material = sea.mesh.material;
    const camera = pathPointAt(1);
    camera.y = WATER_LEVEL + 8;
    let minimum = Infinity, maximum = -Infinity, maxSwing = 0, samples = 0;
    try {
      for (const t of [0.93, 0.95, 1]) {
        material.setGrade(applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t));
        const sun = material.uniforms.uSunDirection!.value as Vector3;
        const sunAngle = Math.atan2(sun.x, -sun.z);
        for (const skyMix of [0, 0.35, 1]) for (const time of [0, 2, 4, 6, 8]) {
          material.setSkyMix(skyMix);
          material.uniforms.uTime!.value = time;
          for (const distance of [80, 120, 160, 240, 320, 480, 640]) {
            for (const aces of [false, true]) {
              const values: number[] = [];
              for (let degrees = -80; degrees <= 80; degrees += 1) {
                const angle = degrees * Math.PI / 180;
                const point = camera.clone().add(new Vector3(Math.sin(angle) * distance, -8, -Math.cos(angle) * distance));
                if (!sea.mesh.geometry.boundingBox!.containsPoint(point) || worldHeight(point.x, point.z) >= WATER_LEVEL) continue;
                // Select far water independently of the shader's slope correction:
                // otherwise the old erroneous shallows would be excluded from the test.
                const bounds = material.uniforms.uShoreBounds!.value as Vector2;
                const coast = material.uniforms.uShoreZ!.value as number[];
                const sample = Math.max(0, Math.min(1, (point.x - bounds.x) / bounds.y)) * (SEA_SHORE_SAMPLES - 1);
                const index = Math.min(Math.floor(sample), SEA_SHORE_SAMPLES - 2);
                const shoreZ = mix(coast[index]!, coast[index + 1]!, sample - index);
                if (shoreZ - point.z < 60) continue;
                const pigment = seaPigment(material, point);
                // Glints stay within +/-12 degrees; the broad reflected sunset remains.
                const delta = Math.atan2(Math.sin(angle - sunAngle), Math.cos(angle - sunAngle));
                if (Math.abs(delta) <= 12 * Math.PI / 180) continue;
                expect(pigment.shallows).toBe(0);
                const color = displayColor(seaColor(material, point, camera), aces);
                if (Math.cos(delta) <= -0.15) {
                  expect(color.b).toBeGreaterThan(color.g);
                  expect(color.b).toBeGreaterThan(color.r);
                }
                const value = luma(color);
                values.push(value);
                minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); samples++;
                expect(value, `t=${t}, range=${distance}, azimuth=${degrees}, ACES=${aces}`).toBeGreaterThanOrEqual(0.12);
                expect(value).toBeLessThanOrEqual(0.30);
              }
              if (values.length) {
                const swing = Math.max(...values) - Math.min(...values);
                maxSwing = Math.max(maxSwing, swing);
                expect(swing).toBeLessThanOrEqual(0.15);
              }
            }
          }
        }
      }
      expect(samples).toBeGreaterThan(10000);
      process.stdout.write(`${quality} Last Postcard: ${samples} samples, display luma ${minimum.toFixed(4)}-${maximum.toFixed(4)}, azimuth swing ${maxSwing.toFixed(4)}\n`);
    } finally { sea.dispose(); }
  });

  it("reduces displayed nearshore chroma by at least 30% against B2-229 pigment", () => {
    const material = createWaterMaterial("High", { surface: "sea",
      shoreline: { minX: -400, width: 800, z: Array<number>(SEA_SHORE_SAMPLES).fill(-800) },
    });
    const chroma = (c: Color) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    let worstRatio = 0;
    try {
      for (const t of [0.93, 0.95, 1]) {
        const grade = applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t);
        material.setGrade(grade);
        const edge = material.uniforms.uEdgeColor!.value as Color;
        const revised = edge.clone();
        const previous = new Color(PALETTE.seaShallow).multiply(grade.sunColor.clone()
          .multiplyScalar(grade.sunIntensity * (0.625 + 0.375 * grade.sunDirection.y))
          .add(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity))).multiplyScalar(0.85 / Math.PI);
        for (const distance of [6, 8, 10, 12]) for (const aces of [false, true]) {
          const point = new Vector3(0, WATER_LEVEL, -800 - distance);
          const camera = new Vector3(0, WATER_LEVEL + 8, -800);
          edge.copy(previous);
          const before = displayColor(seaColor(material, point, camera), aces);
          edge.copy(revised);
          const after = displayColor(seaColor(material, point, camera), aces);
          const ratio = chroma(after) / chroma(before);
          worstRatio = Math.max(worstRatio, ratio);
          expect(ratio).toBeLessThanOrEqual(0.7);
          expect(after.g).toBeGreaterThanOrEqual(after.b);
          expect(luma(after)).toBeLessThanOrEqual(luma(before));
        }
      }
      process.stdout.write(`Nearshore displayed chroma reduction >= ${((1 - worstRatio) * 100).toFixed(1)}%\n`);
    } finally { material.dispose(); }
  });

  it("brightens monotonically toward the actual dusk sky at the horizon", () => {
    const material = createWaterMaterial("Balanced", { surface: "sea" });
    try {
      const grade = applyCoastAtmosphere(lightingAt(1), 1);
      material.setGrade(grade);
      const camera = new Vector3(0, WATER_LEVEL + 8, 0);
      const sky = displayColor(grade.skyHorizon);
      let previous = 0;
      for (const distance of [80, 160, 320, 640, 1600, 4000, 1000000]) {
        const color = displayColor(seaColor(material, new Vector3(0, WATER_LEVEL, -distance), camera));
        expect(luma(color)).toBeGreaterThanOrEqual(previous);
        previous = luma(color);
        if (distance === 1000000) {
          for (const channel of ["r", "g", "b"] as const) expect(color[channel]).toBeCloseTo(sky[channel], 3);
        }
      }
    } finally { material.dispose(); }
  });
});
