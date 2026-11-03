import { canSimulate, sessionReducer, type SessionState } from "../../state/session";
import { inputToMoveVector } from "../interaction/movement";
import type { Controller } from "./scene";

export const FALL_Y = -10;
export const STUCK_SECONDS = 3;
export const MIN_PROGRESS = 0.1;
export const SAFE_SECONDS = 0.5;

/** Only simulation time counts; pause cannot accumulate a stuck timeout. */
export function createLocomotion(physics: Controller) {
  let stuck = 0;
  let stable = 0;
  const anchor = physics.position.clone();
  function reset() {
    stuck = 0;
    stable = 0;
    anchor.copy(physics.position);
    physics.resetVelocity();
  }
  function recover(state: SessionState) {
    const next = sessionReducer(state, { type: "recover" });
    physics.teleport(next.position);
    reset();
    return next;
  }
  return {
    reset,
    recover,
    step(state: SessionState, keys: ReadonlySet<string>, yaw: number, dt: number) {
      if (!canSimulate(state)) {
        reset();
        return state;
      }
      const move = inputToMoveVector(keys, yaw, keys.has("ShiftLeft") || keys.has("ShiftRight"));
      const before = physics.position.clone();
      physics.step(move.x, move.z, dt);
      const progress = Math.hypot(physics.position.x - anchor.x, physics.position.z - anchor.z);
      if (!Math.hypot(move.x, move.z) || progress >= MIN_PROGRESS) {
        stuck = 0;
        anchor.copy(physics.position);
      } else {
        stuck += dt;
      }
      if (physics.position.y < FALL_Y || stuck >= STUCK_SECONDS) return recover(state);
      state = { ...state, position: { x: physics.position.x, y: physics.position.y, z: physics.position.z } };
      // Do not promote a blocked position to a recovery point.
      stable = physics.grounded && (!Math.hypot(move.x, move.z) || physics.position.distanceTo(before) >= 0.01) ? stable + dt : 0;
      if (stable >= SAFE_SECONDS) {
        return sessionReducer(state, { type: "safePosition", position: physics.position });
      }
      return state;
    },
  };
}
