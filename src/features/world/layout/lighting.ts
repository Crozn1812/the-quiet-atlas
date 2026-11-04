import { clampProgress } from "./river";

/** Path-distance bands: hold dawn in the forest, blend over the hills, hold dusk at sea. */
export const LIGHTING_TRANSITION = Object.freeze({ start: 0.2, end: 0.9 });

/** Position-driven only. Smoothstep gives zero slope at either transition boundary. */
export function timeOfDayAt(t: number): number {
  const { start, end } = LIGHTING_TRANSITION;
  const blend = Math.max(0, Math.min(1, (clampProgress(t) - start) / (end - start)));
  return blend * blend * (3 - 2 * blend);
}
