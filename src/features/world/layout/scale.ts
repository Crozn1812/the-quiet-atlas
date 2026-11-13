/** ADR 0017: shorten both axes of the river, keeping props and walking widths in metres. */
export const WORLD_SCALE = 0.64;
export const WORLD_LENGTH = 900 * WORLD_SCALE;

/** Convert an authored longitudinal station on the original route to world Z. */
export function routeZ(station: number): number {
  return -station * WORLD_SCALE;
}

/** Seeded outer beach, 20 original-route metres before the river mouth. */
export const COAST_BEACH_Z = routeZ(880);
/** Shared CPU/shader pigment boundary; the bay starts upstream of the beach. */
export const COAST_SAND_Z = Object.freeze([routeZ(720), routeZ(680)] as const);
