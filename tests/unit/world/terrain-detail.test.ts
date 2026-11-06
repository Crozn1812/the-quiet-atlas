import { Color, MeshToonMaterial, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { expect, it } from "vitest";
import { createRampMaterial, RAMP_STEPS, disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { hex } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (v: number) => v - Math.floor(v);
const hash = (x: number, z: number) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(0, 1, fract(x)), fz = smooth(0, 1, fract(z));
  const a = hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx;
  const b = hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx;
  return a * (1 - fz) + b * fz;
}
const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
function detail(x: number, z: number, pigment: Color, distance: number) {
  const fade = 1 - 0.8 * smooth(40, 200, distance);
  const coarse = smooth(0.25, 0.75, noise(x / 4.5, z / 4.5)) * 2 - 1;
  const fine = smooth(0.25, 0.75, noise(x / 0.9, z / 0.9)) * 2 - 1;
  const grain = 0.65 * coarse + 0.35 * fine;
  const hue = new Color(hex(grain > 0 ? "grassDry" : "forestDeep"));
  hue.multiplyScalar(1 / Math.max(luma(hue), 0.0001));
  hue.lerp(new Color(1, 1, 1), 1 - Math.abs(grain) * 0.035 * fade);
  const sun = lightingAt(0).sunDirection;
  const canopyX = x - sun.x * 3 / Math.max(Math.abs(sun.y), 0.15);
  const canopyZ = z - sun.z * 3 / Math.max(Math.abs(sun.y), 0.15);
  const patch = (smooth(0.35, 0.65, noise(canopyX / 6, canopyZ / 6)) * 2 - 1)
    * (1 - smooth(0.24, 0.34, luma(pigment)));
  return hue.multiplyScalar(1 + fade * (0.10 * grain + 0.18 * patch));
}

it("adds forest detail in the existing interpolated 20 m ground at t=0.15 and fades at 200 m", () => {
  const tangent = pathPointAt(0.1501).sub(pathPointAt(0.1499));
  const p = pathPointAt(0.15).addScaledVector(new Vector3(-tangent.z, 0, tangent.x).normalize(), 30);
  const origin = { x: p.x - 10, y: 0, z: p.z - 10 };
  const material = new MeshToonMaterial();
  const mesh = createTileMesh({ cells: 10, size: 20, origin,
    heights: Float32Array.from({ length: 121 }, (_, i) => worldHeight(origin.x + Math.floor(i / 11) * 2, origin.z + i % 11 * 2)),
  }, material);
  try {
    const colors = mesh.geometry.getAttribute("color");
    const color = (x: number, z: number) => new Color().fromBufferAttribute(colors, x * 11 + z);
    const before: number[] = [], after: number[] = [];
    let nearAmplitude = 0, farAmplitude = 0;
    for (let x = 0; x < 20; x += 0.25) for (let z = 0; z < 20; z += 0.25) {
      const ix = Math.floor(x / 2), iz = Math.floor(z / 2), fx = x / 2 - ix, fz = z / 2 - iz;
      const base = fx + fz <= 1
        ? color(ix, iz).multiplyScalar(1 - fx - fz).add(color(ix + 1, iz).multiplyScalar(fx)).add(color(ix, iz + 1).multiplyScalar(fz))
        : color(ix + 1, iz + 1).multiplyScalar(fx + fz - 1).add(color(ix + 1, iz).multiplyScalar(1 - fz)).add(color(ix, iz + 1).multiplyScalar(1 - fx));
      const near = base.clone().multiply(detail(origin.x + x, origin.z + z, base, 20));
      const far = base.clone().multiply(detail(origin.x + x, origin.z + z, base, 200));
      before.push(luma(base)); after.push(luma(near));
      nearAmplitude += (luma(near) - luma(base)) ** 2;
      farAmplitude += (luma(far) - luma(base)) ** 2;
    }
    const stats = (a: number[]) => {
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      return { mean, deviation: Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length) };
    };
    const old = stats(before), next = stats(after);
    console.info(`terrain detail: baseline ${old.mean}/${old.deviation}; deviation ${(next.deviation / old.deviation).toFixed(3)}x; mean drift ${(100 * (next.mean / old.mean - 1)).toFixed(3)}%; 200m amplitude ${(100 * Math.sqrt(farAmplitude / nearAmplitude)).toFixed(2)}%`);
    // Same probes measured before B2-224: albedo mean and B2-215 shaded deviation
    // (deviation rounded upward). Keep a fixed baseline, including the old sun patches.
    const albedoGain = old.mean / 0.1993449474708341;
    const contrastGain = next.deviation / 0.0328;
    console.info(`B2-224: albedo +${(100 * (albedoGain - 1)).toFixed(2)}%; contrast ${contrastGain.toFixed(3)}x`);
    expect(albedoGain).toBeGreaterThanOrEqual(1.15);
    expect(albedoGain).toBeLessThanOrEqual(1.25);
    expect(contrastGain).toBeGreaterThanOrEqual(1.5);
    expect(next.deviation / old.deviation).toBeGreaterThan(1);
    expect(Math.abs(next.mean / old.mean - 1)).toBeLessThanOrEqual(0.05);
    expect(Math.sqrt(farAmplitude / nearAmplitude)).toBeLessThanOrEqual(0.3);
  } finally { mesh.geometry.dispose(); material.dispose(); }
});

it("injects world-space detail only in continuous terrain, after lighting and before fog", () => {
  for (const continuous of [true, false]) {
    const material = createRampMaterial(hex("grass"), { ...RAMP_STEPS.terrain, continuous });
    const shader = { ...ShaderLib.toon, uniforms: {} } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader.includes("outgoingLight *= terrainDetail(diffuseColor.rgb);")).toBe(continuous);
    if (continuous) {
      expect(shader.vertexShader).toContain("modelMatrix * vec4(transformed, 1.0)");
      expect(shader.fragmentShader).toContain("directionalLights[0].direction, viewMatrix");
      expect(shader.fragmentShader.indexOf("vec3 terrainDetail")).toBeGreaterThan(shader.fragmentShader.indexOf("#include <lights_pars_begin>"));
      expect(shader.fragmentShader.indexOf("outgoingLight *= terrainDetail")).toBeLessThan(shader.fragmentShader.indexOf("#include <fog_fragment>"));
      expect(shader.fragmentShader).toContain("terrainWorld.xz / 4.5");
      expect(shader.fragmentShader).toContain("terrainWorld.xz / 0.9");
      expect(shader.fragmentShader).toContain("terrainNoise(canopy / 6.0)");
      expect(shader.fragmentShader).toContain("0.18 * sunPatch");
      expect(shader.fragmentShader).toContain("smoothstep(0.24, 0.34");
    }
    material.dispose();
  }
  disposeRampGradients();
});







