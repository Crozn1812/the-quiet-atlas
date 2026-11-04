import { blendGrade, lightingAt, type LightingGrade } from "./grade";

/** Rate is in inverse seconds. Returned grades are borrowed until the next update/snap. */
export function createGradeFollower(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("Grade rate must be finite and positive");
  const current = lightingAt(0);
  // Keep the unnormalized exponential state so direction is frame independent too.
  const direction = current.sunDirection.clone();
  return {
    /** dt is elapsed seconds, independent of the position-derived time of day. */
    update(target: LightingGrade, dt: number): LightingGrade {
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Grade dt must be finite and nonnegative");
      const alpha = -Math.expm1(-rate * dt);
      if (alpha === 0) return current;
      direction.lerp(target.sunDirection, alpha);
      blendGrade(current, current, target, alpha);
      current.sunDirection.copy(direction).normalize();
      return current;
    },
    /** Call at initial spawn and on teleport, including while simulation is paused. */
    snap(target: LightingGrade): LightingGrade {
      direction.copy(target.sunDirection);
      return blendGrade(current, current, target, 1);
    },
  };
}
