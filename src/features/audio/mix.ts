import type { Biome } from "../world/layout/zones";

export interface AmbienceMix {
  readonly stream: number;
  readonly wind: number;
  readonly birds: number;
  readonly sea: number;
}

export interface AmbienceInputs {
  /** World-space metres to the nearest river / shoreline. */
  readonly distanceToRiver: number;
  readonly distanceToSea: number;
  readonly zoneBiome: Biome;
  /** Same normalized dawn (0) to dusk (1) value as timeOfDayAt. */
  readonly timeOfDay: number;
}

/** NaN is silent; infinities and finite values clamp to the unit range. */
export function clampUnit(value: number): number {
  return Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
}

function proximity(distance: number, range: number): number {
  if (Number.isNaN(distance)) return 0;
  const t = clampUnit(1 - Math.max(0, distance) / range);
  return t * t * (3 - 2 * t);
}

/** Pure position-derived ambience; carries no story information or progress. */
export function ambienceMixAt(inputs: AmbienceInputs): AmbienceMix {
  const forest = inputs.zoneBiome === "forest-dawn";
  const coast = inputs.zoneBiome === "coast-dusk";
  const dawn = 1 - clampUnit(inputs.timeOfDay);
  return {
    stream: proximity(inputs.distanceToRiver, 36) * (forest ? 0.8 : 0.35),
    wind: forest ? 0.22 : coast ? 0.38 : 0.8,
    // The strict forest gate also cancels queued chirps when leaving a forest.
    birds: forest ? 0.2 + 0.55 * dawn : 0,
    sea: proximity(inputs.distanceToSea, 70) * (coast ? 0.95 : 0.3),
  };
}
