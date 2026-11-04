import type RAPIER from "@dimforge/rapier3d-compat";
import type { TilePhysicsWorld, TileRapier } from "../terrain/collider";

/** Mesh-only comparison mode: pool ownership still runs, without importing Rapier/WASM.
 * Actual collision in this mode uses compose's full-density raycast meshes. */
export function createMeshPhysics() {
  const descriptor = {
    setTranslation() { return this; },
    setRotation() { return this; },
  };
  return {
    RAPIER: { ColliderDesc: {
      heightfield: () => descriptor,
      cylinder: () => descriptor,
    } } as unknown as TileRapier,
    world: {
      createCollider: () => ({} as RAPIER.Collider),
      removeCollider() {},
    } satisfies TilePhysicsWorld,
  };
}
