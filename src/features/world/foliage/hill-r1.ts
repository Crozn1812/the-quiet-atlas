import { FOREST_ATMOSPHERE_TRANSITION, forestAtmosphereWeight } from "../art/direction";
import { pathLength } from "../layout/path";

// The coastal scatter/dressing starts at .82. Finish our feather there so
// the parallel coast rollout owns every coastal vertex and tree unchanged.
export const HILL_R1_TRANSITION = Object.freeze({
  start: 0.82 - 40 / pathLength(), end: 0.82,
});

/** Position-only blend: shared by terrain and tree selection on either journey direction. */
export function hillR1Weight(pathT: number): number {
  if (!Number.isFinite(pathT) || pathT <= FOREST_ATMOSPHERE_TRANSITION.start) return 0;
  const { start, end } = HILL_R1_TRANSITION;
  const u = Math.max(0, Math.min(1, (pathT - start) / (end - start)));
  return (1 - forestAtmosphereWeight(pathT)) * (1 - u * u * (3 - 2 * u));
}
