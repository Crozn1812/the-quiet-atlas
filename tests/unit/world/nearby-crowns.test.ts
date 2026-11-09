import { expect, it } from "vitest";
import { Vector3 } from "three";
import { selectNearbyOccludingCrowns, selectOccludingCrowns } from "../../../src/features/world/camera";
import type { Trees } from "../../../src/features/world/terrain";

function legacy(trees: Trees, camera: Vector3, player: Vector3) {
  const nearby = trees.map((tree, id) => ({ tree, id }))
    .filter(({ tree }) => Math.hypot(tree.x - camera.x, tree.z - camera.z) <= 24);
  return selectOccludingCrowns(nearby.map(({ tree }) => tree), camera, player)
    .map(id => nearby[id]!.id);
}

it("preserves visible slot indices through quality counts, reordering, and the exact 24 m boundary", () => {
  const trees = Array.from({ length: 180 }, (_, i) => ({
    x: Math.sin(i * 17.3) * 48, z: Math.cos(i * 7.1) * 48,
    y: (i % 5) * 0.2, height: 3 + i % 8, radius: 0.28,
  }));
  trees.unshift(...[24, 24 + 1e-10, 24 - 1e-10, 40, 5].map(z => ({ x: 0, y: 0, z, height: 4, radius: 0.28 })));
  let selected = 0;
  for (const count of [0, 1, 3, 20, trees.length, 7, trees.length]) {
    for (const view of [trees.slice(0, count), trees.slice(0, count).reverse()]) {
      for (const x of [0, -12, 12]) for (const y of [4, 7]) for (const z of [0, 12, -12]) {
        const camera = new Vector3(x, y, z);
        const player = new Vector3(x + 0.3, y, z + 12);
        const expected = legacy(view, camera, player);
        expect(selectNearbyOccludingCrowns(view, camera, player)).toEqual(expected);
        selected += expected.length;
      }
    }
  }
  expect(selected).toBeGreaterThan(0);
  expect(selectNearbyOccludingCrowns(trees, new Vector3(0, 4, 0), new Vector3(0, 4, 30))).toEqual([0, 2, 4]);
});
