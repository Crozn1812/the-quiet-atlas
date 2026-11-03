import { Vector3 } from "three";
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

/** Retract immediately for safety; damp only extension so interpolation cannot cross a wall. */
export function springArm(previous: number, desired: number, hit: number | undefined, dt: number) {
  const safe = Math.max(0, Math.min(desired, hit === undefined ? desired : hit - CAMERA_CLEARANCE));
  return safe < previous ? safe : previous + (safe - previous) * (1 - Math.exp(-CAMERA_DAMPING * dt));
}

/** Conservative crown spheres against three character sight lines (feet, torso, head). */
export function selectOccludingCrowns(trees: Trees, camera: Vector3, player: Vector3): number[] {
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
