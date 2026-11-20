import { reportBudget } from "./report-budget";
import { expect, it, vi } from "vitest";
import { Matrix4, Vector3 } from "three";
import { FOREST_ATMOSPHERE_TRANSITION } from "../../../src/features/world/art/direction";
import { forestR1Weight, createForestR1Trees } from "../../../src/features/world/foliage/forest-r1";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { PRESETS } from "../../../src/features/world/terrain";

it("covers every dawn landmark and corridor, releasing smoothly into hills on either journey direction", () => {
  for (const zone of ZONES) expect(forestR1Weight(zone.position.x, zone.position.z)).toBe(zone.biome === "forest-dawn" ? 1 : 0);
  const { start, end } = FOREST_ATMOSPHERE_TRANSITION;
  const weights = Array.from({ length: 101 }, (_, i) => {
    const p = pathPointAt(start - 0.002 + (end - start + 0.004) * i / 100);
    return forestR1Weight(p.x, p.z);
  });
  expect(weights[0]).toBe(1); expect(weights.at(-1)).toBe(0);
  weights.slice(1).forEach((weight, i) => {
    expect(weight).toBeLessThanOrEqual(weights[i]!);
    expect(Math.abs(weight - weights[i]!)).toBeLessThan(0.025);
  });
  const route = [0.23, 0.1, 0.32, 0.36, 0.4];
  const sample = (t: number) => { const p = pathPointAt(t); return forestR1Weight(p.x, p.z); };
  expect(route.map(sample)).toEqual(route.toReversed().map(sample).reverse());
});

it("keeps three instanced silhouettes deterministic across quality switches and disposes them once", () => {
  const trees = Array.from({ length: 20 }, (_, i) => ({ x: i * 9, y: 2, z: i * -5, scale: 0.8 + i / 40, lean: 0.02, kind: "broadleaf" as const }));
  const forest = createForestR1Trees(trees);
  const original = forest.meshes.map(mesh => mesh.instanceMatrix.array.slice());
  const dispose = forest.meshes.flatMap(mesh => [vi.spyOn(mesh.geometry, "dispose"), vi.spyOn(mesh.material, "dispose")]);
  try {
    for (const quality of ["Low", "High"] as const) {
      forest.setQuality(quality);
      expect(forest.meshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(Math.round(trees.length * PRESETS[quality].density));
      for (const mesh of forest.meshes) {
        reportBudget("tests/unit/world/forest-r1.test.ts:36 mesh.geometry.getAttribute(\"position\").count / 3", mesh.geometry.getAttribute("position").count / 3, 1500);
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new Matrix4(); mesh.getMatrixAt(i, matrix);
          expect(matrix.elements.every(Number.isFinite)).toBe(true);
          expect(new Vector3().setFromMatrixPosition(matrix).y).toBe(2);
        }
      }
    }
    forest.meshes.forEach((mesh, i) => expect(mesh.instanceMatrix.array).toEqual(original[i]));
  } finally { forest.dispose(); forest.dispose(); }
  dispose.forEach(spy => expect(spy).toHaveBeenCalledOnce());
});
