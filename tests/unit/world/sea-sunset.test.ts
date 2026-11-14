import { fract, waterNoiseFunctions } from "./water-noise";
import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";
import { directGrade } from "../../../src/features/world/scene/compose";
import { createWaterMaterial, SEA_FOAM_MAX_SLOPE, SEA_SHORE_SAMPLES, SEA_WAVE_PERIOD, type WaterMaterial } from "../../../src/features/world/water/material";
import { WATER_LEVEL } from "../../../src/features/world/water/ribbon";
import { createSea, SEA_RENDER_SIZE } from "../../../src/features/world/water/sea";
import { createSeaNormal, SEA_OPTICS_GLSL } from "../../../src/features/world/shore/sea-optics";

// Execute the scalar optical functions from the production shader itself.
function opticalFunction(name: string, parameters: string[]) {
  const body = SEA_OPTICS_GLSL.match(new RegExp(`float ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`))![1]!
    .replace(/\bfloat\s+/g, "let ").replace(/\bexp\(/g, "Math.exp(");
  return new Function(...parameters, "smoothstep", body) as (...args: unknown[]) => number;
}

describe("HR-SEA lit ocean optics", () => {
  it("reflects a golden path with a narrow crosswind and longer along-wind distribution", () => {
    const sample = opticalFunction("seaGlitter", ["halfAcross", "halfAlong", "variance", "facing"]);
    const glint = (across: number, along: number, facing = 1, variance = 0.035) => sample(across, along, variance, facing);
    expect(glint(0, 0)).toBe(1);
    expect(glint(0, 0.2)).toBeGreaterThan(glint(0.2, 0) * 3);
    expect(glint(1, 0)).toBeLessThan(1e-20);
    expect(glint(0, 0, 0)).toBe(0);
    expect(glint(0.2, 0, 1, 0.105)).toBeGreaterThan(glint(0.2, 0));
    let previous = 1;
    for (let i = 1; i <= 100; i++) {
      const value = glint(i / 100, 0);
      expect(value).toBeLessThanOrEqual(previous);
      expect(previous - value).toBeLessThan(0.07);
      previous = value;
    }
  });

  it("joins the sky continuously at the horizon while keeping downward water clear", () => {
    const sample = opticalFunction("seaMist", ["distanceToEye", "viewElevation"]);
    const mist = (distance: number, elevation: number) => sample(distance, elevation, smoothstep);
    expect(mist(0, 0)).toBe(0);
    expect(mist(6000, 0)).toBeGreaterThan(0.94);
    expect(mist(6000, 0.24)).toBe(0);
    let previous = 0;
    for (let distance = 0; distance <= 6000; distance += 10) {
      const value = mist(distance, 0.02);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value - previous).toBeLessThan(0.005);
      previous = value;
    }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps %s sea readable under the composed dusk grade and preserves sky radiance", quality => {
    const sea = createSea(quality);
    try {
      const grade = applyCoastAtmosphere(directGrade(lightingAt(1), 1), 1);
      sea.mesh.material.setGrade(grade);
      const uniforms = sea.mesh.material.uniforms;
      const shallow = uniforms.uEdgeColor!.value as Color;
      const deep = uniforms.uDeepColor!.value as Color;
      expect(shallow.g).toBeGreaterThan(shallow.b);
      const srgb = shallow.clone().convertLinearToSRGB();
      expect((Math.max(srgb.r, srgb.g, srgb.b) - Math.min(srgb.r, srgb.g, srgb.b))
        / Math.max(srgb.r, srgb.g, srgb.b)).toBeLessThan(0.35);
      expect(deep.b).toBeGreaterThan(deep.g);
      expect(luma(deep.clone().convertLinearToSRGB())).toBeGreaterThan(0.22);
      expect(luma(shallow)).toBeGreaterThan(luma(deep) * 2);
      expect(uniforms.uSkyHorizon!.value).toEqual(grade.skyHorizon);
      expect(sea.mesh.geometry.index!.count / 3).toBe(2);
      expect(sea.mesh.geometry.boundingBox!.getSize(new Vector3()).x).toBe(SEA_RENDER_SIZE);
    } finally { sea.dispose(); }
  });

  it.each(["Balanced", "High"] as const)("owns a deterministic tileable %s normal spectrum, mipmaps it, and releases it once", quality => {
    const sea = createSea(quality);
    const texture = sea.mesh.material.uniforms.uSeaNormal!.value as DataTexture;
    const again = createSeaNormal(quality)!;
    try {
      expect(texture.image.width).toBe(quality === "High" ? 512 : 256);
      expect(texture.image.data).toEqual(again.image.data);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      const data = texture.image.data as Uint8Array;
      expect(new Set(data).size).toBeGreaterThan(150);
      // Periodic edge neighbours must have comparable slope increments to
      // interior neighbours; an unwrapped/random tile creates a visible seam.
      const size = texture.image.width;
      let seam = 0, interior = 0;
      for (let y = 0; y < size; y++) {
        seam += Math.abs(data[y * size * 2]! - data[(y * size + size - 1) * 2]!);
        interior += Math.abs(data[(y * size + size / 2) * 2]! - data[(y * size + size / 2 - 1) * 2]!);
      }
      expect(seam / interior).toBeGreaterThan(0.5);
      expect(seam / interior).toBeLessThan(2);
      const version = texture.version;
      sea.setTime(4); sea.setReducedMotion(true); sea.setTime(12);
      expect(sea.mesh.material.uniforms.uTime!.value).toBe(4);
      expect(texture.version).toBe(version);
      sea.setReducedMotion(false); sea.setTime(20); sea.setTime(21);
      expect(sea.mesh.material.uniforms.uTime!.value).toBe(5);
      const disposed = vi.fn(); texture.addEventListener("dispose", disposed);
      sea.dispose(); sea.dispose();
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally { sea.dispose(); again.dispose(); }
  });

  it("keeps Low on analytic swells without a normal allocation", () => {
    const low = createSea("Low");
    try {
      expect(createSeaNormal("Low")).toBeUndefined();
      expect(low.mesh.material.uniforms.uSeaNormal).toBeUndefined();
      expect(low.mesh.material.defines.SEA_NORMAL).toBeUndefined();
      low.setTime(3); low.setReducedMotion(true); low.setTime(7);
      expect(low.mesh.material.uniforms.uTime!.value).toBe(3);
    } finally { low.dispose(); }
  });
});

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

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
    .replace(/\b(sin|cos|sqrt|abs|max|min|floor|exp|pow)\(/g, "Math.$1(")
    .replace(/SEA_FOAM_MAX_SLOPE/g, String(SEA_FOAM_MAX_SLOPE))
    .replace(/fwidth\(alongSun \* 0.24 \* perspective\)/g, "washPixelWidth")
    .replace(/fwidth\(alongSun \* 1.7\)/g, "glimmerPixelWidth")
    .replace(/#ifndef SEA_WATER[\s\S]*?#endif/g, "")
    .replace(/#ifdef C_WATER[\s\S]*?#endif/g, block => material.quality === "Low" ? "" : block.replace(/#ifdef C_WATER|#endif/g, ""))
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
  const { offshore, shoreInfluence, slope } = scalars(material, "float shoreSample =", "float seaBedDepth =", {
    vWaterWorld: point,
    uShoreBounds: uniform.uShoreBounds!.value,
    uShoreZ: uniform.uShoreZ!.value,
    uHasShore: uniform.uHasShore!.value,
  }, ["offshore", "shoreInfluence", "slope"]);
  return { offshore: offshore!, shoreInfluence: shoreInfluence!, slope: slope! };
}

describe("sea depth and SURF-01", () => {
  it.each(["Low", "Balanced", "High"] as const)("keeps %s finite coast distances for surf independently of pigment", quality => {
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
            for (const distance of [5, 40, 80, 160, 300]) {
              const point = new Vector3(x, WATER_LEVEL, -800 + (x + 400) * slope - distance * Math.sqrt(1 + slope * slope));
              const pigment = seaPigment(material, point);
              // The perpendicular foot may fall beyond this finite sample segment.
              expect(pigment.offshore).toBeGreaterThanOrEqual(distance - 1e-8);
              expect(pigment.offshore).toBeLessThanOrEqual(distance * Math.sqrt(1 + slope * slope) + 1e-8);
              expect(pigment.shoreInfluence).toBe(1);
            }
          }
        }
      } finally { material.dispose(); }
    }
    expect(luma(shallow)).toBeGreaterThan(luma(deep));
  });

  it("disables surf when no sampled coast is supplied", () => {
    const material = createWaterMaterial("Balanced", { surface: "sea" });
    try {
      expect(seaPigment(material, new Vector3(0, WATER_LEVEL, -5)).shoreInfluence).toBe(0);
    } finally { material.dispose(); }
  });

  it("keeps the eight-second breaking foam and suppresses it at steep coasts", () => {
    const sea = createSea("Balanced");
    try {
      const material = sea.mesh.material;
      const foam = (slope: number, surfPhase: number) => scalars(material, "float foam = 0.0;",
        "color = mix(color, uPaperColor, foam)", {
          surfPhase, breaker: 1, brush: 1, slope,
        }, ["foam"]);
      expect(SEA_WAVE_PERIOD).toBe(8);
      for (let i = 0; i <= 16; i++) {
        const phase = i / 16;
        expect(foam(0, phase).foam).toBeGreaterThanOrEqual(0);
        expect(foam(0, phase).foam).toBeLessThanOrEqual(0.8);
        expect(foam(SEA_FOAM_MAX_SLOPE, phase).foam).toBe(0);
        expect(foam(-SEA_FOAM_MAX_SLOPE, phase).foam).toBe(0);
      }
      expect(foam(0, 0.25).foam).toBe(0.8);
    } finally { sea.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps %s breaking foam inside the surf zone even with horizon-sized pixel derivatives", quality => {
    const sea = createSea(quality);
    try {
      const material = sea.mesh.material;
      for (const offshorePixelWidth of [0.001, 0.25, 4, 1000]) {
        for (const slope of [-2, 0, 2, SEA_FOAM_MAX_SLOPE]) {
          for (let frame = 0; frame <= 16; frame++) {
            const phase = frame * Math.PI / 8;
            for (const offshore of [15, 16, 40, 300, 800]) {
              const surfPhase = phase / (2 * Math.PI);
              const { breaker } = scalars(material, "float breakerDistance =", "vec2 seaSurfaceSlopes =", {
                surfPhase, offshore, shoreInfluence: 1, shoreValid: 1,
              }, ["breaker"]);
              const sample = scalars(material, "float foam = 0.0;",
                "color = mix(color, uPaperColor, foam)", {
                  surfPhase, breaker, offshore, offshorePixelWidth, brush: 1, slope,
                }, ["foam"]);
              expect(sample.foam).toBeLessThan(0.000001);
            }
          }
        }
      }
    } finally { sea.dispose(); }
  });

});

