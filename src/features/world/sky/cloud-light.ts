import { Color } from "three";
import type { LightingGrade } from "./grade";

/** Linear incident radiance; optical density/self-shadow stay in the shared bake. */
export function cloudLight(grade: LightingGrade, sun: Color, shade: Color): void {
  // Longer solar paths remove blue/green before sunlight reaches a low cloud.
  // Use the authoritative elevation, including dawn; coast position is not time.
  const air = 1 / Math.sqrt(grade.sunDirection.y ** 2 + 0.025);
  const path = Math.max(0, air - 1.7);
  sun.copy(grade.sunColor);
  sun.g *= Math.exp(-path * 0.065);
  sun.b *= Math.exp(-path * 0.15);
  shade.copy(grade.skyTop).lerp(grade.shadowTint, 0.55).multiplyScalar(0.48);
  // Blue skylight plus red horizon bounce gives violet-grey shadow at low sun.
  const twilight = Math.min(1, Math.max(path / 4, 1 - grade.sunColor.b / Math.max(grade.sunColor.r, 0.001)));
  shade.r += grade.skyTop.b * twilight * 0.32;
  shade.g *= 1 - twilight * 0.22;
}
