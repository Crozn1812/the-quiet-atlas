import { Group, type Material } from "three";
import { createTileCollider, removeTileCollider, type TilePhysicsWorld, type TileRapier } from "./collider";
import { createTileMesh } from "./mesh";
import { tilesToLoad, tilesToUnload } from "./streaming";
import { buildTile, tileKey, type TileAddress, type TerrainTile } from "./tiles";

export interface ResidentTile<M extends Material = Material> extends TileAddress {
  readonly tile: TerrainTile;
  readonly mesh: ReturnType<typeof createTileMesh<M>>;
  readonly collider: ReturnType<typeof createTileCollider>;
}

/** Owns resident geometry/colliders; the caller owns the shared material and physics world. */
export function createTilePool<M extends Material>({ RAPIER, world, material }: {
  RAPIER: TileRapier;
  world: TilePhysicsWorld;
  material: M;
}) {
  const group = new Group();
  const residents = new Map<string, ResidentTile<M>>();
  let disposed = false;
  const unload = (key: string) => {
    const resident = residents.get(key);
    if (!resident) return;
    removeTileCollider(world, resident.collider);
    resident.mesh.removeFromParent();
    resident.mesh.geometry.dispose();
    residents.delete(key);
  };

  return {
    group,
    get tiles(): ReadonlyMap<string, ResidentTile<M>> { return residents; },
    update(playerT: number, aheadM = 120, behindM = 60): void {
      if (disposed) throw new Error("Cannot update a disposed terrain tile pool");
      const desired = tilesToLoad(playerT, aheadM, behindM);
      const obsolete = tilesToUnload(playerT, residents.values(), aheadM, behindM);
      for (const address of desired) {
        const key = tileKey(address.ix, address.iz);
        if (residents.has(key)) continue;
        const tile = buildTile(address.ix, address.iz);
        const mesh = createTileMesh(tile, material);
        let collider: ReturnType<typeof createTileCollider>;
        try {
          collider = createTileCollider(RAPIER, world, tile);
        } catch (error) {
          mesh.geometry.dispose();
          throw error;
        }
        residents.set(key, { ...address, tile, mesh, collider });
        group.add(mesh);
      }
      // Load first so a failed addition leaves the previous walking surface available.
      for (const address of obsolete) unload(tileKey(address.ix, address.iz));
    },
    dispose(): void {
      if (disposed) return;
      for (const key of residents.keys()) unload(key);
      group.removeFromParent();
      disposed = true;
    },
  };
}
