import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import { farMountainHeight, farRidged, limitFarSlopes } from "../../../src/features/world/scene/far-relief";
import { bakeFarHorizons } from "../../../src/features/world/scene/far-shadows";

describe("eroded remote ranges", () => {
  it("widens needle summits by lowering outliers while preserving valleys and the route", () => {
    const cells = 32, step = 8, stride = cells + 1;
    const heights = new Float32Array(stride ** 2).fill(3);
    heights[8 * stride + 8] = 160;
    heights[9 * stride + 8] = 80;
    heights[31 * stride + 8] = 70; // Resident side of x=-160 stays untouched.
    const original = heights.slice();
    const limit = limitFarSlopes(heights, cells, step, -400);
    while (!limit.next().done) { /* Drain the sliced remote-only filter. */ }
    expect(heights[31 * stride + 8]).toBe(70);
    expect(heights[8 * stride + 8]).toBeLessThanOrEqual(26);
    for (let x = 0; x < 29; x++) for (let z = 0; z < cells; z++) {
      const i = x * stride + z;
      expect(heights[i]).toBeLessThanOrEqual(original[i]!);
      expect(Math.abs(heights[i]! - heights[i + 1]!)).toBeLessThanOrEqual(step * 1.4 + 0.00001);
      expect(Math.abs(heights[i]! - heights[i + stride]!)).toBeLessThanOrEqual(step * 1.4 + 0.00001);
    }
  });
  it("separates four inland divides with valleys, without mirrored summit flanks", () => {
    for (const z of [-550, -350, -150]) {
      const profile = Array.from({ length: 201 }, (_, i) => farMountainHeight(-900 + i * 4, z));
      const summits = profile.filter((h, i) => i > 0 && i < profile.length - 1
        && h > 45 && h > profile[i - 1]! && h >= profile[i + 1]!);
      expect(summits.length).toBeGreaterThanOrEqual(4);
      expect(profile.filter(h => h < 10).length).toBeGreaterThan(8);
      const peak = profile.indexOf(Math.max(...profile));
      const asymmetry = [4, 7, 10].reduce((sum, d) => sum + Math.abs((profile[peak - d] ?? 0) - (profile[peak + d] ?? 0)), 0);
      expect(asymmetry).toBeGreaterThan(8);
      expect(Math.max(...profile)).toBeLessThan(320);
    }
    expect(farRidged(-3.2, 1.7)).toBe(farRidged(-3.2, 1.7));
  });

  it("bakes a ridge occluding the northern sun but leaves the exposed crest clear", () => {
    const cells = 16, stride = cells + 1;
    const positions = new Float32Array(stride ** 2 * 3);
    for (let x = 0; x <= cells; x++) for (let z = 0; z <= cells; z++) {
      positions.set([x * 4, z === 10 ? 12 : 0, z * 4], (x * stride + z) * 3);
    }
    const geometry = new BufferGeometry().setAttribute("position", new BufferAttribute(positions, 3));
    const bake = bakeFarHorizons(geometry, cells, 4);
    while (!bake.next().done) { /* Complete the same sliced bake as production. */ }
    const h = geometry.getAttribute("farHorizon");
    expect(h.getY(8 * stride + 6)).toBeGreaterThan(0.6);
    expect(h.getY(8 * stride + 10)).toBe(0);
    expect(h.getZ(8 * stride + 6)).toBe(0);
    geometry.dispose();
  });
});
