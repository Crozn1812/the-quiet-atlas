import type { ZoneId } from "../interaction/targets";
import { pathLength, pathPointAt } from "../world/layout/path";
import { ZONES } from "../world/layout/zones";

export interface NavigationPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ArrivalPoint {
  readonly position: NavigationPosition;
  /** Camera/movement yaw: forward is (-sin(yaw), 0, -cos(yaw)). */
  readonly yaw: number;
}

export interface Signpost {
  readonly zoneId: ZoneId;
  readonly position: NavigationPosition;
}

// Zone anchors currently lie on the path centreline. Approach along its tangent;
// at First Light, approach from downstream to stay inside the route endpoints.
export const SIGNPOSTS: readonly Signpost[] = Object.freeze(ZONES.map(zone => {
  const direction = zone.t === 0 ? 1 : -1;
  return Object.freeze({
    zoneId: zone.id,
    position: Object.freeze({
      x: zone.position.x + direction * 3 * zone.lookDirection.x,
      y: zone.position.y,
      z: zone.position.z + direction * 3 * zone.lookDirection.z,
    }),
  });
}));

/** Flat layout coordinates; the world adapter resolves terrain/body height. */
export function arrivalPoint(zoneId: ZoneId): ArrivalPoint {
  const zone = ZONES.find(zone => zone.id === zoneId);
  if (!zone) throw new RangeError("Destination has no signpost");
  const direction = zone.t === 0 ? 1 : -1;
  // One metre beyond the signpost along the approach, on the actual path curve.
  const point = pathPointAt(zone.t + direction * 4 / pathLength());
  return {
    position: { x: point.x, y: point.y, z: point.z },
    yaw: Math.atan2(point.x - zone.position.x, point.z - zone.position.z),
  };
}
