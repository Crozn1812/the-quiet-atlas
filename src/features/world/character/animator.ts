import { MathUtils, Quaternion, Vector3 } from "three";
import { RUN_SPEED, WALK_SPEED } from "../../interaction/movement";
import type { Character } from "./runtime";

export const WALK_STRIDE = 0.7;
/** Run stride is provisional until calibrated against the authored Run clip. */
export const RUN_STRIDE = 1.4;
export const MAX_TURN_RATE = MathUtils.degToRad(540);
const RESPONSE = 12;

export interface AnimationWeights { idle: number; walk: number; run: number }

/** Piecewise-linear blend space in metres/second; no jump clip, so airborne uses idle. */
export function characterWeights(speed: number, grounded = true): AnimationWeights {
  const value = Number.isFinite(speed) && grounded ? Math.max(0, speed) : 0;
  if (value <= WALK_SPEED) {
    const walk = value / WALK_SPEED;
    return { idle: 1 - walk, walk, run: 0 };
  }
  const run = MathUtils.clamp((value - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
  return { idle: 0, walk: 1 - run, run };
}

export function createCharacterAnimator(
  character: Character,
  options: { reducedMotion?: boolean; runStride?: number; forwardYaw?: number } = {},
) {
  const { root, mixer, actions } = character;
  const runStride = options.runStride ?? RUN_STRIDE;
  if (!Number.isFinite(runStride) || runStride <= 0) throw new RangeError("Run stride must be positive.");
  let reducedMotion = options.reducedMotion ?? false;
  const previous = root.position.clone();
  const targetRotation = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const weights: AnimationWeights = { idle: 1, walk: 0, run: 0 };

  return {
    setReducedMotion(value: boolean) { reducedMotion = value; },
    /** Call after copying physics.position to root.position. dt is simulation time. */
    update(dt: number, speed: number, grounded: boolean) {
      if (character.disposed || !Number.isFinite(dt) || dt <= 0) {
        previous.copy(root.position);
        return;
      }
      const velocity = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      const target = characterWeights(velocity, grounded);
      const blend = 1 - Math.exp(-RESPONSE * dt);
      for (const key of ["idle", "walk", "run"] as const) {
        weights[key] = MathUtils.lerp(weights[key], target[key], blend);
      }
      const total = weights.idle + weights.walk + weights.run;
      for (const key of ["idle", "walk", "run"] as const) {
        weights[key] /= total;
        actions[key].setEffectiveWeight(weights[key]);
      }
      actions.walk.setEffectiveTimeScale(grounded ? velocity * actions.walk.getClip().duration / WALK_STRIDE : 0);
      actions.run.setEffectiveTimeScale(grounded ? velocity * actions.run.getClip().duration / runStride : 0);
      // Freeze only breathing at the authored neutral pose, including when preference changes live.
      if (reducedMotion) actions.idle.time = 0;
      actions.idle.setEffectiveTimeScale(reducedMotion || !grounded ? 0 : 1);
      mixer.update(dt);

      const dx = root.position.x - previous.x;
      const dz = root.position.z - previous.z;
      previous.copy(root.position);
      if (velocity > 0 && Math.hypot(dx, dz) > 1e-6) {
        targetRotation.setFromAxisAngle(up, Math.atan2(dx, dz) - (options.forwardYaw ?? 0));
        const angle = root.quaternion.angleTo(targetRotation);
        root.quaternion.rotateTowards(targetRotation, Math.min(angle * blend, MAX_TURN_RATE * dt));
      }
    },
  };
}
