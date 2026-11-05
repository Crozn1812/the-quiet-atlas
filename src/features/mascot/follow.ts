import type { Position } from "../../state/session";

export const FOLLOW_DISTANCE = 1.2;
export const FOLLOW_HEIGHT = 1.6;
export const HOVER_AMPLITUDE = 0.08;
export const HOVER_PERIOD = 3;
export const TERRAIN_CLEARANCE = 0.3;
export const TELEPORT_DISTANCE = 6;
const SPRING_OMEGA = 8;

export interface FollowInput {
  /** Feet position, not the physics capsule centre. */
  readonly playerPosition: Readonly<Position>;
  /** Radians: zero faces -Z, positive turns toward -X (Three yaw). */
  readonly heading: number;
  readonly terrainHeight: (x: number, z: number) => number;
  readonly reducedMotion?: boolean;
  /** Set on every teleport/recovery, including jumps smaller than the safety threshold. */
  readonly teleported?: boolean;
}

export interface MascotFollowState {
  readonly position: Readonly<Position>;
  /** Spring centre, before the independent hover offset. */
  readonly anchor: Readonly<Position>;
  readonly velocity: Readonly<Position>;
  readonly playerPosition: Readonly<Position>;
  readonly phase: number;
}

function target(input: FollowInput): Position {
  const offset = FOLLOW_DISTANCE / Math.SQRT2;
  const { playerPosition: p, heading } = input;
  const x = p.x + offset * (Math.cos(heading) + Math.sin(heading));
  const z = p.z + offset * (Math.cos(heading) - Math.sin(heading));
  return { x, y: p.y + FOLLOW_HEIGHT, z };
}

function place(anchor: Position, velocity: Position, phase: number, input: FollowInput): MascotFollowState {
  const bob = input.reducedMotion ? 0 : HOVER_AMPLITUDE * Math.sin(phase * Math.PI * 2 / HOVER_PERIOD);
  const floor = input.terrainHeight(anchor.x, anchor.z) + TERRAIN_CLEARANCE;
  // Sample at the actual follower position too: the spring may lag over a ridge.
  if (anchor.y + bob < floor) {
    anchor.y = floor - bob;
    velocity.y = Math.max(0, velocity.y);
  }
  return { anchor, velocity, position: { ...anchor, y: anchor.y + bob }, phase, playerPosition: { ...input.playerPosition } };
}

export function createMascotFollowState(input: FollowInput): MascotFollowState {
  return place(target(input), { x: 0, y: 0, z: 0 }, 0, input);
}

/** Exact critically damped spring for a held target; no timers, Three, or input mutation. */
export function stepMascotFollow(state: MascotFollowState, input: FollowInput, dt: number): MascotFollowState {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Mascot dt must be finite and non-negative");
  const p = input.playerPosition, previous = state.playerPosition;
  const jumped = Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) >= TELEPORT_DISTANCE;
  if (input.teleported || jumped || input.reducedMotion) return createMascotFollowState(input);
  const goal = target(input);
  const anchor = { ...state.anchor }, velocity = { ...state.velocity };
  const decay = Math.exp(-SPRING_OMEGA * dt);
  for (const axis of ["x", "y", "z"] as const) {
    const offset = anchor[axis] - goal[axis];
    // Discard momentum pointing away after a direction change; prevent target crossing.
    const speed = velocity[axis] * offset > 0 ? 0 : velocity[axis];
    const c = speed + SPRING_OMEGA * offset;
    const next = (offset + c * dt) * decay;
    const crossed = next * offset < 0 || offset === 0;
    anchor[axis] = goal[axis] + (crossed ? 0 : next);
    velocity[axis] = crossed ? 0 : (speed - SPRING_OMEGA * c * dt) * decay;
  }
  return place(anchor, velocity, (state.phase + dt) % HOVER_PERIOD, input);
}
