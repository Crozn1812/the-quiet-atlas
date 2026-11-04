export interface PlanarPoint {
  x: number;
  z: number;
}

/** Distances are metres; s is arc length, and tangents must be nonzero. */
export interface VehicleCorridor {
  length: number;
  halfWidthAt(s: number): number;
  pointAt(s: number): PlanarPoint;
  tangentAt(s: number): PlanarPoint;
}

export interface VehicleState {
  readonly mode: "walk" | "ride";
  readonly cruise: boolean;
  readonly s: number;
  readonly lateral: number;
  readonly speed: number;
  /** Radians, from +Z toward +X. Positive lateral is right of the tangent. */
  readonly heading: number;
}

export type CruiseCancelReason = "escape" | "c" | "ui-open" | "blur" | "brake";

export interface VehicleInput {
  w?: boolean;
  s?: boolean;
  a?: boolean;
  d?: boolean;
  escape?: boolean;
  /** A press edge, not a held key. Cancels cruise; use toggleCruise to start it. */
  c?: boolean;
  uiOpen?: boolean;
  blur?: boolean;
  /** Forward clearance in metres from the vehicle collider, sampled this frame. */
  obstacleAhead?: number;
}

export const VEHICLE_LIMITS = {
  maxForwardSpeed: 8,
  maxReverseSpeed: 1.5,
  cruiseSpeed: 5,
  acceleration: 3,
  braking: 6,
  reverseAcceleration: 2,
  coastingDeceleration: 2,
  lateralSpeed: 2,
  corridorMargin: 0.5,
  mountDistance: 2,
  dismountSpeed: 0.5,
  obstacleSlowDistance: 6,
  obstacleStopDistance: 2,
  maxFrameSeconds: 0.25,
  substepSeconds: 1 / 60,
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, change: number) =>
  value + clamp(target - value, -change, change);

function lateralLimit(corridor: VehicleCorridor, s: number): number {
  return Math.max(0, corridor.halfWidthAt(s) - VEHICLE_LIMITS.corridorMargin);
}

function tangentHeading(corridor: VehicleCorridor, s: number): number {
  const tangent = corridor.tangentAt(s);
  return Math.atan2(tangent.x, tangent.z);
}

export function initialVehicle(corridor: VehicleCorridor, s = 0, lateral = 0): VehicleState {
  s = clamp(s, 0, corridor.length);
  const limit = lateralLimit(corridor, s);
  return {
    mode: "walk", cruise: false, s, lateral: clamp(lateral, -limit, limit),
    speed: 0, heading: tangentHeading(corridor, s),
  };
}

/** Shared world-space proposal for manual and cruise; Lead resolves it through one collider. */
export function vehiclePosition(state: VehicleState, corridor: VehicleCorridor): PlanarPoint {
  const point = corridor.pointAt(state.s);
  const tangent = corridor.tangentAt(state.s);
  const magnitude = Math.hypot(tangent.x, tangent.z);
  return {
    x: point.x + tangent.z / magnitude * state.lateral,
    z: point.z - tangent.x / magnitude * state.lateral,
  };
}

export type MountResult =
  | { ok: true; state: VehicleState }
  | { ok: false; state: VehicleState; reason: "already-riding" | "too-far" };

export function mount(state: VehicleState, distanceToVehicle: number): MountResult {
  if (state.mode !== "walk") return { ok: false, state, reason: "already-riding" };
  if (!Number.isFinite(distanceToVehicle) || distanceToVehicle < 0
    || distanceToVehicle > VEHICLE_LIMITS.mountDistance) {
    return { ok: false, state, reason: "too-far" };
  }
  return { ok: true, state: { ...state, mode: "ride", cruise: false, speed: 0 } };
}

export type DismountResult =
  | { ok: true; state: VehicleState }
  | { ok: false; state: VehicleState; reason: "not-riding" | "moving" | "unsafe-ground" };

export function dismount(state: VehicleState, safeGround: boolean): DismountResult {
  if (state.mode !== "ride") return { ok: false, state, reason: "not-riding" };
  if (Math.abs(state.speed) >= VEHICLE_LIMITS.dismountSpeed) {
    return { ok: false, state, reason: "moving" };
  }
  if (!safeGround) return { ok: false, state, reason: "unsafe-ground" };
  return { ok: true, state: { ...state, mode: "walk", cruise: false, speed: 0 } };
}

