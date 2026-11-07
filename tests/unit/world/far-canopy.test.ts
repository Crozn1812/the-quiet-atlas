import { describe, expect, it } from "vitest";
import { farCanopyAt } from "../../../src/features/world/foliage/far-canopy";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { foliageBiomeAt } from "../../../src/features/world/foliage/scatter";

describe("distant dawn crown envelope", () => {
  it("covers the outer forest densely with varied, deterministic overlapping crowns", () => {
    const values: number[] = [];
    for (let x = -400; x <= 400; x += 8) for (let z = -250; z <= 100; z += 8) {
      if (foliageBiomeAt(x, z) !== "forest-dawn" || Math.abs(x) < 150) continue;
      const sample = farCanopyAt(x, z, 200, 0);
      expect(sample).toEqual(farCanopyAt(x, z, 200, 0));
      expect(sample.lift).toBeGreaterThanOrEqual(8);
      expect(sample.lift).toBeLessThanOrEqual(12);
      values.push(sample.lift);
    }
    expect(values.length).toBeGreaterThan(1000);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(3.9);
  });

  it("leaves streams, route, zone pads, cliffs and the hill boundary clear", () => {
    for (const zone of ZONES) expect(farCanopyAt(zone.position.x, zone.position.z, 200, 0).lift).toBe(0);
    for (const t of [0, 0.1, 0.2, 0.35, 0.5, 0.8, 1]) {
      const p = pathPointAt(t);
      expect(farCanopyAt(p.x, p.z, 200, 0).lift).toBe(0);
    }
    expect(farCanopyAt(200, 0, 24, 0).lift).toBe(0);
    expect(farCanopyAt(200, 0, 200, 0.95).lift).toBe(0);
    const hill = pathPointAt(0.6);
    expect(farCanopyAt(hill.x + 200, hill.z, 200, 0).lift).toBe(0);
  });

  it("fades smoothly across a 30m handover and stays below the real trees", () => {
    const values: number[] = [];
    for (let d = 44; d <= 74; d++) {
      const sample = farCanopyAt(200, 0, d, 0);
      values.push(sample.weight);
      expect(sample.lift).toBeLessThanOrEqual(12);
    }
    expect(values[0]).toBe(0);
    expect(values[30]).toBe(1);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]! - values[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(values[i]! - values[i - 1]!).toBeLessThan(0.051);
    }
  });
});
