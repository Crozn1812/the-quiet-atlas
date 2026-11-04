import { PATH_BRIDGES } from "../layout/path";
import { ZONES, type Biome } from "../layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";

export interface FoliageTree {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly scale: number;
  readonly kind: "pine" | "broadleaf";
  /** Radians about world Z, rooted at the terrain surface. */
  readonly lean: number;
}

export const MIN_TREE_DISTANCE = 4;
// Include trunk radius and 2 cm polyline approximation margin in the clearance.
export const RIVER_CLEARANCE = 6 + 3 + 0.28 + 0.02;
export const PATH_CLEARANCE = PATH_WIDTH / 2 + 2.5 + 0.28 + 0.02;
export const ZONE_CLEARANCE = 4 + 0.28;
export const BRIDGE_CLEARANCE = 6;

function randomFor(key: string): () => number {
  let state = TERRAIN_SEED;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Nearest zone in walking distance; no separate biome map to drift from layout. */
export function foliageBiomeAt(x: number, z: number): Biome {
  const { t } = nearestPath(x, z);
  return ZONES.reduce((best, zone) => Math.abs(zone.t - t) < Math.abs(best.t - t) ? zone : best).biome;
}

export function isFoliageExcluded(x: number, z: number): boolean {
  const path = nearestPath(x, z);
  return path.distance < PATH_CLEARANCE || nearestRiver(x, z).distance < RIVER_CLEARANCE
    || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + ZONE_CLEARANCE)
    || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < BRIDGE_CLEARANCE);
}

interface Candidate { x: number; z: number; priority: number; scale: number; kind: FoliageTree["kind"]; lean: number }

function candidates(ix: number, iz: number): Candidate[] {
  const random = randomFor(tileKey(ix, iz));
  const clearings = Array.from({ length: 2 }, () => ({
    x: (ix + random()) * TILE_SIZE, z: (iz + random()) * TILE_SIZE, radius: 9 + random() * 6,
  }));
  const result: Candidate[] = [];
  for (let i = 0; i < 180; i++) {
    const x = (ix + random()) * TILE_SIZE;
    const z = (iz + random()) * TILE_SIZE;
    const densityRoll = random();
    const priority = random();
    const scale = 0.8 + random() * 0.5;
    const kindRoll = random();
    const lean = (random() - 0.5) * 0.12;
    const biome = foliageBiomeAt(x, z);
    const density = biome === "forest-dawn" ? 1 : biome === "hill" ? 0.2 : 0.005;
    if (densityRoll >= density || isFoliageExcluded(x, z)) continue;
    if (biome === "forest-dawn" && clearings.some(c => Math.hypot(x - c.x, z - c.z) < c.radius)) continue;
    result.push({ x, z, priority, scale, kind: kindRoll < (biome === "forest-dawn" ? 0.88 : 0.6) ? "pine" : "broadleaf", lean });
  }
  return result;
}

/**
 * Seeded Poisson candidates with Matérn-II hard-core thinning. The 8-neighbour
 * halo makes the 4 m disk constraint independent of tile loading order, even
 * across seams. No global cache, quality input, or mutable random state.
 */
export function scatterTile(tile: TileAddress | TerrainTile): FoliageTree[] {
  const ix = "ix" in tile ? tile.ix : tile.origin.x / TILE_SIZE;
  const iz = "iz" in tile ? tile.iz : tile.origin.z / TILE_SIZE;
  tileKey(ix, iz);
  if ("size" in tile && tile.size !== TILE_SIZE) throw new RangeError("Foliage requires standard terrain tiles");
  const own = candidates(ix, iz);
  const halo: Candidate[] = [...own];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dx || dz) halo.push(...candidates(ix + dx, iz + dz));
  }
  return own.filter(a => !halo.some(b => b !== a
    && (b.priority < a.priority || (b.priority === a.priority && (b.x < a.x || (b.x === a.x && b.z < a.z))))
    && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < MIN_TREE_DISTANCE ** 2))
    .map(({ x, z, scale, kind, lean }) => ({ x, z, y: worldHeight(x, z), scale, kind, lean }));
}
