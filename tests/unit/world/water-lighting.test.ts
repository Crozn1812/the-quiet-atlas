import { Color, MeshToonMaterial, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { afterAll, describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { riverLength, riverPointAt } from "../../../src/features/world/layout/river";
import { createRampMaterial, disposeRampGradients, RAMP_STEPS } from "../../../src/features/world/materials/ramp";
import { asphaltColorAt } from "../../../src/features/world/road/surface";
import { directGrade } from "../../../src/features/world/scene/compose";
import { applyCoastAtmosphere, lightingAt, type LightingGrade } from "../../../src/features/world/sky/grade";
import { worldHeight } from "../../../src/features/world/terrain/height";
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
// The material's own setGrade supplies all lit colours, including paper and horizon.
function riverSample(material: WaterMaterial, x: number, flow: number, grazing: number): Color {
  const source = material.fragmentShader;
  const pigment = source.slice(source.indexOf("float edge ="), source.indexOf("#ifdef SEA_WATER", source.indexOf("float edge =")));
  const stroke = source.slice(source.indexOf("float lane ="), source.indexOf("#endif", source.indexOf("float lane =")));
  const reflection = source.slice(source.indexOf("float fresnel ="), source.indexOf("#ifdef SEA_WATER", source.indexOf("float fresnel =")));
  const evaluate = new Function("vWaterUv", "flow", "grazing", "uDeepColor", "uEdgeColor", "uPaperColor", "uSkyMix",
    "SKY_REFLECTION", "abs", "sin", "cos", "pow", "smoothstep", "mix", `
    ${[pigment, stroke, reflection].join("\n").replace(/\b(float|vec3)\s+/g, "let ")}
    return { color, reflection };
  `);
  const uniforms = material.uniforms;
  const channels = (["r", "g", "b"] as const).map(channel => {
    const result = evaluate({ x }, flow, grazing, uniforms.uDeepColor!.value[channel], uniforms.uEdgeColor!.value[channel],
      uniforms.uPaperColor!.value[channel], uniforms.uSkyMix!.value, material.defines.SKY_REFLECTION,
      Math.abs, Math.sin, Math.cos, Math.pow, smoothstep, (a: number, b: number, u: number) => a + (b - a) * u);
    return material.defines.WATER_REFLECTION
      ? result.color + (uniforms.uSkyHorizon!.value[channel] - result.color) * result.reflection : result.color;
  });
  return new Color().setRGB(...channels as [number, number, number]);
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
  it.each(["Low", "Balanced", "High"] as const)("keeps the %s dawn stream below 1.3 times the adjacent ground", quality => {
    const material = createWaterMaterial(quality);
    try {
      for (const t of [0, 0.15]) {
        const grade = gradeAt(t);
        material.setGrade(grade);
        const river = riverPointAt(t);
        const bank = river.clone().add(new Vector3(7, 0, 0));
        const ground = groundSample(bankPigment(bank), grade);
        let maximum = 0;
        for (const x of [0, 0.1, 0.5, 0.9, 1]) for (const flow of [0, 4, 12, 25, 40]) for (const grazing of [0, 0.5, 1]) {
          const water = riverSample(material, x, flow, grazing);
          maximum = Math.max(maximum, luma(water));
          expect(luma(water)).toBeLessThanOrEqual(luma(ground) * 1.3);
          expect(luma(water.clone().convertLinearToSRGB())).toBeGreaterThanOrEqual(0.06);
        }
        process.stdout.write(`${quality} forest t=${t}: water luma <= ${maximum.toFixed(4)}, ground=${luma(ground).toFixed(4)}\n`);
      }
    } finally { material.dispose(); }
  });

  it.each(["Low", "Balanced", "High"] as const)("keeps the %s coast-road stream darker than asphalt at t=0.86", quality => {
    const t = 0.86, grade = gradeAt(t), road = pathPointAt(t);
    const material = createWaterMaterial(quality, { grade });
    try {
      const riverT = nearestRiver(road.x, road.z).t;
      // Ribbon UV.y is t * arc length, rather than straight-line distance from the source.
      const flow = riverT * riverLength();
      const ground = groundSample(asphaltColorAt(road.x, road.z, 1.1), grade);
      let maximum = 0;
      for (const x of [0, 0.1, 0.5, 0.9, 1]) for (const distance of [15, 40, 80, 120]) {
        const grazing = 1 - 1.7 / Math.hypot(distance, 1.7);
        maximum = Math.max(maximum, luma(riverSample(material, x, flow + distance, grazing)));
      }
      expect(maximum).toBeLessThan(luma(ground));
      process.stdout.write(`${quality} road t=0.86: stream=${maximum.toFixed(4)} < asphalt=${luma(ground).toFixed(4)}\n`);
    } finally { material.dispose(); }
  });

  it("copies each grade without compounding pigment or retaining mutable colours, and has no unlit emission", () => {
    for (const surface of ["river", "sea"] as const) {
      const material = createWaterMaterial("High", { surface });
      const grade = gradeAt(0.93);
      material.setGrade(grade);
      const keys = ["uEdgeColor", "uDeepColor", "uPaperColor", "uSkyHorizon", "uSunWashColor"];
      const before = keys.map(key => material.uniforms[key]!.value.clone());
      for (let i = 0; i < 20; i++) material.setGrade(grade);
      expect(keys.map(key => material.uniforms[key]!.value)).toEqual(before);
      grade.skyHorizon.set(PALETTE.ink);
      expect(material.uniforms.uSkyHorizon!.value).toEqual(before[3]);
      grade.sunIntensity = grade.hemiIntensity = 0;
      material.setGrade(grade);
      expect(keys.map(key => luma(material.uniforms[key]!.value))).toEqual(keys.map(() => 0));
      material.dispose();
      material.setGrade(gradeAt(0.55));
      expect(luma(material.uniforms.uDeepColor!.value)).toBe(0);
    }
  });
});
