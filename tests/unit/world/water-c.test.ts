import { readFileSync } from "node:fs";
import { CircleGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { COAST_BEACH_Z } from "../../../src/features/world/layout/scale";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { surfaceHeight, waterLevelAt } from "../../../src/features/world/terrain/height";
import { createWaterMaterial } from "../../../src/features/world/water/material";
import { createRibbonGeometry } from "../../../src/features/world/water/ribbon";
import { createWaterSurface } from "../../../src/features/world/water/surface";

describe("C water", () => {
  it("bakes a finite bed profile against the visible terrain without changing ribbon topology", () => {
    const geometry = createRibbonGeometry(128);
    try {
      const positions = geometry.getAttribute("position");
      const depths = geometry.getAttribute("waterBedDepth");
      expect(depths.count).toBe(positions.count);
      expect(geometry.index!.count).toBe((positions.count / 2 - 1) * 6);
      for (let i = 0; i < positions.count; i += 2) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const centre = a.clone().add(b).multiplyScalar(0.5);
        const expected = [a, centre, b].map(p => Math.max(0, p.y - surfaceHeight(p.x, p.z)));
        for (let component = 0; component < 3; component++) {
          expect(depths.getComponent(i, component)).toBeCloseTo(expected[component]!, 5);
          expect(depths.getComponent(i + 1, component)).toBe(depths.getComponent(i, component));
        }
      }
    } finally { geometry.dispose(); }
  });

  it("makes deeper water and grazing reflections more opaque while retaining fish visibility", () => {
    const material = createWaterMaterial("High");
    try {
      // Evaluate the shader functions themselves, including clamps and units.
      const source = material.fragmentShader;
      const functions = source.slice(source.indexOf("float waterAbsorption("), source.indexOf("void main()"))
        .replace(/float (waterAbsorption|waterOpacity)\(([^)]*)\)/g,
          (_, name: string, args: string) => `function ${name}(${args.replace(/float /g, "")})`);
      const sample = new Function("depth", "reflection", "exp", "max", "mix", "clamp",
        functions + "return waterOpacity(waterAbsorption(depth), reflection);");
      const opacity = (depth: number, reflection = 0) => sample(depth, reflection, Math.exp, Math.max,
        (a: number, b: number, w: number) => a + (b - a) * w,
        (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))) as number;
      let previous = opacity(0);
      for (let depth = 0.1; depth <= 8; depth += 0.1) {
        expect(opacity(depth)).toBeGreaterThan(previous);
        expect(opacity(depth, 0.8)).toBeGreaterThan(opacity(depth));
        expect(opacity(depth)).toBeLessThan(0.78);
        previous = opacity(depth);
      }
      expect(opacity(0.22)).toBeLessThan(0.35);
      expect(opacity(-1)).toBe(opacity(0));
      expect(opacity(1, 2)).toBeCloseTo(0.94);
    } finally { material.dispose(); }
  });

  it.each(["Balanced", "High"] as const)("copies the zenith grade on %s and keeps it independent of incident light", quality => {
    const material = createWaterMaterial(quality, { surface: "sea" });
    const grade = lightingAt(1);
    try {
      material.setGrade(grade);
      const top = grade.skyTop.clone();
      grade.skyTop.setRGB(0, 0, 0);
      expect(material.uniforms.uSkyTop!.value).toEqual(top);
      grade.skyTop.copy(top);
      grade.sunIntensity = grade.hemiIntensity = 0;
      material.setGrade(grade);
      expect(material.uniforms.uSkyTop!.value).toEqual(top);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(true);
    } finally { material.dispose(); }
  });

  it("gives the existing First Light pool baked depth on Low so live quality changes need no rebuild", () => {
    const geometry = new CircleGeometry(2.2, 12).rotateX(-Math.PI / 2)
      .translate(0, waterLevelAt(0) + 0.01, 0);
    const surface = createWaterSurface(geometry, createWaterMaterial("Low"));
    try {
      const depths = geometry.getAttribute("waterBedDepth");
      expect(depths.count).toBe(geometry.getAttribute("position").count);
      expect(depths.getX(0)).toBeGreaterThan(0);
      expect(surface.mesh.material.defines.C_WATER).toBeUndefined();
      expect(surface.mesh.material.uniforms.uSkyTop).toBeUndefined();
    } finally { surface.dispose(); }
  });

  it("wires sea ambience to the scaled beach instead of the old map station", () => {
    const source = readFileSync("src/features/world/index.ts", "utf8");
    expect(source).toContain('import { COAST_BEACH_Z } from "./layout/scale"');
    expect(source).toContain("Math.max(0, z - COAST_BEACH_Z)");
    expect(source).not.toContain("z + 880");
    expect(COAST_BEACH_Z).toBe(-563.2);
  });
});
