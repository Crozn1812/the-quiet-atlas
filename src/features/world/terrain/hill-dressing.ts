import type { Box3 } from "three";
import type { HrPropSite } from "../props/hr-props";
import { surfaceHeight, waterLevelAt } from "./height";
import { hillDrainage, hillEase, hillNoise, hillRandom, horizonHillRegion, nearHillWeight } from "./hills";
import { nearestPath, nearestRiver } from "./samples";

/** Global jittered catchment sites: adjacent tiles own disjoint half-open bounds. */
export function nearHillSites(bounds: Box3): HrPropSite[] {
  const sites: HrPropSite[] = [];
  const add = (x: number, z: number, random: number, stone: boolean, clusterAnchor = false) => {
    const inside = x >= bounds.min.x && x < bounds.max.x && z >= bounds.min.z && z < bounds.max.z;
    // A neighbouring tile still needs the accepted anchor to own its grass children.
    if (!inside && !clusterAnchor) return;
    const path = nearestPath(x, z), river = nearestRiver(x, z);
    const weight = nearHillWeight(x, z, path.distance, river.distance, path.t);
    if (weight < 0.2 || random > weight * 0.85) return;
    const y = surfaceHeight(x, z);
    if (y < waterLevelAt(z) + 1.2) return;
    const dx = (surfaceHeight(x + 1, z) - surfaceHeight(x - 1, z)) / 2;
    const dz = (surfaceHeight(x, z + 1) - surfaceHeight(x, z - 1)) / 2;
    const slope = Math.hypot(dx, dz);
    const horizon = horizonHillRegion(x, z) > 0;
    if (slope < 0.08 || slope > (horizon ? 1.15 : 0.85)) return;
    const drainage = hillDrainage(x, z);
    const size = stone ? (horizon ? 0.55 : 0.38)
      + hillRandom(Math.floor(x * 31), Math.floor(z * 31)) * (horizon ? 1.85 : 1.45)
      : 0.65 + hillNoise(x, z, 7) * 1.15;
    const height = size * (stone ? 0.72 : 0.48);
    // Seat the entire footprint; bury 40–60% of a stone in the low support side.
    let support = y;
    for (const [ox, oz] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
      support = Math.min(support, surfaceHeight(x + ox! * size, z + oz! * size));
    }
    const site: HrPropSite = { asset: stone ? (drainage > 0.35 ? "hr-rock-moss-slate" : "hr-rock-boulder")
      : drainage > 0.35 ? "hr-prop-bush-needle" : "hr-prop-grass-meadow",
    x, z, baseY: support - height * (stone ? 0.4 + random * 0.2 : 0.1),
    size: [size * 1.15, height, size * (0.7 + random * 0.3)],
    yaw: Math.atan2(dz, dx) + random * 1.7, tint: 0.65 + random * 0.18 };
    if (inside) sites.push(site);
    return site;
  };
  // Include neighbouring cells before clipping each child, so ownership never
  // changes a cluster or duplicates it at a streamed tile boundary.
  for (let gx = Math.floor(bounds.min.x / 9) - 1; gx <= Math.floor(bounds.max.x / 9) + 1; gx++) {
    for (let gz = Math.floor(bounds.min.z / 9) - 1; gz <= Math.floor(bounds.max.z / 9) + 1; gz++) {
      const r = hillRandom(gx, gz), q = hillRandom(gx + 311, gz - 77);
      const x = (gx + 0.08 + r * 0.84) * 9, z = (gz + 0.08 + q * 0.84) * 9;
      const pocket = hillNoise(x, z, 25), drainage = hillDrainage(x, z);
      const horizon = horizonHillRegion(x, z) > 0;
      const stone = hillRandom(gx - 103, gz + 217) < 0.18 + drainage * 0.35;
      if (horizon && stone && drainage < 0.16 && hillNoise(x, z, 6) < 0.62) continue;
      if (pocket < (stone ? horizon ? 0.26 : 0.37 : 0.28)) continue;
      const site = add(x, z, hillRandom(gx + 517, gz + 93), stone, horizon && stone);
      if (site && stone && horizon) {
        // Grass owns the low side of each outcrop rather than an isolated rock dot.
        for (const angle of [q * 6.28, q * 6.28 + 2.4]) {
          const radius = site.size[0] * 0.45;
          add(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, 0, false);
        }
      }
      if (!stone || r < 0.42) continue;
      for (let j = 0; j < 1 + Math.floor(q * 3); j++) {
        const angle = hillRandom(gx * 7 + j, gz * 13) * Math.PI * 2;
        const distance = 0.7 + hillRandom(gx * 11, gz * 5 + j) * 2.4;
        add(x + Math.cos(angle) * distance, z + Math.sin(angle) * distance,
          hillRandom(gx * 19 + j, gz * 23) * hillEase(0, 1, pocket), true);
      }
    }
  }
  return sites;
}
