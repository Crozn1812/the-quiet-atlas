import { expect, it } from "vitest";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { nearestPath, nearestRiver, PATH_SAMPLES, segmentFraction } from "../../../src/features/world/terrain/samples";

it("optimized path/river queries equal exhaustive segment projection", () => {
  const river = Array.from({ length: 2049 }, (_, i) => ({ ...riverPointAt(i / 2048), t: i / 2048 }));
  for (const [points, query] of [[PATH_SAMPLES, nearestPath], [river, nearestRiver]] as const) {
    for (let sample = 0; sample < 120; sample++) {
      const x = (sample * 73.13 % 2048) - 1024, z = (sample * 131.17 % 2048) - 1600;
      let squared = Infinity, expected = { ...points[0]!, distance: Infinity };
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!, b = points[i + 1]!, u = segmentFraction(x, z, a, b);
        const px = a.x + (b.x - a.x) * u, pz = a.z + (b.z - a.z) * u;
        const candidate = (x - px) ** 2 + (z - pz) ** 2;
        if (candidate < squared) { squared = candidate; expected = { x: px, z: pz, t: a.t + (b.t - a.t) * u, distance: Math.sqrt(candidate) }; }
      }
      const actual = query(x, z);
      expect(actual).toEqual({ x: expected.x, z: expected.z, t: expected.t, distance: expected.distance });
    }
  }
});
