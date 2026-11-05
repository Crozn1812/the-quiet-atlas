import { pathPointAt } from "../layout/path";
import { ZONES } from "../layout/zones";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath } from "../terrain/samples";
import { PATH_CLEARANCE } from "../zones/types";
import { sampleShoreContour, shoreGroundHeight, shoreNormal, type ShorePoint } from "./contour";

export const SHORE_SEED = 16473021;
export const SHORE_ZONE_MARGIN = 3;
export const SHORE_BUDGET = { drawCalls: 4, triangles: 25_000 } as const;

export interface ShoreStone extends ShorePoint {
  readonly y: number;
  readonly size: readonly [number, number, number];
  readonly yaw: number;
  readonly pigment: number;
}
export interface Pebble extends ShoreStone {
  readonly shore: ShorePoint;
  readonly offset: number;
}
export interface Boulder extends ShoreStone { readonly cluster: number; readonly site: "shore" | "mountain" }
export interface Cairn extends ShorePoint {
  readonly t: number;
  readonly y: number;
  readonly height: number;
  readonly stones: readonly ShoreStone[];
}
export interface SandPatch extends ShorePoint {
  readonly normal: ShorePoint;
  readonly width: number;
  readonly length: number;
}
export interface ShoreLayout {
  readonly pebbles: readonly Pebble[];
  readonly boulders: readonly Boulder[];
  readonly cairns: readonly Cairn[];
  readonly sand: readonly SandPatch[];
}

