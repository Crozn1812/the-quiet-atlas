import { AnimationClip, CapsuleGeometry, Mesh, MeshBasicMaterial } from "three";
import { HALF_HEIGHT, RADIUS } from "../scene";
import { createCharacter, type Character } from "./runtime";

let warned = false;

/** Same geometry and orange as the original world player, with the same runtime API. */
export function createFallbackCharacter(error?: unknown): Character {
  if (!warned) {
    warned = true;
    console.warn("Character unavailable; using capsule fallback.", error);
  }
  const root = new Mesh(
    new CapsuleGeometry(RADIUS, HALF_HEIGHT * 2),
    new MeshBasicMaterial({ color: 0xcc754e }),
  );
  root.castShadow = true;
  return createCharacter(root, [
    new AnimationClip("Idle", 4, []),
    new AnimationClip("Walk", 1, []),
    new AnimationClip("Run", 0.7, []),
  ]);
}
