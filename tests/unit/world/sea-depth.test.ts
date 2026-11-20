import { DataTexture, LinearFilter } from "three";
import { describe, expect, it, vi } from "vitest";
import { createSeaDepth, SEA_DEPTH_GLSL, type SeaDepthField } from "../../../src/features/world/shore/sea-depth";
import { riverLength, riverPointAt } from "../../../src/features/world/layout/river";
import { surfaceHeight } from "../../../src/features/world/terrain/height";
import { createSea } from "../../../src/features/world/water/sea";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const source = SEA_DEPTH_GLSL.match(/float seaShallows\(float depth\) \{([\s\S]*?)\n  \}/)![1]!;
const shallows = new Function("depth", "smoothstep", "max", source);
const pigmentWeight = (depth: number): number => shallows(depth, smoothstep, Math.max);

// Linear filtering with the production field's sample centres, in world metres.
function sample(field: SeaDepthField, x: number, z: number, channel = 0) {
  const data = field.texture.image.data as Uint8Array;
  const u = Math.max(0, Math.min(field.size.x - 1, (x - field.bounds.x) / 2));
  const v = Math.max(0, Math.min(field.size.y - 1, (z - field.bounds.y) / 2));
  const col = Math.min(Math.floor(u), field.size.x - 2), row = Math.min(Math.floor(v), field.size.y - 2);
  const at = (dx: number, dz: number) => data[((row + dz) * field.size.x + col + dx) * 2 + channel]! / 255;
  const a = at(0, 0) * (1 - (u - col)) + at(1, 0) * (u - col);
  const b = at(0, 1) * (1 - (u - col)) + at(1, 1) * (u - col);
  const value = a * (1 - (v - row)) + b * (v - row);
  return channel === 0 ? value * 4 - 1 : value;
}

describe("HR-SEA terrain depth and stream ownership", () => {
  it("bakes the real rendered terrain across the bay and returning headland, independent of coast secants", () => {
    const field = createSeaDepth();
    let shallow = 0, deep = 0;
    try {
      for (let x = -200; x <= 400; x += 8) for (let z = -700; z <= -360; z += 4) {
        const actual = Math.max(-1, Math.min(3, -surfaceHeight(x, z)));
        expect(Math.abs(sample(field, x, z) - actual), `${x},${z}`).toBeLessThanOrEqual(2 / 255 + 1e-8);
        if (actual > 0.05 && actual < 2.4) shallow++;
        if (actual >= 2.5) deep++;
      }
      expect(shallow).toBeGreaterThan(100);
      expect(deep).toBeGreaterThan(1000);
      expect(field.texture.magFilter).toBe(LinearFilter);
      expect(field.texture.minFilter).toBe(LinearFilter);
    } finally { field.texture.dispose(); }
  });

  it("transitions smoothly with depth and reaches offshore pigment at the real 2.5 m shelf", () => {
    expect(pigmentWeight(0)).toBe(1);
    expect(pigmentWeight(2.5)).toBe(0);
    let previous = 1;
    for (let depth = 0; depth <= 3; depth += 0.001) {
      const value = pigmentWeight(depth);
      expect(value).toBeLessThanOrEqual(previous);
      expect(previous - value).toBeLessThan(0.001);
      previous = value;
    }
    const field = createSeaDepth();
    try {
      // Cross sample cells and the old x-based rejected shoreline segments.
      for (const z of [-570.3, -540.7, -500.1]) {
        let last = pigmentWeight(sample(field, -40, z));
        for (let x = -39.99; x <= 250; x += 0.01) {
          const value = pigmentWeight(sample(field, x, z));
          expect(Math.abs(last - value)).toBeLessThan(0.025);
          last = value;
        }
      }
      // No UV rectangle boundary: the offshore edge and its continuation are deep.
      for (let x = -600; x <= 600; x += 20) {
        // R8 depth quantization leaves less than 0.001% shallow pigment.
        expect(pigmentWeight(sample(field, x, field.bounds.y))).toBeLessThan(0.00001);
        expect(pigmentWeight(sample(field, x, field.bounds.y - 1000))).toBeLessThan(0.00001);
      }
    } finally { field.texture.dispose(); }
  });

  it("excludes the stream past the bay opening, then joins open sea only at the mouth", () => {
    const field = createSeaDepth(), length = riverLength();
    try {
      for (let t = 0.7; t < 1 - 18 / length; t += 0.005) {
        const point = riverPointAt(t);
        // Bilinear R8 coverage must stay below the shader's discard threshold.
        expect(sample(field, point.x, point.z, 1), `river ${t}`).toBeLessThan(0.01);
      }
      for (let t = 1 - 1 / length; t <= 1; t += 0.0005) {
        const point = riverPointAt(t);
        expect(sample(field, point.x, point.z, 1), `sea ${t}`).toBe(1);
      }
    } finally { field.texture.dispose(); }
  });

  it.each(["Low", "High"] as const)("owns %s depth GPU resources without frame uploads and disposes once", quality => {
    const sea = createSea(quality), material = sea.mesh.material;
    const texture = material.uniforms.uSeaDepth!.value as DataTexture;
    const dispose = vi.fn();
    texture.addEventListener("dispose", dispose);
    const version = texture.version;
    try {
      expect(material.defines.SEA_DEPTH).toBe(1);
      expect(material.fragmentShader).toContain("seaBedDepth = terrainDepth.r * 4.0 - 1.0");
      expect(material.fragmentShader).toContain("float shallows = seaShallows(seaBedDepth)");
      expect(material.fragmentShader).not.toContain("offshore * 0.09");
      sea.setTime(12); sea.setReducedMotion(true); sea.setTime(24);
      expect(texture.version).toBe(version);
      sea.dispose(); sea.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally { sea.dispose(); }
  });
});
