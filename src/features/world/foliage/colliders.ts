import type { FoliageTree } from "./scatter";

export const TRUNK_RADIUS = 0.28;
export const TRUNK_HEIGHT = 5;

/** Plain Rapier-ready cylinder data; quality never enters this function. */
export function createFoliageColliders(trees: readonly FoliageTree[]) {
  return trees.map(tree => {
    const halfHeight = TRUNK_HEIGHT * tree.scale / 2;
    return {
      x: tree.x - Math.sin(tree.lean) * halfHeight,
      y: tree.y + Math.cos(tree.lean) * halfHeight,
      z: tree.z,
      radius: TRUNK_RADIUS,
      halfHeight,
      rotation: { x: 0, y: 0, z: Math.sin(tree.lean / 2), w: Math.cos(tree.lean / 2) },
    };
  });
}
