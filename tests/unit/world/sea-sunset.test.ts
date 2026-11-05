import { Color, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { riverLength, riverPointAt } from "../../../src/features/world/layout/river";
import { worldHeight } from "../../../src/features/world/terrain/height";
import {
  SEA_FOAM_MAX_SLOPE, SEA_WAVE_PERIOD, WATER_FLOW_SPEED, type WaterMaterial,
} from "../../../src/features/world/water/material";
import { WATER_LEVEL } from "../../../src/features/world/water/ribbon";
import { createSea, SEA_INLAND_OVERLAP, SEA_SIZE } from "../../../src/features/world/water/sea";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

// Execute the actual scalar GLSL in JS, so width/strength/foam regressions cannot
// leave a separately copied CPU formula passing. Only trusted local shader text runs.
function scalars(material: WaterMaterial, start: string, end: string, inputs: Record<string, number>, outputs: string[]) {
  const startIndex = material.fragmentShader.indexOf(start);
  const endIndex = material.fragmentShader.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  const source = material.fragmentShader.slice(startIndex, endIndex)
    .replace(/\bfloat\s+/g, "let ")
    .replace(/uSunDirection\.y/g, "sunElevation")
    .replace(/\b(sin|cos|sqrt|abs|max)\(/g, "Math.$1(")
    .replace(/SEA_FOAM_MAX_SLOPE/g, String(SEA_FOAM_MAX_SLOPE))
    .replace(/fwidth\(offshore\)/g, "offshorePixelWidth");
  return new Function("inputs", "smoothstep", "mix", `
    "use strict";
    const { ${Object.keys(inputs).join(", ")} } = inputs;
    ${source}
    return { ${outputs.join(", ")} };
  `)(inputs, smoothstep, mix) as Record<string, number>;
}

function washAt(material: WaterMaterial, alongSun: number, signedAcrossSun: number, phase: number) {
  return scalars(material, "// Sun wash scalars: also evaluated directly by the CPU colour regression.",
    "// End sun wash scalars.", {
      alongSun, signedAcrossSun, acrossSun: Math.abs(signedAcrossSun), phase,
      sunElevation: material.uniforms.uSunDirection!.value.y,
    }, ["washStrength", "washWidth", "core", "glimmer"]);
}

// Full sea pigment/strokes/swell/Fresnel/wash in linear working space, before
// renderer tone mapping and scene fog. Samples are offshore, beyond the foam.
function seaColor(material: WaterMaterial, point: Vector3, camera: Vector3): Color {
  const uniform = material.uniforms;
  const time = uniform.uTime!.value as number;
  const phase = time * Number((2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10));
  const bounds = uniform.uShoreBounds!.value as Vector2;
  const shore = uniform.uShoreZ!.value as number[];
  const sample = Math.max(0, Math.min(1, (point.x - bounds.x) / bounds.y)) * (shore.length - 1);
  const index = Math.min(Math.floor(sample), shore.length - 2);
  const slope = (shore[index + 1]! - shore[index]!) * (shore.length - 1) / bounds.y;
  const offshore = (mix(shore[index]!, shore[index + 1]!, sample - index) - point.z) / Math.sqrt(1 + slope * slope);
  expect(offshore).toBeGreaterThan(5);
  const shallows = (1 - smoothstep(12, 160, offshore)) * uniform.uHasShore!.value;
  const skyMix = uniform.uSkyMix!.value as number;
  const color = (uniform.uDeepColor!.value as Color).clone().lerp(uniform.uEdgeColor!.value,
    shallows * (0.25 + 0.75 * skyMix));
  const uvX = (point.x - bounds.x) / bounds.y;
  const near = riverPointAt(1).z + SEA_INLAND_OVERLAP;
  let flow = riverLength() - SEA_INLAND_OVERLAP + (near - point.z);
  if (material.defines.WATER_FLOW) flow -= time * WATER_FLOW_SPEED;
  const lane = uvX * 50 + 0.45 * Math.sin(flow * 0.7);
  const stroke = (0.5 + 0.5 * Math.cos(lane)) ** 12
    * smoothstep(0.1, 0.8, 0.5 + 0.5 * Math.sin(flow * 0.65 + uvX * 37));
  color.lerp(uniform.uPaperColor!.value, stroke * 0.065);
  const swell = Math.sin(point.z * 0.65 + phase);
  const crossSwell = Math.sin(point.x * 0.31 + point.z * 0.21 - phase);
  color.lerp(uniform.uPaperColor!.value, (0.5 + 0.25 * swell + 0.25 * crossSwell) * 0.035);
  if (material.defines.WATER_REFLECTION) {
    const normal = new Vector3(crossSwell * 0.012, 1, swell * 0.012).normalize();
    const grazing = 1 - Math.max(0, Math.min(1, normal.dot(camera.clone().sub(point).normalize())));
    const sky = (uniform.uDeepColor!.value as Color).clone().lerp(uniform.uPaperColor!.value, 0.28)
      .lerp(uniform.uDuskColor!.value, skyMix * 0.18);
    color.lerp(sky, grazing ** 3 * Number(material.defines.SKY_REFLECTION));
  }
  const sun = uniform.uSunDirection!.value as Vector3;
  const axis = new Vector2(sun.x, sun.z).normalize();
  const offset = new Vector2(point.x - camera.x, point.z - camera.z);
  const strength = washAt(material, offset.dot(axis), offset.dot(new Vector2(-axis.y, axis.x)), phase).washStrength!;
  return color.lerp(uniform.uSunWashColor!.value, strength);
}

describe("road-view sunset sea", () => {
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
            expect(luma(centre) - luma(outside), `${quality}, grade=${skyMix}, frame=${frame}`).toBeGreaterThanOrEqual(0.1);
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

  it("warms the shallows with the grade and retains blue-violet offshore pigment", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      const deep = material.uniforms.uDeepColor!.value as Color;
      const edge = material.uniforms.uEdgeColor!.value as Color;
      expect(deep.b).toBeGreaterThan(deep.r);
      expect(deep.r).toBeGreaterThan(deep.g);
      expect(edge.r - edge.b).toBeGreaterThan(deep.r - deep.b);
      // Run the actual near-shore scalar from the shader at two offshore distances.
      const weight = (offshore: number, uSkyMix: number, uHasShore = 1) => scalars(material,
        "float shallows =", "color = mix(uDeepColor", { offshore, uHasShore, uSkyMix }, ["shoreWarmth"]).shoreWarmth!;
      expect(weight(4, 1)).toBe(1);
      expect(weight(4, 0.35)).toBeGreaterThan(weight(4, 0));
      expect(weight(4, 1)).toBeGreaterThan(weight(4, 0.35));
      expect(weight(180, 1)).toBe(0);
      expect(weight(4, 1, 0)).toBe(0);
      const shallow = deep.clone().lerp(edge, weight(4, 0.35));
      expect(shallow.r - shallow.b).toBeGreaterThan(deep.r - deep.b);
    } finally { sea.dispose(); }
  });

  it("keeps the eight-second gentle foam and suppresses it at steep coasts", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      const foam = (slope: number, phase: number) => scalars(material, "// One thin cream-white edge runs up and retreats over an eight-second breath.",
        "color = mix(color, uPaperColor, foam)", {
          phase, offshore: 0.45 + 1.1 * (0.5 + 0.5 * Math.cos(phase)),
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
      expect(sea.mesh.geometry.boundingBox!.getSize(new Vector3()).x).toBe(SEA_SIZE);
    } finally { sea.dispose(); }
  });
});
