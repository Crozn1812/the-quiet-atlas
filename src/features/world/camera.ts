import { Vector3, type Mesh } from "three";
import type { Trees } from "./terrain";

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 16;
export const INITIAL_ZOOM = 12;
export const CAMERA_PITCH = Math.PI / 6;
export const CAMERA_CLEARANCE = 0.25;
export const CAMERA_DAMPING = 10;
export const KEY_YAW_SPEED = 1.5;
export const POINTER_YAW_SPEED = 0.005;
export const WHEEL_ZOOM_SPEED = 0.01;
export const wrapYaw = (yaw: number) => ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
export const clampZoom = (distance: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, distance));

/** Static camera/LoS colliders only: let Three reject empty local bounds before triangle traversal.
 * Existing authored bounds and custom raycast functions stay untouched. Object transforms
 * may animate; a geometry whose vertex positions change must refresh its own bounds. */
export function ensureCameraBounds(obstacles: readonly Mesh[]): void {
  for (const mesh of obstacles) if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
}

/** Retract immediately for safety; damp only extension so interpolation cannot cross a wall. */
export function springArm(previous: number, desired: number, hit: number | undefined, dt: number) {
  const safe = Math.max(0, Math.min(desired, hit === undefined ? desired : hit - CAMERA_CLEARANCE));
  return safe < previous ? safe : previous + (safe - previous) * (1 - Math.exp(-CAMERA_DAMPING * dt));
}

/** Conservative crown spheres against three character sight lines (feet, torso, head). */
export function selectOccludingCrowns(trees: Trees, camera: Vector3, player: Vector3): number[] {
  const selected: number[] = [];
  // Match Vector3.add/sub/dot/lengthSq/distanceTo operation order, including
  // sqrt and strict endpoints. Avoid temporary vectors for each tree/sight line.
  const sx = (player.x + 0) - camera.x;
  const sz = (player.z + 0) - camera.z;
  trees.forEach((tree, index) => {
    const cx = tree.x, cy = tree.y + tree.height, cz = tree.z;
    const dx = cx - camera.x, dy = cy - camera.y, dz = cz - camera.z;
    for (let line = -1; line <= 1; line++) {
      const sy = (player.y + line * 0.65) - camera.y;
      const t = (dx * sx + dy * sy + dz * sz) / (sx * sx + sy * sy + sz * sz);
      if (!(t > 0 && t < 1)) continue;
      const ex = (camera.x + sx * t) - cx;
      const ey = (camera.y + sy * t) - cy;
      const ez = (camera.z + sz * t) - cz;
      if (Math.sqrt(ex * ex + ey * ey + ez * ez) < 2.1) {
        selected.push(index);
        break;
      }
    }
  });
  return selected;
}

/** Preserve the legacy 24 m filter and slot mapping without a temporary object per tree. */
export function selectNearbyOccludingCrowns(trees: Trees, camera: Vector3, player: Vector3): number[] {
  const nearby: Trees = [];
  const slots: number[] = [];
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i]!;
    // RC18's indexed filter must keep map/filter's sparse-array behaviour.
    if (!tree) continue;
    if (Math.hypot(tree.x - camera.x, tree.z - camera.z) <= 24) {
      nearby.push(tree);
      slots.push(i);
    }
  }
  return selectOccludingCrowns(nearby, camera, player).map(index => slots[index]!);
}
