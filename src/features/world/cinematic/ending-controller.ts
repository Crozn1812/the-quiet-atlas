import type { Vector3 } from "three";
import { ease } from "./intro";
import { createEnding, type EndingFrame, type EndingOptions } from "./ending";

export const ENDING_REDUCED_MOTION_DURATION = 0.6;
export type EndingState = "idle" | "playing" | "done";

export interface EndingControllerOptions extends EndingOptions {
  reducedMotion?: boolean;
}

/** Fresh per ending. dt is seconds; pause by not ticking, place the player on done. */
export function createEndingController({ bench, gameplayPose, reducedMotion = false }: EndingControllerOptions) {
  const ending = createEnding({ bench, gameplayPose });
  const duration = reducedMotion ? ENDING_REDUCED_MOTION_DURATION : ending.duration;
  let state: EndingState = "idle";
  let elapsed = 0;

  function currentFrame(): EndingFrame {
    if (state === "done") return ending.finalFrame();
    if (!reducedMotion) return ending.sample(elapsed);
    return { ...ending.finalFrame(), paperOpacity: 1 - ease(elapsed / duration) };
  }

  return {
    get state(): EndingState { return state; },
    get inputLocked(): boolean { return state === "playing"; },
    get elapsed(): number { return elapsed; },
    get finalPlayerPosition(): Vector3 { return ending.finalPlayerPosition; },
    duration,
    /** Idempotent: never rewind a playing/completed ending. */
    start(): EndingFrame {
      if (state === "idle") state = "playing";
      return currentFrame();
    },
    /** Works before start as well; repeated skips return fresh copies. */
    skip(): EndingFrame {
      elapsed = duration;
      state = "done";
      return currentFrame();
    },
    tick(dt: number): EndingFrame {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Ending dt must be finite and nonnegative");
      if (state === "playing") {
        elapsed = Math.min(duration, elapsed + dt);
        // Absorb floating-point accumulation at 60 Hz, just like the intro.
        if (duration - elapsed < 1e-9) {
          elapsed = duration;
          state = "done";
        }
      }
      return currentFrame();
    },
  };
}
