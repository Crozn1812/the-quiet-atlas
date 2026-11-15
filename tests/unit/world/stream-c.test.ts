import { BufferGeometry, Float32BufferAttribute, RGFormat, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { riverLength, riverTangentAt } from "../../../src/features/world/layout/river";
import { bakeStreamOptics, STREAM_DEPTH_COLUMNS } from "../../../src/features/world/water/depth";
import { createWaterMaterial, FLOW_NORMAL_SIZE } from "../../../src/features/world/water/material";
import { createRiverRibbon, RIBBON_CROSS_SEGMENTS, RIBBON_SEGMENTS } from "../../../src/features/world/water/ribbon";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

describe("STREAM-C", () => {
  it("bakes a signed, filterable depth map without changing the water plane", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([-2, 1, 0, 2, 1, 0, -2, 1, -1, 2, 1, -1], 3));
    geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    const original = Array.from(geometry.getAttribute("position").array);
    const height = vi.fn((x: number) => Math.abs(x));
    const { texture, banks } = bakeStreamOptics(geometry, height);
    try {
      expect(texture.image.width).toBe(STREAM_DEPTH_COLUMNS);
      const data = texture.image.data!;
      expect(data[0]! / 255 * 4 - 1).toBeCloseTo(-1, 1);
      expect(data[32]! / 255 * 4 - 1).toBeCloseTo(1, 1);
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(original);
      const positions = banks.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect(positions.getY(i)).toBeCloseTo(Math.abs(positions.getX(i)) + 0.012, 5);
      }
    } finally { geometry.dispose(); texture.dispose(); banks.dispose(); }
  });

  it("refines the ribbon across the channel, adds one wet-bank draw, and bakes bend-aligned flow", () => {
    const river = createRiverRibbon("High");
    try {
      const geometry = river.mesh.geometry;
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.getAttribute("position").count).toBe((RIBBON_SEGMENTS + 1) * (RIBBON_CROSS_SEGMENTS + 1));
      expect(geometry.index!.count).toBe(RIBBON_SEGMENTS * RIBBON_CROSS_SEGMENTS * 6);
      expect(river.mesh.children).toHaveLength(1);
      expect(river.mesh.children[0]!.name).toBe("stream-wet-banks");
      const tangent = geometry.getAttribute("waterTangent"), uv = geometry.getAttribute("uv");
      for (let i = 0; i < tangent.count; i += 67) {
        const expected = riverTangentAt(uv.getY(i) / riverLength());
        expect(new Vector3().fromBufferAttribute(tangent, i).distanceTo(expected)).toBeLessThan(0.00001);
      }
    } finally { river.dispose(); }
  });

  it.each(["Balanced", "High"] as const)("uses bounded sky Fresnel and releases the %s normal map once", quality => {
    const material = createWaterMaterial(quality);
    const texture = material.uniforms.uFlowNormal!.value;
    try {
      const source = material.fragmentShader;
      const expression = source.match(/reflection = \(0\.02[^;]+;/)![0].replace("reflection =", "return");
      const sample = new Function("grazing", "SKY_REFLECTION", "pow", expression);
      const reflection = (grazing: number) => sample(grazing, material.defines.SKY_REFLECTION, Math.pow) as number;
      expect(reflection(0)).toBeCloseTo(0.0144);
      expect(reflection(0.95)).toBeGreaterThan(0.55);
      expect(reflection(0.95)).toBeGreaterThan(reflection(0.3) * 20);
      expect(reflection(1)).toBeLessThanOrEqual(0.72);
      expect(texture.format).toBe(RGFormat);
      expect(texture.image.data.byteLength).toBe(FLOW_NORMAL_SIZE * FLOW_NORMAL_SIZE * 2);
      expect(new Set(texture.image.data).size).toBeGreaterThan(100);
      const disposed = vi.fn();
      texture.addEventListener("dispose", disposed);
      material.dispose(); material.dispose();
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally { material.dispose(); }
  });

  it("rebinds the baked depth after a live quality change and releases it once", () => {
    const river = createRiverRibbon("Low");
    const replacement = createWaterMaterial("High");
    try {
      Reflect.apply(river.mesh.onBeforeRender, river.mesh, []);
      const texture = river.mesh.material.uniforms.uStreamDepth!.value;
      expect(texture.image.data.byteLength).toBe(65 * 1025);
      expect(texture.image.data.byteLength).toBeLessThan(300_000);
      const disposed = vi.fn();
      texture.addEventListener("dispose", disposed);
      river.mesh.material = replacement;
      Reflect.apply(river.mesh.onBeforeRender, river.mesh, []);
      expect(replacement.uniforms.uStreamDepth!.value).toBe(texture);
      expect(replacement.uniforms.uHasStreamDepth!.value).toBe(1);
      river.dispose(); river.dispose();
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally { river.dispose(); replacement.dispose(); }
  });

  it("fades water to zero before terrain clipping and fades both ends of the draped wet margin", () => {
    const material = createWaterMaterial("Low");
    try {
      expect(material.defines.WATER_REFLECTION).toBeUndefined();
      expect(material.defines.WATER_RIPPLES).toBeUndefined();
      expect(material.defines.RIVER_DEPTH).toBe(1);
      expect(material.uniforms.uFlowNormal).toBeUndefined();
      const source = material.fragmentShader;
      const coverageBody = source.match(/float waterCoverage = ([^;]+);/)![1];
      const marginBody = source.match(/opacity = (0\.24[^;]+);/)![1];
      const evaluate = new Function("bedDepth", "smoothstep", `const waterCoverage = ${coverageBody};
        return { coverage: waterCoverage, wet: ${marginBody} };`);
      const sample = (depth: number) => evaluate(depth, smoothstep) as { coverage: number; wet: number };
      expect(sample(-0.25)).toEqual({ coverage: 0, wet: 0 });
      expect(sample(-0.05).wet).toBeGreaterThan(0.2);
      expect(sample(0).coverage).toBe(0);
      expect(sample(0.02).coverage).toBe(0);
      expect(sample(0.3).wet).toBe(0);
      expect(sample(0.1).coverage).toBeGreaterThan(0);
      expect(sample(0.1).coverage).toBeLessThan(0.3);
      expect(sample(0.5).coverage).toBe(1);
      let previous = 0;
      for (let depth = -0.25; depth <= 0.6; depth += 0.005) {
        const { coverage, wet } = sample(depth);
        expect(coverage).toBeGreaterThanOrEqual(previous);
        expect(coverage - previous).toBeLessThan(0.026);
        expect(wet).toBeGreaterThanOrEqual(0);
        expect(wet).toBeLessThanOrEqual(0.3);
        previous = coverage;
      }
    } finally { material.dispose(); }
  });
});
