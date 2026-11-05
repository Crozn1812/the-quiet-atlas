import { PATH_BRIDGES } from "../layout/path";
import { ZONES, type Biome } from "../layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver, PATH_SAMPLES } from "../terrain/samples";
import { TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";
import { isDeepCrown } from "./instances";

export interface FoliageTree {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly scale: number;
  readonly kind: "pine" | "broadleaf";
  /** Low coastal broadleaf, reusing the existing meshes and instance budget. */
  readonly growth?: "shrub";
  /** Radians about world Z, rooted at the terrain surface. */
  readonly lean: number;
}

export const MIN_TREE_DISTANCE = 4;
// Include trunk radius and 2 cm polyline approximation margin in the clearance.
export const RIVER_CLEARANCE = 6 + 3 + 0.28 + 0.02;
export const PATH_CLEARANCE = PATH_WIDTH / 2 + 2.5 + 0.28 + 0.02;
export const ZONE_CLEARANCE = 4 + 0.28;
export const BRIDGE_CLEARANCE = 6;
/** Ground below this height (m, sea level 0) is sea floor or wet sand: no trees (B2-031). */
export const SHORE_MIN_HEIGHT = 0.8;
export const ZONE_APPROACH_REACH = 15;
const APPROACH_COSINE = Math.cos(Math.PI / 6);

function randomFor(key: string): () => number {
  let state = TERRAIN_SEED;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function biomeAtProgress(t: number): Biome {
  return ZONES.reduce((best, zone) => Math.abs(zone.t - t) < Math.abs(best.t - t) ? zone : best).biome;
}

/** Nearest zone in walking distance; no separate biome map to drift from layout. */
export function foliageBiomeAt(x: number, z: number): Biome {
  return biomeAtProgress(nearestPath(x, z).t);
}

/** Signed metres along the road normal facing away from the sea (-Z).
 * Only the layout determines the side; terrain relief can change independently.
 */
function coastInlandDistance(x: number, z: number, path: ReturnType<typeof nearestPath>): number {
  const index = Math.min(PATH_SAMPLES.length - 2, Math.floor(path.t * (PATH_SAMPLES.length - 1)));
  const a = PATH_SAMPLES[index]!, b = PATH_SAMPLES[index + 1]!;
  let nx = a.z - b.z, nz = b.x - a.x;
  if (nz < 0) { nx = -nx; nz = -nz; }
  return ((x - path.x) * nx + (z - path.z) * nz) / Math.hypot(nx, nz);
}

/** Layout anchors lie on the path: -lookDirection points back along the approach. */
export function isZoneApproach(x: number, z: number): boolean {
  return ZONES.some(zone => {
    const dx = x - zone.position.x, dz = z - zone.position.z;
    const distance = Math.hypot(dx, dz);
    const length = Math.hypot(zone.lookDirection.x, zone.lookDirection.z);
    return distance <= zone.radius + ZONE_APPROACH_REACH
      && -(dx * zone.lookDirection.x + dz * zone.lookDirection.z) >= distance * length * APPROACH_COSINE;
  });
}

export function isFoliageExcluded(x: number, z: number): boolean {
  if (worldHeight(x, z) < SHORE_MIN_HEIGHT) return true;
  const path = nearestPath(x, z);
  return path.distance < PATH_CLEARANCE || nearestRiver(x, z).distance < RIVER_CLEARANCE
    || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + ZONE_CLEARANCE)
    || isZoneApproach(x, z)
    || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < BRIDGE_CLEARANCE);
}

interface Candidate { x: number; z: number; priority: number; scale: number; kind: FoliageTree["kind"]; lean: number; growth?: "shrub" }
interface Clump { x: number; z: number; radius: number }
const CLUMP_SIZE = TILE_SIZE / 2;

