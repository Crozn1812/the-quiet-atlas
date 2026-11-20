import type { PlanarPoint, VehicleState } from "../../vehicle/model";
import type { Controller } from "../scene";

/** A grounded bike at rest holds its contact position, including on slopes.
 * Running the walking capsule with zero horizontal input still lets gravity
 * and contact correction push it downhill. Resume collision movement as soon
 * as the model requests travel; airborne bikes must continue to settle. */
export function stepVehicleController(
  controller: Controller, previous: VehicleState, proposal: VehicleState,
  target: PlanarPoint, dt: number,
) {
  if (controller.grounded && proposal.speed === 0
    && proposal.x === previous.x && proposal.z === previous.z) {
    controller.resetVelocity();
    return;
  }
  controller.step((target.x - controller.position.x) / dt,
    (target.z - controller.position.z) / dt, dt);
}