describe("SURF-01 replaces the B2-219 static edge with breaking waves", () => {
  it("whitens an incoming crest and leaves the quiet interval clear", () => {
    const material = createWaterMaterial("High", { surface: "sea" });
    try {
      const foam = (surfPhase: number, breaker: number) => scalars(material, "float foam = 0.0;",
        "color = mix(color, uPaperColor, foam)", { surfPhase, breaker, brush: 1, slope: 0 }, ["foam"]).foam!;
      expect(foam(0, 1)).toBe(0);
      expect(foam(0.25, 1)).toBeCloseTo(0.8);
      expect(foam(0.25, 0)).toBe(0);
    } finally { material.dispose(); }
  });
});


// RC-14: test the shader scalars at a real coast break, not an injected distance.
describe("RC-14 finite shore influence", () => {
  it.each(["Low", "Balanced", "High"] as const)("keeps %s reflection and pigment continuous at a coast break without inventing an inlet edge", quality => {
    const valid = Array<number>(SEA_SHORE_SAMPLES).fill(1);
    valid[50] = 0;
    const material = createWaterMaterial(quality, { surface: "sea", shoreline: {
      minX: 0, width: 800, z: Array<number>(SEA_SHORE_SAMPLES).fill(-800), valid,
    } });
    const reflect = (point: Vector3) => {
      const pigment = seaPigment(material, point);
      return scalars(material, "float fresnel =", "color = mix(color, uSkyHorizon", {
        grazing: 0.9, offshore: pigment.offshore, shoreInfluence: pigment.shoreInfluence,
        SKY_REFLECTION: Number(material.defines.SKY_REFLECTION), uSkyMix: 1,
      }, ["reflection"]).reflection!;
    };
    try {
      const spacing = 800 / (SEA_SHORE_SAMPLES - 1);
      for (const index of [49.1, 49.5, 49.9, 50.1, 50.5, 50.9]) {
        const x = index * spacing;
        const endpointX = (index < 50 ? 49 : 51) * spacing;
        for (const dz of [5, 40, 60, 300]) {
          const point = new Vector3(x, 0, -800 - dz);
          const pigment = seaPigment(material, point);
          expect(pigment.offshore).toBeCloseTo(Math.hypot(x - endpointX, dz), 7);
        }
      }
      // The old validity guard jumped from a physical distance to 1000 m here.
      for (const index of [49, 50, 51]) {
        const x = index * spacing;
        const a = reflect(new Vector3(x - 1e-4, 0, -860));
        const b = reflect(new Vector3(x + 1e-4, 0, -860));
        expect(Math.abs(a - b)).toBeLessThan(1e-4);
        const nearA = seaPigment(material, new Vector3(x - 1e-4, 0, -805));
        const nearB = seaPigment(material, new Vector3(x + 1e-4, 0, -805));
        expect(Math.abs(nearA.shoreInfluence - nearB.shoreInfluence)).toBeLessThan(1e-4);
      }
      for (const x of [49.1, 49.5, 49.9, 50.1, 50.5, 50.9].map(i => i * spacing)) {
        const point = new Vector3(x, 0, -800.26);
        const pigment = seaPigment(material, point);
        // Beside a break, colour may fade around the real endpoint within40m;
        // the unknown secant still cannot draw foam.
        expect(pigment.shoreInfluence).toBeGreaterThanOrEqual(0);
        expect(pigment.shoreInfluence).toBeLessThanOrEqual(1);
        const shore = scalars(material, "float shoreSample =", "float seaBedDepth =", {
          vWaterWorld: point, uShoreBounds: material.uniforms.uShoreBounds!.value,
          uShoreZ: material.uniforms.uShoreZ!.value, uHasShore: 1,
        }, ["shoreValid"]);
        expect(shore.shoreValid).toBe(0);
        const foam = scalars(material, "float foam = 0.0;",
          "color = mix(color, uPaperColor, foam)", {
            surfPhase: 0.25, breaker: shore.shoreValid! * pigment.shoreInfluence,
            phase: 0, offshore: pigment.offshore, offshorePixelWidth: 0.05, brush: 1,
            uHasShore: 1, shoreValid: shore.shoreValid, shoreInfluence: pigment.shoreInfluence, slope: pigment.slope,
          }, ["foam"]).foam;
        expect(foam).toBe(0);
      }
    } finally { material.dispose(); }
  });

  it("rejects inland water effects and uses the finite segment rather than an infinite steep secant", () => {
    const material = createWaterMaterial("High", { surface: "sea", shoreline: {
      minX: 0, width: 800,
      z: Array.from({ length: SEA_SHORE_SAMPLES }, (_, i) => -800 + i * 800 / (SEA_SHORE_SAMPLES - 1) * 10),
    } });
    try {
      const inland = seaPigment(material, new Vector3(300, 0, 2300));
      expect(inland.shoreInfluence).toBe(0);
      const point = new Vector3(300, 0, 1950);
      const pigment = seaPigment(material, point);
      // The infinite line is only 24.88 m away; the finite local segment is >180 m away.
      expect(pigment.offshore).toBeGreaterThan(180);
      const shore = scalars(material, "float shoreSample =", "float seaBedDepth =", {
        // A flat coast makes this inland point exactly 0.3 m from the segment,
        // the foam peak at phase0. Omitting the water-side gate would light it.
        vWaterWorld: new Vector3(300, 0, -799.7), uShoreBounds: material.uniforms.uShoreBounds!.value,
        uShoreZ: Array<number>(SEA_SHORE_SAMPLES).fill(-800), uHasShore: 1,
      }, ["offshore", "shoreInfluence", "shoreValid", "slope"]);
      expect(shore.shoreInfluence).toBe(0);
      expect(shore.offshore).toBeCloseTo(0.3, 8);
      expect(shore.shoreValid).toBe(1);
      expect(shore.slope).toBe(0);
      const foam = scalars(material, "float foam = 0.0;",
        "color = mix(color, uPaperColor, foam)", { phase: 0, offshore: shore.offshore,
          surfPhase: 0.25, breaker: shore.shoreValid! * shore.shoreInfluence!,
          offshorePixelWidth: 0.05, brush: 1, uHasShore: 1,
          shoreValid: shore.shoreValid, shoreInfluence: shore.shoreInfluence, slope: shore.slope,
        }, ["foam"]).foam;
      expect(foam).toBe(0);
    } finally { material.dispose(); }
  });
});

describe("SEA-TESTS coastal river regression retained by HR-SEA", () => {
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
});