function clumpsFor(ix: number, iz: number, width: number): Clump[] {
  const result: Clump[] = [];
  for (let dx = -1; dx <= width; dx++) for (let dz = -1; dz <= width; dz++) {
    const random = randomFor(`clump:${ix + dx},${iz + dz}`);
    result.push({ x: (ix + dx + random()) * CLUMP_SIZE, z: (iz + dz + random()) * CLUMP_SIZE, radius: 12 + random() * 12 });
  }
  return result;
}

function clumpDensity(x: number, z: number, clumps: readonly Clump[]): number {
  let influence = 0;
  for (const clump of clumps) {
    const falloff = Math.max(0, 1 - Math.hypot(x - clump.x, z - clump.z) / clump.radius);
    influence = Math.max(influence, falloff * falloff);
  }
  return 0.12 + influence * 0.88;
}

/** Overlapping seeded clumps in world space, continuous across tile boundaries. */
export function foliageClumpAt(x: number, z: number): number {
  return clumpDensity(x, z, clumpsFor(Math.floor(x / CLUMP_SIZE), Math.floor(z / CLUMP_SIZE), 1));
}

function candidates(ix: number, iz: number): Candidate[] {
  const random = randomFor(tileKey(ix, iz));
  // Only sixteen centres per tile, reused by all candidates; no global cache.
  const clumps = clumpsFor(ix * 2, iz * 2, 2);
  const clearings = Array.from({ length: 2 }, () => ({
    x: (ix + random()) * TILE_SIZE, z: (iz + random()) * TILE_SIZE, radius: 9 + random() * 6,
  }));
  const result: Candidate[] = [];
  for (let i = 0; i < 180; i++) {
    const x = (ix + random()) * TILE_SIZE;
    const z = (iz + random()) * TILE_SIZE;
    const densityRoll = random();
    const priority = random();
    const scaleRoll = random();
    const kindRoll = random();
    const lean = (random() - 0.5) * 0.12;
    const path = nearestPath(x, z);
    const biome = biomeAtProgress(path.t);
    const clump = clumpDensity(x, z, clumps);
    const distance = path.distance;
    const inland = biome === "coast-dusk" ? coastInlandDistance(x, z, path) : 0;
    const canopy = biome === "coast-dusk" && inland > 0 && distance >= 22 && distance <= 160;
    // Spend the existing candidate pool on the visible coastal slope. Cull hidden
    // forest interiors, leaving the ordinary forest beside the road unchanged.
    const forestWeight = distance > 40 ? 0.48 : distance > 22 ? 0.85 : 1;
    // Colour comes from the renderer's position hash: favour its deep buckets
    // without another material, mesh, colour override or extra random draws.
    const density = biome === "forest-dawn" ? clump * forestWeight : biome === "hill" ? clump * 0.2
      : canopy ? (isDeepCrown(x, z) ? 0.98 : 0.12) : inland > 160 ? clump * 0.01 : clump * 0.25;
    if (densityRoll >= density || isFoliageExcluded(x, z)) continue;
    if (biome === "forest-dawn" && clearings.some(c => Math.hypot(x - c.x, z - c.z) < c.radius)) continue;
    const shrub = biome === "coast-dusk" && !canopy;
    result.push({ x, z, priority, scale: shrub ? 0.12 + scaleRoll * 0.08 : canopy ? 1.1 + scaleRoll * 0.2 : 0.8 + scaleRoll * 0.5,
      // Broad crowns overlap in projection up the slope and reuse the coastal
      // shrub species, so the denser coast does not activate extra draw calls.
      kind: shrub || canopy ? "broadleaf" : kindRoll < (biome === "forest-dawn" ? 0.88 : 0.6) ? "pine" : "broadleaf", lean,
      ...(shrub ? { growth: "shrub" as const } : {}),
    });
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
    .map(({ x, z, scale, kind, lean, growth }) => ({ x, z, y: worldHeight(x, z), scale, kind, lean,
      ...(growth ? { growth } : {}),
    }));
}
