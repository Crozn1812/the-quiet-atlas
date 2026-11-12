import { Vector3 } from "three";
import { PATH_CLEARANCE, ZONE_CLEARANCE } from "../foliage/scatter";
import { pathLength, pathPointAt } from "../layout/path";
import { ZONES } from "../layout/zones";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath } from "../terrain/samples";

export const ROAD_START = 0.8;
export const ROAD_END = 1;
export const ROAD_WIDTH = 5;
// A thin painted surface over the same ground triangles that support the player.
export const ROAD_LIFT = 0.025;
export const ROAD_TAPER_LENGTH = 18;
export const POST_SPACING = 11;
export const POLE_SPACING = 45;
export const POST_RADIUS = 0.17;
export const POLE_RADIUS = 0.2;
// Include the entire leaning bollard, not just its foot, outside the corridor.
export const POST_OFFSET = PATH_CLEARANCE + POST_RADIUS + 0.03;
// The narrow stream is on the walking-left shoulder: use the dry inland bank.
export const POLE_OFFSET = -24;

export interface RoadPost {
  readonly t: number;
  /** Distance along this offset rail, before exclusions (not centreline distance). */
  readonly station: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly lean: number;
  readonly height: number;
}

export interface RoadCollider {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export function roadFrameAt(t: number) {
  const point = pathPointAt(t);
  const forward = pathPointAt(Math.min(1, t + 0.00001))
    .sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
  return { point, right: new Vector3(-forward.z, 0, forward.x), yaw: Math.atan2(-forward.x, -forward.z) };
}

export function roadWidthAt(t: number): number {
  return t < ROAD_START || t > ROAD_END ? 0 : ROAD_WIDTH;
}

/** Stateless position seed: adding/removing another prop cannot change an instance. */
export function roadRandomAt(x: number, z: number): number {
  let hash = Math.imul(Math.round(x * 100), 374761393) ^ Math.imul(Math.round(z * 100), 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

export function roadPostAllowed(x: number, z: number, radius: number): boolean {
  return nearestPath(x, z).distance >= PATH_CLEARANCE + radius
    && worldHeight(x, z) >= waterLevelAt(z) + 0.05
    && ZONES.every(zone => Math.hypot(x - zone.position.x, z - zone.position.z)
      >= zone.radius + ZONE_CLEARANCE + radius);
}

/** Arc-length spacing on the actual shoulder; centreline spacing drifts on bends. */
function railPosts(offset: number, spacing: number, radius: number, utility: boolean): readonly RoadPost[] {
  const steps = Math.ceil((ROAD_END - ROAD_START) * pathLength() / 0.25);
  const samples = Array.from({ length: steps + 1 }, (_, i) => {
    const t = ROAD_START + (ROAD_END - ROAD_START) * i / steps;
    const frame = roadFrameAt(t);
    return { t, point: frame.point.addScaledVector(frame.right, offset), distance: 0 };
  });
  for (let i = 1; i < samples.length; i++) {
    samples[i]!.distance = samples[i - 1]!.distance + samples[i]!.point.distanceTo(samples[i - 1]!.point);
  }
  const result: RoadPost[] = [];
  let index = 1;
  for (let station = spacing / 2; station < samples.at(-1)!.distance; station += spacing) {
    while (samples[index]!.distance < station) index++;
    const a = samples[index - 1]!, b = samples[index]!;
    const t = a.t + (b.t - a.t) * (station - a.distance) / (b.distance - a.distance);
    const frame = roadFrameAt(t);
    const { x, z } = frame.point.addScaledVector(frame.right, offset);
    // Preserve the spacing lattice across protected pads; never relocate a post into the path.
    if (!roadPostAllowed(x, z, radius)) continue;
    const random = roadRandomAt(x, z);
    result.push(Object.freeze({ t, station, x, z, y: worldHeight(x, z), yaw: frame.yaw,
      height: utility ? 7 + random : 0.9, lean: utility ? 0 : (random * 4 - 2) * Math.PI / 180 }));
  }
  return Object.freeze(result);
}

export function createRoadLayout() {
  const posts = railPosts(POST_OFFSET, POST_SPACING, POST_RADIUS, false);
  const poles = railPosts(POLE_OFFSET, POLE_SPACING, POLE_RADIUS, true);
  const colliders: readonly RoadCollider[] = Object.freeze([
    ...posts.map(({ x, z }) => Object.freeze({ x, z, r: POST_RADIUS })),
    ...poles.map(({ x, z }) => Object.freeze({ x, z, r: POLE_RADIUS })),
  ]);
  return { posts, poles, colliders };
}
