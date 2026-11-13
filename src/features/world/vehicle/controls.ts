import { VEHICLE_LIMITS, type VehicleInput, type VehicleState } from "../../vehicle/model";

/** One S hold brakes to rest. Release and press again to reverse. E owns the
 * controls until the bike stops and the rider can safely begin stepping off. */
export function createVehicleControls() {
  let pending = false;
  let sHeld = false;
  let brakingHold = false;
  return {
    get dismountPending() { return pending; },
    requestDismount() { pending = true; },
    finishDismount() { pending = false; },
    reset() { pending = false; sHeld = false; brakingHold = false; },
    readyToDismount(state: VehicleState, transitioning: boolean) {
      return pending && !transitioning && Math.abs(state.speed) < VEHICLE_LIMITS.dismountSpeed;
    },
    input(state: VehicleState, input: VehicleInput): VehicleInput {
      if (input.s && !sHeld) brakingHold = state.speed > 0;
      if (!input.s) brakingHold = false;
      sHeld = !!input.s;
      if (pending) return { obstacleAhead: input.obstacleAhead, brake: true };
      return brakingHold ? { ...input, brake: true } : input;
    },
  };
}
