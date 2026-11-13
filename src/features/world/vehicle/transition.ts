import { VEHICLE_TRANSITION_SECONDS } from "../../vehicle/model";

/** Visual time only: a slow frame may finish the pose, without a physics backlog.
 * Sample every frame, including pauses, so resuming never catches up paused time.
 */
export function vehicleAnimationDelta(elapsed: number, active: boolean): number {
  return active && Number.isFinite(elapsed)
    ? Math.max(0, Math.min(elapsed, VEHICLE_TRANSITION_SECONDS)) : 0;
}
