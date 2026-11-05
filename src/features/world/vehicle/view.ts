import { Group } from "three";
import { vehiclePosition, type VehicleCorridor, type VehicleState } from "../../vehicle/model";
import { createGd110, disposeGd110, GD110_WHEEL_RADIUS } from "./mesh";

export const MAX_VEHICLE_LEAN = 12 * Math.PI / 180;
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
  const wheels = [bike.getObjectByName("rear_wheel")!, bike.getObjectByName("front_wheel")!];
  let previous: { state: VehicleState; corridor: VehicleCorridor } | undefined;
  let lean = 0;
  let disposed = false;

  return {
    group,
    setReducedMotion(reduced: boolean): void {
      if (disposed) return;
      reducedMotion = reduced;
      if (reduced) bike.rotation.z = lean = 0;
    },
    update(state: VehicleState, corridor: VehicleCorridor, dt: number): void {
      if (disposed) return;
      const position = vehiclePosition(state, corridor);
      const tangent = corridor.tangentAt(state.s);
      const heading = Math.atan2(tangent.x, tangent.z);
      group.position.set(position.x, surfaceHeight(position.x, position.z), position.z);
      group.rotation.y = heading;

      // Realized corridor travel, rather than speed * dt: stopped/clamped states
      // do not spin, and reverse rolls the wheels backwards. A new corridor or
      // first sample establishes an anchor rather than inventing prior travel.
      if (previous?.corridor === corridor) {
        const deltaS = state.s - previous.state.s;
        const deltaLateral = state.lateral - previous.state.lateral;
        const distance = Math.sign(deltaS) * Math.hypot(deltaS, deltaLateral);
        for (const wheel of wheels) wheel.rotation.x += distance / GD110_WHEEL_RADIUS;
      }

      // Estimate local curvature spatially: stable at dt=0 and across heading
      // wraparound; speed^2 / gravity gives a gentle physically directed bank.
      const from = Math.max(0, state.s - .5), to = Math.min(corridor.length, state.s + .5);
      let target = 0;
      if (!reducedMotion && state.mode === "ride" && to > from) {
        const a = corridor.tangentAt(from), b = corridor.tangentAt(to);
        const curvature = angleDelta(Math.atan2(b.x, b.z), Math.atan2(a.x, a.z)) / (to - from);
        target = clamp(-Math.atan(state.speed * state.speed * curvature / 9.81), -MAX_VEHICLE_LEAN, MAX_VEHICLE_LEAN);
      }
      const seconds = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;
      lean = reducedMotion ? 0 : lean + (target - lean) * (1 - Math.exp(-8 * seconds));
      if (target === 0 && Math.abs(lean) < 1e-6) lean = 0;
      bike.rotation.z = lean;
      previous = { state: { ...state }, corridor };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      previous = undefined;
      disposeGd110(bike);
      group.removeFromParent();
      group.clear();
    },
  };
}
