import { expect, it } from "vitest";
import { createWaterMaterial } from "../../../src/features/world/water/material";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

it("B2-219b measures short, sparse, distance-faded streaks against the frozen baseline", () => {
  const material = createWaterMaterial("High");
  const source = material.fragmentShader;
  const body = source.slice(source.indexOf("// Begin river detail scalars."), source.indexOf("// End river detail scalars."))
    .replace(/\bfloat\s+/g, "let ");
  const evaluate = new Function("vWaterUv", "flow", "riverWidth", "bankDistance", "edge", "uSkyMix",
    "rippleDistanceFade", "mix", "smoothstep", "sin", "cos", "pow", "max", body + "return modulation;");
  const densityAt = new Function("riverWidth", "bankDistance", "mix", "smoothstep",
    body.slice(0, body.indexOf("let lane =")) + "return density;");
  const sample = (x: number, flow: number, width: number, sky: number, distance: number, old = false) => {
    const edge = Math.abs(x * 2 - 1), bank = Math.min(x, 1 - x) * width;
    let modulation: number;
    if (old) {
      // Frozen B2-219/B2-221 formula: compare with the actual new GLSL above.
      const density = mix(9, 15, 1 - smoothstep(1, 8, width)) * mix(1.3, 1, smoothstep(0, 0.8, bank));
      const lane = x * width * density + 0.45 * Math.sin(flow * 0.7);
      const stroke = Math.pow(0.5 + 0.5 * Math.cos(lane), mix(6, 12, smoothstep(0, 0.4, sky)))
        * smoothstep(0.1, 0.8, 0.5 + 0.5 * Math.sin(flow * 0.65 + x * 37));
      modulation = 1 + 3.2 * (stroke - mix(0.15, 0.092, smoothstep(0, 0.4, sky))) * (1 - smoothstep(0.6, 1, edge));
    } else {
      modulation = evaluate({ x }, flow, width, bank, edge, sky, 1 - smoothstep(15, 40, distance),
        mix, smoothstep, Math.sin, Math.cos, Math.pow, Math.max);
    }
    // A scalar pigment multiplier is also the linear-luma ratio to the same
    // unmodulated water pixel; foam and sky radiance are separate contributions.
    return mix(Math.min(modulation, 1.2), modulation, smoothstep(0, 0.4, sky));
  };
  try {
    expect(source).toContain("smoothstep(15.0, 40.0, length(vWaterWorld - cameraPosition))");
    for (const width of [1, 4, 8, 30]) for (const bank of [0.2, 2]) {
      const oldDensity = mix(9, 15, 1 - smoothstep(1, 8, width)) * mix(1.3, 1, smoothstep(0, 0.8, bank));
      expect(densityAt(width, bank, mix, smoothstep) / oldDensity).toBeCloseTo(0.4);
    }
    for (const sky of [0, 1]) for (const origin of [100, 400, 800]) {
      let oldArea = 0, area = 0, peak10 = 0, peak40 = 0, longest = 0;
      const n = 240, step = 6 / n;
      for (let i = 0; i < n; i++) {
        let run = 0;
        const x = (i + 0.5) / n;
        for (let j = 0; j < n; j++) {
          const flow = origin + (j + 0.5) * step;
          const old = sample(x, flow, 6, sky, 10, true);
          const near = sample(x, flow, 6, sky, 10), far = sample(x, flow, 6, sky, 40);
          oldArea += Number(old > 1.15); area += Number(near > 1.15);
          peak10 = Math.max(peak10, near - 1); peak40 = Math.max(peak40, far - 1);
          run = near > 1.15 ? run + step : 0; longest = Math.max(longest, run);
        }
      }
      const ratio = area / (n * n), oldRatio = oldArea / (n * n);
      process.stdout.write(`streak sky=${sky}, origin=${origin}: before=${(oldRatio * 100).toFixed(2)}%, after=${(ratio * 100).toFixed(2)}%, peak40/10=${(peak40 / peak10).toFixed(3)}, longest=${longest.toFixed(2)}m\n`);
      expect(ratio).toBeGreaterThanOrEqual(0.04); expect(ratio).toBeLessThanOrEqual(0.15);
      expect(peak40).toBeLessThanOrEqual(peak10 * 0.2); expect(longest).toBeLessThanOrEqual(3);
      expect(sample(0.5, origin, 30, sky, 10) - 1).toBeLessThanOrEqual(0.15);
    }
  } finally { material.dispose(); }
});

it("breaks sea surface detail into short marks while leaving the sunset reflection separate", () => {
  const material = createWaterMaterial("High", { surface: "sea" });
  try {
    const source = material.fragmentShader;
    const body = source.slice(source.indexOf("// Begin sea ripple scalars."), source.indexOf("// End sea ripple scalars."))
      .replace(/\bfloat\s+/g, "let ");
    const evaluate = new Function("vWaterWorld", "phase", "offshore", "uHasShore", "rippleDistanceFade",
      "mix", "smoothstep", "sin", "cos", body + "return seaStroke;");
    const sample = (x: number, z: number, phase: number, offshore: number, distance: number) =>
      evaluate({ x, z }, phase, offshore, 1, 1 - smoothstep(15, 40, distance), mix, smoothstep, Math.sin, Math.cos) as number;
    let longest = 0, peak = 0;
    for (const phase of [0, Math.PI / 2, Math.PI]) for (const transverse of [0, 0.5, 1, 10]) {
      for (const alongX of [false, true]) {
        let run = 0;
        for (let i = 0; i < 1200; i++) {
          const x = alongX ? i * 0.025 : transverse, z = alongX ? transverse : i * 0.025;
          const near = sample(x, z, phase, 1, 10);
          peak = Math.max(peak, near);
          run = near > 0.01 ? run + 0.025 : 0; longest = Math.max(longest, run);
          expect(sample(x, z, phase, 1, 40)).toBe(0);
          expect(sample(x, z, phase, 30, 10)).toBeLessThanOrEqual(near * 0.05 + 1e-12);
        }
      }
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(longest).toBeLessThanOrEqual(2);
    process.stdout.write(`sea surface: longest mark=${longest.toFixed(2)}m, far amplitude=0; deep/shore=0.05\n`);
  } finally { material.dispose(); }
});
