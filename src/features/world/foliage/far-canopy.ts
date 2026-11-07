import { pathLength } from "../layout/path";
import { ZONES } from "../layout/zones";
import { nearestPath } from "../terrain/samples";
import { TERRAIN_SEED } from "../terrain/height";

// Same nearest-zone biome boundary as scatter; reuse one path lookup for both
// the near-tree handover and the forest/hill feather.
const firstHill = ZONES.findIndex(zone => zone.biome === "hill");
const forestEnd = (ZONES[firstHill - 1]!.t + ZONES[firstHill]!.t) / 2;
const routeLength = pathLength();

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function seed(x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ TERRAIN_SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth handover mask; individual crowns use their own geometry. */
export function farCanopyAt(x: number, z: number, riverDistance: number, slope: number) {
  const path = nearestPath(x, z);
  let weight = smooth(48, 78, path.distance)
    * smooth(44, 74, riverDistance) * (1 - smooth(0.55, 0.95, slope));
  weight *= smooth(0, 45, (forestEnd - path.t) * routeLength);
  for (const zone of ZONES) {
    weight *= smooth(zone.radius + 20, zone.radius + 50, Math.hypot(x - zone.position.x, z - zone.position.z));
  }
  const crown = seed(Math.floor(x), Math.floor(z));
  return { weight, crown, lift: weight * (8 + 4 * crown) };
}

export function farCrownSeed(x: number, z: number) { return seed(x, z); }
