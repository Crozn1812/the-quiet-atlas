import { createIntro, ease, type CameraPose, type IntroFrame } from "./intro";

export const REDUCED_MOTION_DURATION = 0.4;
export type IntroState = "idle" | "playing" | "done";

export interface IntroControllerOptions {
  gameplayPose: CameraPose;
  reducedMotion?: boolean;
}

/** Create a fresh controller on every Enter World. dt is seconds; pause by not ticking. */
export function createIntroController({ gameplayPose, reducedMotion = false }: IntroControllerOptions) {
  const intro = createIntro(gameplayPose);
  const duration = reducedMotion ? REDUCED_MOTION_DURATION : intro.duration;
  let state: IntroState = "idle";
  let elapsed = 0;

  function currentFrame(): IntroFrame {
    if (state === "done") return intro.finalFrame();
    if (!reducedMotion) return intro.sample(elapsed);
    return { ...intro.finalFrame(), paperOpacity: 1 - ease(elapsed / duration) };
  }

  return {
    get state(): IntroState { return state; },
    get inputLocked(): boolean { return state === "playing"; },
    get elapsed(): number { return elapsed; },
    duration,
    /** Idempotent: calling start again never rewinds a playing/completed intro. */
    start(): IntroFrame {
      if (state === "idle") state = "playing";
      return currentFrame();
    },
    /** Available even before start; repeated skips return fresh copies of the same pose. */
    skip(): IntroFrame {
      elapsed = duration;
      state = "done";
      return currentFrame();
    },
    tick(dt: number): IntroFrame {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Intro dt must be finite and nonnegative");
      if (state === "playing") {
        // Absorb floating-point accumulation at the exact duration (e.g. 1320 x 1/60).
        elapsed = Math.min(duration, elapsed + dt);
        if (duration - elapsed < 1e-9) {
          elapsed = duration;
          state = "done";
        }
      }
      return currentFrame();
    },
  };
}
