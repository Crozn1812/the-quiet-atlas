import { Color } from "three";
import { expect, it } from "vitest";
import { FOREST_ATMOSPHERE_TRANSITION, forestAtmosphereWeight } from "../../../src/features/world/art/direction";
import { createForestR1Trees } from "../../../src/features/world/foliage/forest-r1";
import { HILL_R1_TRANSITION, hillR1Weight } from "../../../src/features/world/foliage/hill-r1";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";

it("covers both hill landmarks, preserves forest/coast and gives a continuous R1 handover", () => {
  for (const zone of ZONES) expect(hillR1Weight(zone.t)).toBe(zone.biome === "hill" ? 1 : 0);
  expect((HILL_R1_TRANSITION.end - HILL_R1_TRANSITION.start) * pathLength()).toBeCloseTo(40);
  for (let i = 0; i <= 100; i++) {
    const t = FOREST_ATMOSPHERE_TRANSITION.start + i / 100
      * (FOREST_ATMOSPHERE_TRANSITION.end - FOREST_ATMOSPHERE_TRANSITION.start);
    expect(forestAtmosphereWeight(t) + hillR1Weight(t)).toBeCloseTo(1);
  }
  const { start, end } = HILL_R1_TRANSITION;
  const weights = Array.from({ length: 101 }, (_, i) => hillR1Weight(start + (end - start) * i / 100));
  expect(weights[0]).toBe(1); expect(weights.at(-1)).toBe(0);
  weights.slice(1).forEach((w, i) => {
    expect(w).toBeLessThanOrEqual(weights[i]!);
    expect(weights[i]! - w).toBeLessThan(0.016);
  });
  const route = [0.1, 0.5, 0.76, 0.8, 0.82, 0.93];
  expect(route.map(hillR1Weight)).toEqual(route.toReversed().map(hillR1Weight).reverse());
  for (const t of [NaN, Infinity, -Infinity, -1, 0.82, 0.9, 1]) expect(hillR1Weight(t)).toBe(0);
});

it("warms hill instances without adding draws or changing dawn instances across quality rebuilds", () => {
  const trees = [0.14, 0.5, 0.76, 0.89].map(t => {
    const p = pathPointAt(t);
    return { x: p.x, z: p.z, y: p.y, scale: 1, lean: 0, kind: "broadleaf" as const };
  });
  const batch = createForestR1Trees(trees);
  const white = new Color(1, 1, 1), tint = new Color();
  try {
    expect(batch.meshes).toHaveLength(3);
    for (const quality of ["Low", "High"] as const) {
      batch.setQuality(quality);
      for (const mesh of batch.meshes) for (let i = 0; i < mesh.count; i++) {
        mesh.getColorAt(i, tint);
        expect(tint.toArray().every(Number.isFinite)).toBe(true);
        const z = mesh.instanceMatrix.array[i * 16 + 14]!;
        const tree = trees.find(tree => Math.abs(tree.z - z) < 0.001)!;
        if (hillR1Weight(ZONES.find(zone => Math.abs(zone.position.z - tree.z) < 0.001)!.t) === 0) {
          expect(tint).toEqual(white);
        } else {
          expect(tint.equals(white)).toBe(false);
        }
      }
    }
  } finally { batch.dispose(); }
});
