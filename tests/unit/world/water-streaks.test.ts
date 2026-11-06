import { expect, it } from "vitest";
import { createWaterMaterial } from "../../../src/features/world/water/material";
import { fract, mix, smoothstep, waterNoiseFunctions, waterNoiseSampler } from "./water-noise";

function riverSampler(source: string) {
  const body = source.slice(source.indexOf("// Begin river detail scalars."), source.indexOf("// End river detail scalars."))
    .replace(/\bfloat\s+/g, "let ");
  const evaluate = new Function("vWaterUv", "flow", "riverWidth", "bankDistance", "edge", "rippleDistanceFade",
    "mix", "smoothstep", "sin", "max", "fract", waterNoiseFunctions(source) + body + "return modulation - 1;");
  return (x: number, y: number, width = 6, distance = 10) => evaluate({ x: x / width }, y, width,
    Math.min(x, width - x), Math.abs(x / width * 2 - 1), 1 - smoothstep(15, 40, distance),
    mix, smoothstep, Math.sin, Math.max, fract) as number;
}

it("B2-219c bounds sparse soft highlights, their length, and distance/shallow fade", () => {
  const material = createWaterMaterial("High");
  const sample = riverSampler(material.fragmentShader);
  try {
    for (const origin of [-80, 100, 400, 800]) {
      let area = 0, peak = 0, farPeak = 0, longest = 0;
      const n = 200, step = 6 / n;
      for (let i = 0; i < n; i++) {
        let run = 0;
        for (let j = 0; j < n; j++) {
          const x = (i + 0.5) * step, y = origin + (j + 0.5) * step;
          const value = sample(x, y);
          // The old >15% gate cannot coexist with the new <=12% cap.
          // Visible marks use >3% pigment luma (one quarter of the allowed peak).
          area += Number(value > 0.03);
          peak = Math.max(peak, value); farPeak = Math.max(farPeak, sample(x, y, 6, 40));
          run = value > 0.03 ? run + step : 0; longest = Math.max(longest, run);
        }
      }
      const ratio = area / (n * n);
      process.stdout.write('noise origin=' + origin + ': area=' + (ratio * 100).toFixed(2)
        + '%, peak=' + peak.toFixed(4) + ', far/near=' + (farPeak / peak).toFixed(3) + ', longest=' + longest.toFixed(2) + 'm\n');
      expect(ratio).toBeGreaterThanOrEqual(0.04); expect(ratio).toBeLessThanOrEqual(0.12);
      expect(peak).toBeLessThanOrEqual(0.12 + 1e-12); expect(peak).toBeGreaterThan(0.09);
      expect(farPeak).toBeLessThanOrEqual(peak * 0.2); expect(longest).toBeLessThanOrEqual(3);
    }
    for (let j = 0; j < 200; j++) {
      expect(sample(15, j * 0.1, 30)).toBeLessThanOrEqual(0.006 + 1e-12);
      const near = sample(3, j * 0.1);
      let previous = near;
      for (let d = 15; d <= 40; d++) {
        const value = sample(3, j * 0.1, 6, d);
        expect(value).toBeLessThanOrEqual(previous + 1e-12); previous = value;
      }
    }
  } finally { material.dispose(); }
});

it("has no along-flow correlation peak at any sampled lag from 0.5 to 8m", () => {
  const material = createWaterMaterial("High");
  try {
    const { field, streak } = waterNoiseSampler(material.fragmentShader);
    // Every 5 cm lag in the requested interval; 64 m windows, several origins,
    // raw noise and thresholded highlights. Center each pair (Pearson correlation).
    for (const origin of [-80, 100, 400, 800]) for (const [name, sample] of [["field", field], ["streak", streak]] as const) {
      const rows = Array.from({ length: 24 }, (_, x) => Float64Array.from({ length: 1440 }, (_, y) => sample((x + 0.5) * 0.25, origin + y * 0.05)));
      let maximum = 0;
      for (let lag = 10; lag <= 160; lag++) {
        let a = 0, b = 0, aa = 0, bb = 0, ab = 0, n = 0;
        for (const row of rows) for (let j = 0; j < 1280; j++) {
          const u = row[j]!, v = row[j + lag]!;
          a += u; b += v; aa += u * u; bb += v * v; ab += u * v; n++;
        }
        const correlation = (ab - a * b / n) / Math.sqrt((aa - a * a / n) * (bb - b * b / n));
        maximum = Math.max(maximum, Math.abs(correlation));
        expect(Math.abs(correlation), name + ' origin=' + origin + ', lag=' + lag * 0.05).toBeLessThanOrEqual(0.35);
      }
      process.stdout.write(name + ' origin=' + origin + ': max |autocorrelation|=' + maximum.toFixed(4) + '\n');
    }
  } finally { material.dispose(); }
});

it("uses the same warped field for sea detail and advects without periodic lane/dash masks", () => {
  const material = createWaterMaterial("High", { surface: "sea" });
  try {
    const source = material.fragmentShader;
    const body = source.slice(source.indexOf("// Begin sea ripple scalars."), source.indexOf("// End sea ripple scalars."));
    const evaluate = new Function("vWaterWorld", "uTime", "offshore", "uHasShore", "rippleDistanceFade", "mix", "smoothstep", "fract",
      waterNoiseFunctions(source) + body.replace(/\bfloat\s+/g, "let ") + "return seaStroke;");
    const sample = (x: number, y: number, time: number, offshore = 1, fade = 1) =>
      evaluate({ x, z: y }, time, offshore, 1, fade, mix, smoothstep, fract) as number;
    for (const block of [body, source.slice(source.indexOf("float across ="), source.indexOf("float riverBrush"))]) {
      expect(block).not.toMatch(/\b(sin|cos|fract)\(/);
    }
    for (let i = 0; i < 200; i++) {
      const x = i * 0.07, y = i * 0.17;
      const value = sample(x, y, 0);
      expect(sample(x, y + 0.5, 10)).toBeCloseTo(value, 10);
      expect(sample(x, y, 0, 30)).toBeCloseTo(value * 0.05, 12);
      expect(sample(x, y, 0, 1, 0)).toBe(0);
    }
    expect(source).toContain("float x = across * 9.0;");
    expect(source).toContain("float y = along * 3.0;");
    expect(source).toContain("flow -= uTime * 0.05;");
  } finally { material.dispose(); }
});
