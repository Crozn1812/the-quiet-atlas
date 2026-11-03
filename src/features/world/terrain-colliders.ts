import RAPIER from "@dimforge/rapier3d-compat";
import type { Terrain, Trees } from "./terrain";
export function addTerrainColliders(world: RAPIER.World, terrain: Terrain, trees: Trees) {
  const ground = world.createCollider(RAPIER.ColliderDesc.heightfield(terrain.cells, terrain.cells, terrain.heights, { x: terrain.size, y: 1, z: terrain.size }));
  for (const tree of trees) world.createCollider(RAPIER.ColliderDesc.cylinder(tree.height / 2, tree.radius).setTranslation(tree.x, tree.y + tree.height / 2, tree.z));
  return ground;
}