/** Position-keyed pigment/shape jitter, independent of generation order. */
function random(x: number, z: number, salt: number): number {
  let hash = Math.imul(Math.round(x * 100), 374761393)
    ^ Math.imul(Math.round(z * 100), 668265263) ^ Math.imul(salt, 1274126177) ^ SHORE_SEED;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** Radius includes the complete rotated footprint, not just its centre. */
export function shorePlacementClear(x: number, z: number, radius: number): boolean {
  return nearestPath(x, z).distance > PATH_CLEARANCE + radius
    && ZONES.every(zone => Math.hypot(x - zone.position.x, z - zone.position.z)
      > zone.radius + SHORE_ZONE_MARGIN + radius);
}

function stone(x: number, z: number, diameter: number, salt: number): ShoreStone {
  const height = diameter * (0.55 + random(x, z, salt + 1) * 0.25);
  return {
    x, z, y: shoreGroundHeight(x, z) - height * 0.16,
    size: [diameter, height, diameter * (0.72 + random(x, z, salt + 2) * 0.28)],
    yaw: random(x, z, salt + 3) * Math.PI * 2,
    pigment: random(x, z, salt + 4),
  };
}

export function createShoreLayout(): ShoreLayout {
  const contour = sampleShoreContour();
  const cumulative: number[] = [];
  let total = 0;
  for (const segment of contour) { total += segment.length; cumulative.push(total); }
  function at(distance: number): ShorePoint {
    let first = 0, last = cumulative.length - 1;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (cumulative[middle]! < distance) first = middle + 1;
      else last = middle;
    }
    const segment = contour[first]!;
    const u = (distance - (cumulative[first]! - segment.length)) / segment.length;
    const x = segment.a.x + (segment.b.x - segment.a.x) * u;
    const z = segment.a.z + (segment.b.z - segment.a.z) * u;
    // Bisect across the chord: unlike Newton steps this also handles sharp bay corners.
    const normal = shoreNormal({ x, z });
    const height = (offset: number) => worldHeight(x + normal.x * offset, z + normal.z * offset);
    let low = -0.25, high = 0.25;
    while ((height(low) > 0) === (height(high) > 0) && high < 4) { low *= 2; high *= 2; }
    if ((height(low) > 0) === (height(high) > 0)) return u < 0.5 ? segment.a : segment.b;
    const lowIsDry = height(low) > 0;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if ((height(middle) > 0) === lowIsDry) low = middle;
      else high = middle;
    }
    const offset = (low + high) / 2;
    return { x: x + normal.x * offset, z: z + normal.z * offset };
  }
  const pebbles: Pebble[] = [];
  for (let i = 0; i < 1000; i++) {
    const shore = at(total * (i + 0.5) / 1000);
    const normal = shoreNormal(shore);
    const r = random(shore.x, shore.z, 1);
    // 84% occupy the 8 m core; only 16% occupy the 5 m dry shoulder.
    const offset = r < 0.84 ? -3 + 7 * random(shore.x, shore.z, 2)
      : 4 + 5 * (1 - Math.sqrt(1 - random(shore.x, shore.z, 2)));
    const x = shore.x + normal.x * offset, z = shore.z + normal.z * offset;
    if (!shorePlacementClear(x, z, 0.3) || worldHeight(x, z) < -0.28) continue;
    const diameter = 0.1 + random(x, z, 3) * 0.3;
    const rock = stone(x, z, diameter, 10);
    pebbles.push({ ...rock, size: [diameter, rock.size[1] * 0.6, rock.size[2]], shore, offset });
  }

  const boulders: Boulder[] = [];
  function cluster(anchor: ShorePoint, id: number, site: Boulder["site"]) {
    const count = 2 + Math.floor(random(anchor.x, anchor.z, 20) * 4);
    for (let attempt = 0; attempt < 12; attempt++) {
      const rocks: Boulder[] = [];
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + attempt * 0.39;
        const x = anchor.x + Math.cos(angle) * 2.8 + attempt * 0.4;
        const z = anchor.z + Math.sin(angle) * 2.8;
        const rock = stone(x, z, 0.8 + random(x, z, 21) * 1.7, 30);
        const radius = Math.hypot(rock.size[0], rock.size[2]) / 2;
        if (!shorePlacementClear(x, z, radius) || worldHeight(x, z) < (site === "shore" ? -0.3 : waterLevelAt(z) + 0.1)) break;
        rocks.push({ ...rock, cluster: id, site });
      }
      if (rocks.length === count) { boulders.push(...rocks); return; }
    }
  }
  for (let i = 0; i < 10; i++) cluster(at(total * (i + 0.5) / 10), i, "shore");
  for (let i = 0; i < 6; i++) {
    const t = 0.835 + i * 0.026;
    const p = pathPointAt(t), f = pathPointAt(t + 0.001).sub(pathPointAt(t - 0.001)).normalize();
    cluster({ x: p.x + f.z * 33, z: p.z - f.x * 33 }, 10 + i, "mountain");
  }

  const cairns: Cairn[] = [];
  for (const target of [0.864, 0.881]) {
    for (const offset of [8, 11, 15, 20, 24, 28, 32]) {
      const p = pathPointAt(target);
      const f = pathPointAt(target + 0.001).sub(pathPointAt(target - 0.001)).normalize();
      const x = p.x + f.z * offset, z = p.z - f.x * offset;
      const t = nearestPath(x, z).t, y = shoreGroundHeight(x, z) - 0.03;
      if (t < 0.86 || t > 0.9 || !shorePlacementClear(x, z, 0.75)
        // Match terrain/mesh.ts: above 1.6 m the sand pigment has faded to grass.
        || y <= Math.max(1.65, waterLevelAt(z) + 0.15)) continue;
      const count = 5 + Math.floor(random(x, z, 40) * 3);
      const height = 1 + random(x, z, 41) * 0.4;
      const stones: ShoreStone[] = [];
      // Deliberately flatter, progressively smaller stones; centred contact faces.
      for (let i = 0; i < count; i++) {
        const width = 0.76 - 0.45 * i / (count - 1);
        stones.push({ x, z, y: y + height * i / count, size: [width, height / count, width * 0.8],
          yaw: random(x, z, 50 + i) * 0.4, pigment: random(x, z, 60 + i) });
      }
      cairns.push({ x, z, y, t, height, stones });
      break;
    }
  }

  // terrain/mesh.ts already blends sand/rock into grass at the real waterline.
  // Separate overlays covered the road verge and dry headland with hard-edged cells.
  return { pebbles, boulders, cairns, sand: [] };
}
