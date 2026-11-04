import { ZONE_IDS, type ZoneId } from "../../interaction/targets";
import type { Vector3 } from "three";
import { pathPointAt } from "./path";

export type Biome = "forest-dawn" | "hill" | "coast-dusk";

export interface ZoneLayout {
  readonly id: ZoneId;
  /** Normalized walking distance from First Light. */
  readonly t: number;
  readonly position: Readonly<Vector3>;
  readonly radius: number;
  readonly lookDirection: Readonly<Vector3>;
  readonly biome: Biome;
}

// Keyed by the interaction contract; its display order (Roots before Workshop)
// differs from the walking order. Sort by distance rather than duplicating IDs.
const placements: Record<ZoneId, { t: number; radius: number; biome: Biome }> = {
  "first-light": { t: 0, radius: 12, biome: "forest-dawn" },
  workshop: { t: 0.14, radius: 14, biome: "forest-dawn" },
  roots: { t: 0.19, radius: 14, biome: "forest-dawn" },
  milestones: { t: 0.235, radius: 14, biome: "forest-dawn" },
  "old-trail": { t: 0.5, radius: 16, biome: "hill" },
  horizon: { t: 0.76, radius: 18, biome: "hill" },
  "quiet-shore": { t: 0.89, radius: 16, biome: "coast-dusk" },
  "last-postcard": { t: 1, radius: 12, biome: "coast-dusk" },
};

export const ZONES: readonly ZoneLayout[] = Object.freeze(ZONE_IDS.map(id => {
  const placement = placements[id];
  const before = pathPointAt(Math.max(0, placement.t - 0.001));
  const after = pathPointAt(Math.min(1, placement.t + 0.001));
  return Object.freeze({
    id,
    ...placement,
    position: Object.freeze(pathPointAt(placement.t)),
    lookDirection: Object.freeze(after.sub(before).normalize()),
  });
}).sort((a, b) => a.t - b.t));
