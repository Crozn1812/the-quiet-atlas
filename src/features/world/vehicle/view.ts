import { Group } from "three";
import { VEHICLE_TRANSITION_SECONDS, vehiclePosition, type VehicleState } from "../../vehicle/model";
import { createGd110, disposeGd110, GD110_WHEEL_RADIUS, GD110_WHEELBASE } from "./mesh";
import { vehicleAnimationDelta } from "./transition";
import { installHrVehicle } from "./hr-runtime";
import { createKickstand } from "./kickstand";

export const MAX_VEHICLE_LEAN = 12 * Math.PI / 180;
export const PARKED_VEHICLE_LEAN = 9 * Math.PI / 180;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export interface VehicleViewOptions {
  surfaceHeight(x: number, z: number): number;
  reducedMotion?: boolean;
}

/** The caller owns motion/collision state. This view never advances simulation.
 * The bike remains parked and visible in walk mode; update with the vehicle's
 * state, not the walking player's coordinates. dt is seconds.
 */
export function createVehicleView({ surfaceHeight, reducedMotion = false }: VehicleViewOptions) {
  const group = new Group();
  group.name = "vehicle_view";
  const bike = createGd110();
  group.add(bike);
  const standPivot = createKickstand();
  bike.add(standPivot);
  let standFold = 0;
  let transitionSeconds = 0;
  const wheels = [bike.getObjectByName("rear_wheel")!, bike.getObjectByName("front_wheel")!];
  const steering = bike.getObjectByName("steering")!;
  let previous: { state: VehicleState } | undefined;
  let lean = 0;
  let disposed = false;
  const appearance = installHrVehicle(bike, () => transitionSeconds < VEHICLE_TRANSITION_SECONDS);

  return {
    group,
    /** Attach the rider pose to this frame so banking keeps all contacts aligned. */
    riderFrame: bike,
    setReducedMotion(reduced: boolean): void {
      if (disposed) return;
      reducedMotion = reduced;
      if (reduced) {
        lean = 0;
        bike.rotation.z = previous?.state.mode === "walk" ? PARKED_VEHICLE_LEAN : 0;
      }
    },
    update(state: VehicleState, dt: number): void {
      if (disposed) return;
      const position = vehiclePosition(state);
      group.position.set(position.x, surfaceHeight(position.x, position.z), position.z);
      group.rotation.y = state.heading;
      const secondsForTurn = Number.isFinite(dt) && dt > 0 ? dt : 0;
      const yawRate = previous && secondsForTurn > 0
        ? angleDelta(state.heading, previous.state.heading) / secondsForTurn : 0;
      const steer = state.mode === "ride" && Math.abs(state.speed) > .01
        ? clamp(Math.atan(yawRate * GD110_WHEELBASE / state.speed), -.32, .32) : 0;
      steering.rotation.y = steer;
      if (previous) {
        const dx = state.x - previous.state.x, dz = state.z - previous.state.z;
        const direction = Math.sign(dx * Math.sin(state.heading) + dz * Math.cos(state.heading));
        const distance = direction * Math.hypot(dx, dz);
        for (const wheel of wheels) wheel.rotation.x += distance / GD110_WHEEL_RADIUS;
      }
      const target = !reducedMotion && state.mode === "ride"
        ? clamp(-Math.atan(state.speed * yawRate / 9.81), -MAX_VEHICLE_LEAN, MAX_VEHICLE_LEAN) : 0;
      const seconds = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;
      if (!previous) transitionSeconds = VEHICLE_TRANSITION_SECONDS;
      else if (previous.state.mode !== state.mode) transitionSeconds = 0;
      transitionSeconds += vehicleAnimationDelta(dt, true);
      const phase = transitionSeconds / VEHICLE_TRANSITION_SECONDS;
      // Mount: settle onto the seat before kicking up. Dismount: park first.
      const standTarget = state.mode === "ride" ? clamp((phase - .8) / .2, 0, 1) : 1 - clamp(phase / .25, 0, 1);
      standFold = reducedMotion ? Number(state.mode === "ride") : previous ? standTarget : Number(state.mode === "ride");
      standPivot.rotation.x = standFold * 1.5;
      standPivot.rotation.z = .65 * standFold;
      lean = reducedMotion ? 0 : lean + (target - lean) * (1 - Math.exp(-8 * seconds));
      if (target === 0 && Math.abs(lean) < 1e-6) lean = 0;
      bike.rotation.z = lean + PARKED_VEHICLE_LEAN * (1 - standFold);
      // Rotate about the tyre contact, keeping both rounded tyres on the floor.
      bike.position.y = GD110_WHEEL_RADIUS * (1 - Math.cos(bike.rotation.z));
      previous = { state: { ...state } };
      appearance.update();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      previous = undefined;
      appearance.dispose();
      disposeGd110(bike);
      group.removeFromParent();
      group.clear();
    },
  };
}
