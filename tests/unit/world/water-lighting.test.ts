import { fract, mix, waterNoiseFunctions, waterNoiseSampler } from "./water-noise";
import { Color, MeshToonMaterial, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { afterAll, describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { riverLength, riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { createRampMaterial, disposeRampGradients, RAMP_STEPS } from "../../../src/features/world/materials/ramp";
import { asphaltColorAt } from "../../../src/features/world/road/surface";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, lightingAt, type LightingGrade } from "../../../src/features/world/sky/grade";
import { riverWidthAt, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createWaterMaterial, type WaterMaterial } from "../../../src/features/world/water/material";

const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const gradeAt = (t: number) => applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t);

// Execute the fragment's cross-stream pigment and strokes per colour channel.
// setGrade lights pigment/paper but supplies the horizon as independent sky radiance.
function riverSample(material: WaterMaterial, x: number, flow: number, grazing: number, width = 6, detail = true, distance = 10): Color {
  const source = material.fragmentShader;
  const pigment = source.slice(source.indexOf("float edge ="), source.indexOf("#ifdef SEA_WATER", source.indexOf("float edge =")));
  const stroke = detail ? source.slice(source.indexOf("// Begin river detail scalars."), source.indexOf("#endif", source.indexOf("// Begin river detail scalars."))) : `
      float lane = vWaterUv.x * 50.0 + 0.45 * sin(flow * 0.7);
      float stroke = pow(0.5 + 0.5 * cos(lane), 12.0);
      stroke *= smoothstep(0.1, 0.8, 0.5 + 0.5 * sin(flow * 0.65 + vWaterUv.x * 37.0));
      color = mix(color, uPaperColor, stroke * 0.065);`;
  const reflection = source.slice(source.indexOf("float fresnel ="), source.indexOf("#ifdef SEA_WATER", source.indexOf("float fresnel =")));
  const evaluate = new Function("vWaterUv", "flow", "grazing", "uDeepColor", "uEdgeColor", "uPaperColor", "uSkyMix",
    "SKY_REFLECTION", "riverWidth", "bankDistance", "rippleDistanceFade", "max", "abs", "sin", "cos", "pow", "min", "smoothstep", "mix", "fract", `
    ${waterNoiseFunctions(source)}
    ${[pigment, stroke, reflection.replace(/#ifndef SEA_WATER|#endif/g, "")].join("\n").replace(/\b(float|vec3)\s+/g, "let ")}
    return { color, reflection };
  `);
  const uniforms = material.uniforms;
  const channels = (["r", "g", "b"] as const).map(channel => {
    const result = evaluate({ x }, flow, grazing, uniforms.uDeepColor!.value[channel], uniforms.uEdgeColor!.value[channel],
      uniforms.uPaperColor!.value[channel], uniforms.uSkyMix!.value, material.defines.SKY_REFLECTION, width, Math.min(x, 1 - x) * width,
      1 - smoothstep(15, 40, distance), Math.max,
      Math.abs, Math.sin, Math.cos, Math.pow, Math.min, smoothstep, (a: number, b: number, u: number) => a + (b - a) * u, fract);
    return material.defines.WATER_REFLECTION
      ? result.color + (uniforms.uSkyHorizon!.value[channel] - result.color) * result.reflection : result.color;
  });
  return new Color().setRGB(...channels as [number, number, number]);
}

// Dot products are invariant under the shader's viewMatrix rotation. Include High's
// world-space ripple normal when evaluating an actual pedestrian/downward view.
function grazingAt(material: WaterMaterial, x: number, flow: number, view: Vector3, width = 6): number {
  const normal = new Vector3(0, 1, 0);
  if (material.defines.WATER_RIPPLES) {
    const { field } = waterNoiseSampler(material.fragmentShader);
    const bankDistance = Math.min(x, 1 - x) * width;
    const shallow = Math.max(mix(0.05, 1, 1 - smoothstep(8, 18, width)), 1 - smoothstep(0.8, 2.5, bankDistance));
    normal.add(new Vector3(field(x * width + 0.11, flow) - 0.5, 0, field(x * width, flow + 0.11) - 0.5)
      .multiplyScalar(0.008 * (1 - smoothstep(15, 40, view.length())) * shallow));
  }
  return 1 - Math.max(0, Math.min(1, normal.normalize().dot(view.clone().normalize())));
}

// Actual terrain ramp hook, after flat-surface direct + hemi Lambert lighting.
// This is a linear, pre-fog comparison: both surfaces are at the same camera distance.
function groundSample(pigment: Color, grade: LightingGrade): Color {
  const material = createRampMaterial(0xffffff, RAMP_STEPS.terrain);
  const shader = { vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader,
    uniforms: {} } as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  const body = shader.fragmentShader.match(/float rampLight = ([\s\S]*?)#include <opaque_fragment>/)![0]!
    .replace("#include <opaque_fragment>", "return outgoingLight;")
    // B2-215 world-space detail is a ±10% zero-mean modulation; the bank comparison uses mean ground.
    .replace("outgoingLight *= terrainDetail(diffuseColor.rgb);", "")
    .replace(/dot\( outgoingLight, vec3\( [^)]* \) \)/, "rampLuma")
    .replaceAll("vec3( 0.25 )", "0.25").replaceAll("vec3( 1.0 )", "1.0")
    .replace(/\b(float|vec3)\b/g, "let").replaceAll("diffuseColor.rgb", "diffuseColor");
  const ramp = new Function("outgoingLight", "diffuseColor", "rampLuma", "rampShadowTint", "rampHighlightTint",
    "rampClearLight", "mix", "smoothstep", body);
  const lit = grade.sunColor.clone().multiplyScalar(grade.sunIntensity * (0.625 + 0.375 * grade.sunDirection.y))
    .add(grade.hemiSky.clone().multiplyScalar(grade.hemiIntensity)).multiply(pigment).multiplyScalar(1 / Math.PI);
  const values = (["r", "g", "b"] as const).map(c => ramp(lit[c], pigment[c], luma(lit),
    shader.uniforms.rampShadowTint!.value[c], shader.uniforms.rampHighlightTint!.value[c],
    shader.uniforms.rampClearLight!.value, (a: number, b: number, u: number) => a + (b - a) * u, smoothstep));
  material.dispose();
  return new Color().setRGB(...values as [number, number, number]);
}

function bankPigment(point: Vector3): Color {
  const material = new MeshToonMaterial();
  const mesh = createTileMesh({ cells: 2, size: 4, origin: { x: point.x - 2, y: 0, z: point.z - 2 },
    heights: new Float32Array(9).fill(worldHeight(point.x, point.z)) }, material);
  const color = new Color().fromBufferAttribute(mesh.geometry.getAttribute("color"), 4);
  mesh.geometry.dispose();
  material.dispose();
  return color;
}

afterAll(disposeRampGradients);

describe("water receives the player's grade", () => {
  it.each(["Low", "Balanced", "High"] as const)("bounds the %s dawn reflection against wet banks for pedestrian and downward views", quality => {
    const material = createWaterMaterial(quality);
    try {
      for (const t of [0, 0.02, 0.15]) {
        const grade = gradeAt(t);
        material.setGrade(grade);
        const river = riverPointAt(t);
        const bank = river.clone().add(new Vector3(7, 0, 0));
        const ground = groundSample(bankPigment(bank), grade);
        let maximum = 0, downwardMaximum = 0;
        // Sky radiance can exceed shaded wet-soil light at grazing angles. The
        // pedestrian limit is 2x; looking down suppresses Fresnel and keeps 1.3x.
        for (const x of [0, 0.1, 0.5, 0.9, 1]) for (const flow of [0, 4, 12, 25, 40]) {
          for (const distance of [0, 10, 20, 30]) for (const azimuth of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            const view = new Vector3(Math.sin(azimuth) * distance, 1.7, Math.cos(azimuth) * distance);
            const grazing = grazingAt(material, x, flow, view);
            const water = riverSample(material, x, flow, grazing);
            maximum = Math.max(maximum, luma(water));
            if (distance === 0) downwardMaximum = Math.max(downwardMaximum, luma(water));
            expect(luma(water), `${quality}, t=${t}, distance=${distance}`).toBeLessThanOrEqual(luma(ground) * (distance === 0 ? 1.3 : 2));
            expect(luma(water.clone().convertLinearToSRGB())).toBeGreaterThanOrEqual(0.06);
          }
        }
        // Banks still reveal lighter shallow pigment when Fresnel is negligible.
        for (const flow of [0, 4, 12, 25, 40]) for (const x of [0, 1]) {
          const view = new Vector3(0, 1, 0);
          const bankWater = riverSample(material, x, flow, grazingAt(material, x, flow, view));
          const centre = riverSample(material, 0.5, flow, grazingAt(material, 0.5, flow, view));
          expect(luma(bankWater)).toBeGreaterThan(luma(centre));
        }
        process.stdout.write(`${quality} forest t=${t}: water luma <= ${maximum.toFixed(4)}, downward <= ${downwardMaximum.toFixed(4)}, ground=${luma(ground).toFixed(4)}\n`);
      }
    } finally { material.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps the %s coast-road stream within 0.5–1.1 times asphalt at t=0.86", quality => {
    const t = 0.86, grade = gradeAt(t), road = pathPointAt(t);
    const material = createWaterMaterial(quality, { grade });
    material.setSkyMix(timeOfDayAt(t));
    try {
      const riverT = nearestRiver(road.x, road.z).t;
      // Ribbon UV.y is t * arc length, rather than straight-line distance from the source.
      const length = riverLength();
      const camera = road.clone().setY(worldHeight(road.x, road.z) + 1.7);
      const ground = groundSample(asphaltColorAt(road.x, road.z, 1.1), grade);
      let minimum = Infinity, maximum = 0;
      for (const x of [0, 0.1, 0.5, 0.9, 1]) for (const distance of [15, 40, 80, 120]) {
        const sampleT = riverT + distance / length;
        const sampleFlow = sampleT * length;
        const point = riverPointAt(sampleT);
        const tangent = riverTangentAt(sampleT);
        point.addScaledVector(new Vector3(-tangent.z, 0, tangent.x), (x - 0.5) * riverWidthAt(sampleT));
        point.y = waterLevelAt(point.z);
        const grazing = grazingAt(material, x, sampleFlow, camera.clone().sub(point));
        const brightness = luma(riverSample(material, x, sampleFlow, grazing));
        minimum = Math.min(minimum, brightness);
        maximum = Math.max(maximum, brightness);
        // Compare every sample before fog at the same distance: bright evening
        // sky must remain visible even when little light reaches the pigment.
        expect(brightness).toBeGreaterThanOrEqual(luma(ground) * 0.5);
        expect(brightness).toBeLessThanOrEqual(luma(ground) * 1.1);
      }
      process.stdout.write(`${quality} road t=0.86: stream=${minimum.toFixed(4)}–${maximum.toFixed(4)}, asphalt=${luma(ground).toFixed(4)}\n`);
    } finally { material.dispose(); }
  });

  it("copies each grade without compounding pigment or retaining mutable colours, and has no unlit emission", () => {
    for (const surface of ["river", "sea"] as const) {
      const material = createWaterMaterial("High", { surface });
      const grade = gradeAt(0.93);
      material.setGrade(grade);
      const keys = ["uEdgeColor", "uDeepColor", "uPaperColor", "uSkyHorizon", "uSunWashColor", "uSkyTop"];
      const before = keys.map(key => material.uniforms[key]!.value.clone());
      for (let i = 0; i < 20; i++) material.setGrade(grade);
      expect(keys.map(key => material.uniforms[key]!.value)).toEqual(before);
      grade.skyHorizon.set(PALETTE.skyLow);
      expect(material.uniforms.uSkyHorizon!.value).toEqual(before[3]);
      material.setGrade(grade);
      const reflectedSky = material.uniforms.uSkyHorizon!.value.clone();
      grade.sunIntensity = grade.hemiIntensity = 0;
      material.setGrade(grade);
      // A bright sky is an external source even with direct/hemi lighting off.
      expect(material.uniforms.uSkyHorizon!.value).toEqual(reflectedSky);
      expect(luma(material.uniforms.uSkyHorizon!.value)).toBeGreaterThan(0);
      if (surface === "river") expect(luma(riverSample(material, 0.5, 12, 0.9))).toBeGreaterThan(0);
      expect(keys.filter(key => key !== "uSkyHorizon" && key !== "uSkyTop")
        .map(key => luma(material.uniforms[key]!.value))).toEqual([0, 0, 0, 0]);
      // No emission means darkness only when incident light AND the sky are dark.
      grade.skyHorizon.multiplyScalar(1e-8);
      grade.skyTop.multiplyScalar(1e-8);
      material.setGrade(grade);
      for (const key of keys) expect(luma(material.uniforms[key]!.value)).toBeLessThan(1e-8);
      grade.skyHorizon.multiplyScalar(0);
      grade.skyTop.multiplyScalar(0);
      material.setGrade(grade);
      expect(keys.map(key => luma(material.uniforms[key]!.value))).toEqual(keys.map(() => 0));
      material.dispose();
      material.setGrade(gradeAt(0.55));
      expect(luma(material.uniforms.uDeepColor!.value)).toBe(0);
    }
  });
});


describe("B2-219 river surface contrast", () => {
  it("resolves ripples in 4 x 4 m hill windows while retaining mean brightness", () => {
    const material = createWaterMaterial("High", { grade: gradeAt(0.55) });
    material.setSkyMix(timeOfDayAt(0.55));
    try {
      for (const width of [4, 6, 8]) for (const origin of [100, 400, 800]) {
        const values: number[] = [], previous: number[] = [], linear: number[] = [], oldLinear: number[] = [];
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const u = 0.5 + ((x + 0.5) / 64 * 4 - 2) / width;
          const flow = origin + (y + 0.5) / 64 * 4;
          linear.push(luma(riverSample(material, u, flow, 0, width)));
          oldLinear.push(luma(riverSample(material, u, flow, 0, width, false)));
          values.push(luma(riverSample(material, u, flow, 0, width).convertLinearToSRGB()));
          previous.push(luma(riverSample(material, u, flow, 0, width, false).convertLinearToSRGB()));
        }
        const mean = values.reduce((a, b) => a + b) / values.length;
        const before = previous.reduce((a, b) => a + b) / previous.length;
        const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
        const linearMean = linear.reduce((a, b) => a + b) / linear.length;
        const oldMean = oldLinear.reduce((a, b) => a + b) / oldLinear.length;
        const linearStd = Math.sqrt(linear.reduce((a, b) => a + (b - linearMean) ** 2, 0) / linear.length);
        // B2-219c uses sparse <=12% highlights; retain colour/mean checks here.
        expect(linearStd).toBeGreaterThanOrEqual(0.0015);
        expect(Math.abs(linearMean / oldMean - 1)).toBeLessThanOrEqual(0.1);
        expect(std).toBeGreaterThanOrEqual(0.005);
        expect(Math.abs(mean / before - 1)).toBeLessThanOrEqual(0.1);
        process.stdout.write(`River width=${width}, origin=${origin}: linear std=${linearStd.toFixed(4)}, linear mean change=${((linearMean / oldMean - 1) * 100).toFixed(2)}%, display luma std=${std.toFixed(4)}, mean change=${((mean / before - 1) * 100).toFixed(2)}%\n`);
      }
    } finally { material.dispose(); }
  });
});


it("keeps river foam intermittent and within 0.6 m for narrow and wide ribbons", () => {
  const material = createWaterMaterial("High");
  const source = material.fragmentShader;
  const body = source.slice(source.indexOf("// Begin river detail scalars."), source.indexOf("// End river detail scalars."))
    .replace(/\bfloat\s+/g, "let ");
  const evaluate = new Function("vWaterUv", "flow", "riverWidth", "bankDistance", "edge", "uSkyMix", "rippleDistanceFade", "max", "mix", "smoothstep", "sin", "cos", "pow", "fract", waterNoiseFunctions(source) + body + "return { riverFoam, shallowDetail };");
  const sample = (width: number, distance: number, flow: number) => evaluate({x: distance / width}, flow, width, distance,
    1 - 2 * distance / width, 0.5, 1, Math.max, (a: number, b: number, t: number) => a + (b - a) * t, smoothstep, Math.sin, Math.cos, Math.pow, fract);
  try {
    for (const width of [0.6, 4, 10, 60]) {
      let covered = 0;
      for (let i = 0; i < 80; i++) for (let j = 0; j < 200; j++) {
        const distance = (i + 0.5) / 80 * Math.min(0.6, width / 2);
        covered += Number(sample(width, distance, j * 0.1).riverFoam > 0.01);
      }
      expect(covered / 16000).toBeGreaterThanOrEqual(0.3);
      expect(covered / 16000).toBeLessThanOrEqual(0.7);
      for (const distance of [0.6, 0.601, 1, 10]) expect(sample(width, distance, 4).riverFoam).toBe(0);
    }
    expect(sample(1, 0.2, 0).shallowDetail).toBeGreaterThan(sample(30, 2, 0).shallowDetail);
  } finally { material.dispose(); }
});


describe("B2-221 dawn stream", () => {
  it.each(["Low", "Balanced", "High"] as const)("keeps %s green-cyan water and readable ripples at 5?20 m", quality => {
    const t = 0.02;
    const material = createWaterMaterial(quality, { grade: gradeAt(t), skyMix: timeOfDayAt(t) });
    try {
      for (const distance of [5, 10, 20]) for (const width of [4, 6, 8]) {
        const values: number[] = [];
        const colors: Color[] = [];
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
          const u = 0.5 + ((x + 0.5) / 48 * 4 - 2) / width;
          const flow = t * riverLength() + (y + 0.5) / 48 * 4;
          const view = new Vector3(0, 1.7, distance);
          // Display RGB measures the visible dawn colour/contrast after Three's output conversion.
          const color = riverSample(material, u, flow, grazingAt(material, u, flow, view, width), width, true, view.length()).convertLinearToSRGB();
          values.push(luma(color));
          colors.push(color);
        }
        const meanColor = colors.reduce((sum, color) => sum.add(color), new Color(0, 0, 0)).multiplyScalar(1 / colors.length);
        const chroma = Math.max(meanColor.r, meanColor.g, meanColor.b) - Math.min(meanColor.r, meanColor.g, meanColor.b);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
        expect(chroma).toBeGreaterThanOrEqual(0.04);
        expect(Math.max(meanColor.g, meanColor.b)).toBeGreaterThan(meanColor.r);
        // B2-219c replaces the former high-contrast strokes with <=12% highlights.
        expect(std).toBeGreaterThanOrEqual(0.0025);
        process.stdout.write(quality + ' dawn distance=' + distance + ', width=' + width + ': chroma=' + chroma.toFixed(4) + ', std=' + std.toFixed(4) + '\n');
      }
    } finally { material.dispose(); }
  });
});


it("blends the wet river margin smoothly over 0.55 m", () => {
  const material = createWaterMaterial("High");
  try {
    const source = material.fragmentShader;
    const body = source.slice(source.indexOf("float wetBank ="), source.indexOf("color *= modulation;"));
    const evaluate = new Function("bankDistance", "color", "uEdgeColor", "smoothstep", "mix",
      body.replace(/\b(float|vec3)\s+/g, "let ") + "return color;");
    const sample = (distance: number) => evaluate(distance, 1, 1, smoothstep,
      (a: number, b: number, t: number) => a + (b - a) * t) as number;
    expect(sample(0)).toBeCloseTo(0.92);
    expect(sample(0.55)).toBe(1);
    expect(sample(0.8)).toBe(1);
    let previous = sample(0);
    for (let i = 1; i <= 55; i++) {
      const value = sample(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value - previous).toBeLessThan(0.003);
      previous = value;
    }
  } finally { material.dispose(); }
});
