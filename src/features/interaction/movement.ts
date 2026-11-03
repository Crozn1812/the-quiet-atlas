export const WALK_SPEED = 3;
export const RUN_SPEED = 5;

/** Three camera yaw: zero looks toward -Z, positive turns toward -X. */
export function inputToMoveVector(keys: ReadonlySet<string>, cameraYaw: number, running: boolean) {
  const x = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const z = Number(keys.has("KeyS")) - Number(keys.has("KeyW"));
  const scale = (running ? RUN_SPEED : WALK_SPEED) / (Math.hypot(x, z) || 1);
  return {
    x: (x * Math.cos(cameraYaw) + z * Math.sin(cameraYaw)) * scale,
    z: (-x * Math.sin(cameraYaw) + z * Math.cos(cameraYaw)) * scale,
  };
}
