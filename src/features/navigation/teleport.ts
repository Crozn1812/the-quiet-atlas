import type { ZoneId } from "../interaction/targets";
import { SIGNPOSTS, arrivalPoint, type ArrivalPoint } from "./signposts";
import {
  TELEPORT_END_EVENT,
  TELEPORT_START_EVENT,
  type TeleportEndEvent,
  type TeleportStartEvent,
} from "./events";

export type TeleportState = "idle" | "choosing" | "fadingOut" | "moving" | "fadingIn";

export interface TeleportTick {
  /** Includes instantaneous moving, even when a large dt crosses several phases. */
  readonly transitions: readonly TeleportState[];
  readonly events: readonly TeleportEndEvent[];
  /** Emitted exactly once, at completion; apply before resuming locomotion. */
  readonly arrival: ArrivalPoint | null;
}

export const MIST_SECONDS = 0.6;
export const REDUCED_MOTION_SECONDS = 0.15;

/** No DOM or timers. dt is elapsed simulation time in seconds. */
export function createTeleport(options: { reducedMotion?: boolean } = {}) {
  const reducedMotion = options.reducedMotion ?? false;
  const duration = reducedMotion ? REDUCED_MOTION_SECONDS : MIST_SECONDS;
  let state: TeleportState = "idle";
  let elapsed = 0;
  let from: ZoneId | null = null;
  let to: ZoneId | null = null;
  let pendingArrival: ArrivalPoint | null = null;
  const hasSignpost = (id: ZoneId) => SIGNPOSTS.some(post => post.zoneId === id);

  return {
    get state(): TeleportState { return state; },
    // Choosing owns keyboard focus too. Only idle allows world movement.
    get inputLocked(): boolean { return state !== "idle"; },
    get effect(): "mist" | "fade" { return reducedMotion ? "fade" : "mist"; },
    get opacity(): number {
      if (state === "fadingOut") return elapsed / duration;
      if (state === "moving") return 1;
      if (state === "fadingIn") return 1 - elapsed / duration;
      return 0;
    },
    startChoosing(fromZone: ZoneId): boolean {
      if (state !== "idle" || !hasSignpost(fromZone)) return false;
      from = fromZone;
      state = "choosing";
      return true;
    },
    /** Same-zone/invalid selection is a no-op; choosing remains open. */
    choose(toZone: ZoneId): TeleportStartEvent | null {
      if (state !== "choosing" || from === null || from === toZone || !hasSignpost(toZone)) return null;
      to = toZone;
      elapsed = 0;
      state = "fadingOut";
      return { type: TELEPORT_START_EVENT, detail: { from, to } };
    },
    tick(dt: number): TeleportTick {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Teleport dt must be finite and non-negative");
      const transitions: TeleportState[] = [];
      const events: TeleportEndEvent[] = [];
      let arrival: ArrivalPoint | null = null;
      let remaining = dt;
      while (state === "fadingOut" || state === "fadingIn") {
        const step = Math.min(remaining, duration - elapsed);
        elapsed += step;
        remaining -= step;
        if (elapsed < duration) break;
        elapsed = 0;
        if (state === "fadingOut") {
          state = "moving";
          transitions.push(state);
          pendingArrival = arrivalPoint(to!);
          state = "fadingIn";
          transitions.push(state);
        } else {
          arrival = pendingArrival;
          events.push({ type: TELEPORT_END_EVENT, detail: { to: to! } });
          state = "idle";
          transitions.push(state);
          from = to = null;
          pendingArrival = null;
        }
      }
      return { transitions, events, arrival };
    },
    /** Once fading starts, finish safely rather than interrupting the journey. */
    cancel(): boolean {
      if (state !== "choosing") return false;
      state = "idle";
      from = null;
      return true;
    },
  };
}