export function toggleCruise(state: VehicleState): VehicleState {
  return state.mode === "ride" ? { ...state, cruise: !state.cruise } : state;
}

export function cancelCruise(state: VehicleState, reason: CruiseCancelReason): VehicleState {
  // UI/focus loss also clears velocity, so stale movement cannot resume (§6.2).
  const speed = reason === "ui-open" || reason === "blur" ? 0 : state.speed;
  return { ...state, cruise: false, speed };
}

/** Pure motion proposal. dt is seconds; long frames are capped, never replayed after blur. */
export function step(
  state: VehicleState, corridor: VehicleCorridor, dt: number, input: VehicleInput,
): VehicleState {
  let next = state;
  if (input.escape) next = cancelCruise(next, "escape");
  if (input.c) next = cancelCruise(next, "c");
  if (input.s) next = cancelCruise(next, "brake");
  if (input.uiOpen) next = cancelCruise(next, "ui-open");
  if (input.blur) next = cancelCruise(next, "blur");
  if (input.uiOpen || input.blur || next.mode !== "ride") return next;

  let distance = input.obstacleAhead ?? Infinity;
  // A malformed sensor reading is treated as blocked rather than producing NaN motion.
  if (Number.isNaN(distance)) distance = 0;
  if (next.cruise && distance < VEHICLE_LIMITS.obstacleStopDistance) {
    next = { ...next, speed: 0 };
  }
  let remaining = Number.isFinite(dt) ? clamp(dt, 0, VEHICLE_LIMITS.maxFrameSeconds) : 0;
  while (remaining > 0) {
    const h = Math.min(remaining, VEHICLE_LIMITS.substepSeconds);
    remaining = Math.max(0, remaining - h);
    let target = 0;
    let rate: number = VEHICLE_LIMITS.coastingDeceleration;
    if (next.cruise) {
      target = VEHICLE_LIMITS.cruiseSpeed * clamp(
        (distance - VEHICLE_LIMITS.obstacleStopDistance)
          / (VEHICLE_LIMITS.obstacleSlowDistance - VEHICLE_LIMITS.obstacleStopDistance), 0, 1,
      );
      rate = next.speed > target ? VEHICLE_LIMITS.braking : VEHICLE_LIMITS.acceleration;
    } else if (input.s) {
      target = next.speed > 0 ? 0 : -VEHICLE_LIMITS.maxReverseSpeed;
      rate = next.speed > 0 ? VEHICLE_LIMITS.braking : VEHICLE_LIMITS.reverseAcceleration;
    } else if (input.w) {
      target = VEHICLE_LIMITS.maxForwardSpeed;
      rate = next.speed < 0 ? VEHICLE_LIMITS.braking : VEHICLE_LIMITS.acceleration;
    }
    let speed = clamp(approach(next.speed, target, rate * h),
      -VEHICLE_LIMITS.maxReverseSpeed, VEHICLE_LIMITS.maxForwardSpeed);
    let travel = speed * h;
    if (next.cruise) {
      const clearance = Math.max(0, distance - VEHICLE_LIMITS.obstacleStopDistance);
      if (clearance === 0 || travel >= clearance) {
        travel = Math.min(Math.max(0, travel), clearance);
        speed = 0;
      }
      distance -= Math.max(0, travel);
    }
    const s = clamp(next.s + travel, 0, corridor.length);
    if ((s === 0 && speed < 0) || (s === corridor.length && speed > 0)) speed = 0;
    const limit = lateralLimit(corridor, s);
    const steering = next.cruise || speed === 0 ? 0 : Number(!!input.d) - Number(!!input.a);
    const lateral = clamp(next.lateral + steering * VEHICLE_LIMITS.lateralSpeed * h, -limit, limit);
    const heading = tangentHeading(corridor, s)
      + (steering === 0 ? 0 : Math.atan2((lateral - next.lateral) / h, Math.abs(speed)));
    next = { ...next, s, lateral, speed, heading };
  }
  return next;
}
