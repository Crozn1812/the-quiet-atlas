import type RAPIER from "@dimforge/rapier3d-compat";
import type { TerrainTile } from "./tiles";

export type TileRapier = Pick<typeof RAPIER, "ColliderDesc">;
export type TilePhysicsWorld = Pick<RAPIER.World, "createCollider" | "removeCollider">;

/** No resampling or quality-dependent simplification: the mesh reads these same heights. */
export function createTileCollider(rapier: TileRapier, world: TilePhysicsWorld, tile: TerrainTile): RAPIER.Collider {
  const { cells, heights, size, origin } = tile;
  const descriptor = rapier.ColliderDesc.heightfield(cells, cells, heights, { x: size, y: 1, z: size })
    .setTranslation(origin.x + size / 2, origin.y, origin.z + size / 2);
  return world.createCollider(descriptor);
}

/** Remove before freeing the owning Rapier world. */
export function removeTileCollider(world: TilePhysicsWorld, collider: RAPIER.Collider): void {
  world.removeCollider(collider, true);
}
