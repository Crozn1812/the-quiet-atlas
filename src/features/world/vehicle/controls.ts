import { VEHICLE_LIMITS, type VehicleInput, type VehicleState } from "../../vehicle/model";

/** E owns braking until the bike stops and the rider can safely step off. */
export function createVehicleControls() {
  let pending = false;
  return {
    get dismountPending() { return pending; },
    requestDismount() { pending = true; },
    finishDismount() { pending = false; },
    reset() { pending = false; },
    readyToDismount(state: VehicleState, transitioning: boolean) {
      return pending && !transitioning && Math.abs(state.speed) < VEHICLE_LIMITS.dismountSpeed;
    },
    input(input: VehicleInput): VehicleInput {
      if (pending) return { obstacleAhead: input.obstacleAhead, brake: true };
      return input;
    },
  };
}
