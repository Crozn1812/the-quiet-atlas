// locomotion.ts delegates to inputToMoveVector; WALK_SPEED lives in that module.
// Import its source of truth rather than duplicating 3 m/s or changing locomotion.
import { WALK_SPEED } from "../../interaction/movement";
import type { ZoneId } from "../../interaction/targets";
import { pathLength } from "./path";
import { ZONES } from "./zones";

/** Uninterrupted walking only: no sprint, reading, cinematic, or secret detours. */
export function routeSeconds(): number {
  return pathLength() / WALK_SPEED;
}

export function secondsToZone(id: ZoneId): number {
  const zone = ZONES.find(zone => zone.id === id);
  if (!zone) throw new RangeError(`Unknown zone: ${id}`);
  return zone.t * routeSeconds();
}
