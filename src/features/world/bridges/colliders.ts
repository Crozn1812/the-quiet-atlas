import type RAPIER from "@dimforge/rapier3d-compat";
import {
  BRIDGE_CLEAR_WIDTH, BRIDGE_DECK_WIDTH, BRIDGE_RAIL_HEIGHT, BRIDGE_RAIL_THICKNESS,
  type BridgeProfile,
} from "./profile";

/** Absolute world coordinates; keep the visual group at the identity transform. */
export interface BridgeCollider {
  readonly bridgeIndex: number;
  readonly kind: "deck" | "left-rail" | "right-rail";
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export function createBridgeColliders(profile: BridgeProfile, bridgeIndex: number): readonly BridgeCollider[] {
  const vertices: number[] = [], indices: number[] = [];
  profile.rows.forEach(({ centre, right }, i) => {
    for (const side of [-1, 1]) vertices.push(
      centre.x + right.x * side * BRIDGE_DECK_WIDTH / 2, centre.y,
      centre.z + right.z * side * BRIDGE_DECK_WIDTH / 2,
    );
    if (i < profile.rows.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const deck: BridgeCollider = {
    bridgeIndex, kind: "deck", vertices: new Float32Array(vertices), indices: new Uint32Array(indices),
  };
  const rails = ([-1, 1] as const).map(side => {
    const vertices: number[] = [], indices: number[] = [];
    profile.rows.forEach(({ centre, right }, i) => {
      for (const offset of [BRIDGE_CLEAR_WIDTH / 2, BRIDGE_CLEAR_WIDTH / 2 + BRIDGE_RAIL_THICKNESS]) {
        for (const height of [0, BRIDGE_RAIL_HEIGHT]) vertices.push(
          centre.x + right.x * side * offset, centre.y + height, centre.z + right.z * side * offset,
        );
      }
      if (i === profile.rows.length - 1) return;
      const a = i * 4;
      // Closed barrier from deck to handrail; there are no cross-path end caps.
      for (const [u, v] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
        indices.push(a + u!, a + v!, a + u! + 4, a + v!, a + v! + 4, a + u! + 4);
      }
    });
    const end = (profile.rows.length - 1) * 4;
    indices.push(0, 2, 1, 1, 2, 3, end, end + 1, end + 2, end + 1, end + 3, end + 2);
    return {
      bridgeIndex, kind: side === -1 ? "left-rail" as const : "right-rail" as const,
      vertices: new Float32Array(vertices), indices: new Uint32Array(indices),
    };
  });
  return [deck, ...rails];
}

/** Call the returned cleanup before freeing the Rapier world. No WASM import at module load. */
export function addBridgeColliders(
  rapier: Pick<typeof RAPIER, "ColliderDesc">,
  world: Pick<RAPIER.World, "createCollider" | "removeCollider">,
  data: readonly BridgeCollider[],
): () => void {
  const colliders: RAPIER.Collider[] = [];
  try {
    for (const { vertices, indices } of data) {
      colliders.push(world.createCollider(rapier.ColliderDesc.trimesh(vertices, indices).setFriction(0.8)));
    }
  } catch (error) {
    colliders.forEach(collider => world.removeCollider(collider, true));
    throw error;
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    colliders.forEach(collider => world.removeCollider(collider, true));
  };
}
