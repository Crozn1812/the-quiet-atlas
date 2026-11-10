import { expect, it } from "vitest";
import { Vector3 } from "three";
import { selectNearbyOccludingCrowns, selectOccludingCrowns } from "../../../src/features/world/camera";
import type { Trees } from "../../../src/features/world/terrain";

// Independent copy of the pre-RC21 algorithm: do not use the production selector
// as an oracle for its replacement, particularly at strict numeric boundaries.
function legacySelector(trees: Trees, camera: Vector3, player: Vector3) {
  const selected: number[] = [];
  trees.forEach((tree, index) => {
    const center = new Vector3(tree.x, tree.y + tree.height, tree.z);
    const blocked = [-0.65, 0, 0.65].some(offset => {
      const end = player.clone().add(new Vector3(0, offset, 0));
      const segment = end.sub(camera);
      const t = center.clone().sub(camera).dot(segment) / segment.lengthSq();
      return t > 0 && t < 1 && camera.clone().addScaledVector(segment, t).distanceTo(center) < 2.1;
    });
    if (blocked) selected.push(index);
  });
  return selected;
}

function legacy(trees: Trees, camera: Vector3, player: Vector3) {
  const nearby = trees.map((tree, id) => ({ tree, id }))
    .filter(({ tree }) => Math.hypot(tree.x - camera.x, tree.z - camera.z) <= 24);
  return legacySelector(nearby.map(({ tree }) => tree), camera, player)
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

it("matches the independent vector oracle for seeded positions and leaves inputs untouched", () => {
  let seed = 0x21ca4e;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  let hits = 0;
  for (let sample = 0; sample < 300; sample++) {
    const scale = [0.001, 1, 1000][sample % 3]!;
    const camera = new Vector3(...Array.from({ length: 3 }, () => (random() - 0.5) * 80 * scale) as [number, number, number]);
    const player = camera.clone().add(new Vector3((random() - 0.5) * 32, (random() - 0.5) * 12, (random() - 0.5) * 32));
    const trees: Trees = Array.from({ length: 64 }, () => ({
      x: camera.x + (random() - 0.5) * 48,
      y: camera.y + (random() - 0.5) * 20,
      z: camera.z + (random() - 0.5) * 48,
      height: random() * 18, radius: 0.28,
    }));
    const before = { camera: camera.clone(), player: player.clone(), trees: structuredClone(trees) };
    const expected = legacySelector(trees, camera, player);
    hits += expected.length;
    expect(selectOccludingCrowns(trees, camera, player)).toEqual(expected);
    expect(selectNearbyOccludingCrowns(trees, camera, player)).toEqual(legacy(trees, camera, player));
    expect(camera).toEqual(before.camera);
    expect(player).toEqual(before.player);
    expect(trees).toEqual(before.trees);
  }
  expect(hits).toBeGreaterThan(0);
});

it("preserves strict radius/endpoints, zero-length lines, non-finite values and sparse slots", () => {
  const tree = (x: number, y: number, z: number) => ({ x, y, z, height: 0, radius: 0.28 });
  const trees: Trees = [
    ...[2.1 - 1e-12, 2.1, 2.1 + 1e-12].map(x => tree(x, 4, 5)),
    ...[-1e-12, 0, 1e-12, 10 - 1e-12, 10, 10 + 1e-12].map(z => tree(0, 4, z)),
    tree(0, 3.35, 5), tree(0, 4.65, 5), tree(NaN, 4, 5), tree(Infinity, 4, 5),
  ];
  const sparse = trees.slice();
  delete sparse[1];
  for (const view of [[], trees, trees.slice().reverse(), sparse]) {
    for (const [camera, player] of [
      [new Vector3(0, 4, 0), new Vector3(0, 4, 10)],
      [new Vector3(0, 4, 0), new Vector3(0, 4, 0)],
      [new Vector3(0, 4, 0), new Vector3(0, 4.65, 0)],
      [new Vector3(NaN, 4, 0), new Vector3(0, 4, 10)],
      [new Vector3(0, 4, 0), new Vector3(Infinity, 4, 10)],
    ]) {
      expect(selectOccludingCrowns(view, camera!, player!)).toEqual(legacySelector(view, camera!, player!));
      expect(selectNearbyOccludingCrowns(view, camera!, player!)).toEqual(legacy(view, camera!, player!));
    }
  }
  // In this orientation the other two sight lines are farther away: the exact
  // 2.1 m sphere boundary stays excluded, while the immediately inner one hits.
  expect(selectOccludingCrowns(trees.slice(0, 3), new Vector3(0, 4, 0), new Vector3(0, 4, 10))).toEqual([0]);
});
