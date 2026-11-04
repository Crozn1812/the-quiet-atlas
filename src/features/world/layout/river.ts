import { CatmullRomCurve3, Vector3 } from "three";

/** Metres in the XZ plane, from the dawn forest to the sea at negative Z. */
export const RIVER_CONTROL_POINTS = Object.freeze([
  [0, 0], [55, -115], [-55, -250], [55, -390],
  [-55, -535], [55, -680], [0, -820], [0, -900],
] as const);

const river = new CatmullRomCurve3(
  RIVER_CONTROL_POINTS.map(([x, z]) => new Vector3(x, 0, z)),
  false,
  "centripetal",
);
river.arcLengthDivisions = 4096;

/** Clamp normalized distance inputs; reject NaN/Infinity instead of returning bad geometry. */
export function clampProgress(t: number): number {
  if (!Number.isFinite(t)) throw new RangeError("Route progress must be finite");
  return Math.max(0, Math.min(1, t));
}

/** t is normalized river arc length, not the Catmull-Rom segment parameter. */
export function riverPointAt(t: number): Vector3 {
  return river.getPointAt(clampProgress(t));
}

/** Unit direction downstream; results are fresh vectors safe for callers to mutate. */
export function riverTangentAt(t: number): Vector3 {
  return river.getTangentAt(clampProgress(t));
}

export function riverLength(): number {
  return river.getLength();
}
