import { clampProgress } from "./river";

/** Keep the late-sun hill grade through Horizon, rather than reaching dusk there. */
export const LIGHTING_TRANSITION = Object.freeze({ start: 0.2, hill: 0.625, horizon: 0.76, end: 0.93 });

/** Near-linear progression with short, zero-slope shoulders at both ends. */
function coastProgress(u: number): number {
  const shoulder = 0.02;
  const eased = u < shoulder ? u ** 4 / (4 * shoulder ** 3)
    : u > 1 - shoulder ? 1 - 1.5 * shoulder - (1 - u) ** 4 / (4 * shoulder ** 3)
    : u - 0.75 * shoulder;
  const progress = eased / (1 - 1.5 * shoulder);
  // Spend slightly longer near the high hill sun, whose ground irradiance changes fastest.
  return progress * (0.7 + 0.3 * progress);
}

/** Position-driven only, with zero slope at the dawn, hill and dusk boundaries. */
export function timeOfDayAt(t: number): number {
  const { start, hill, horizon, end } = LIGHTING_TRANSITION;
  const position = clampProgress(t);
  const dusk = position > horizon;
  const blend = Math.max(0, Math.min(1, dusk
    ? (position - horizon) / (end - horizon)
    : (position - start) / (hill - start)));
  if (!dusk) return 0.5 * blend * blend * (3 - 2 * blend);
  if (blend === 1) return 1;
  const progress = coastProgress(blend);
  // Invert lightingAt's keyframe smoothstep to avoid stacking two steep eases
  // in the short Horizon -> shore interval. No exposure or target luma involved.
  return 0.5 + 0.5 * (0.5 - Math.sin(Math.asin(1 - 2 * progress) / 3));
}
