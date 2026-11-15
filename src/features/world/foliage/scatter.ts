import type { Box3 } from "three";
import { PATH_BRIDGES, pathLength, pathPointAt } from "../layout/path";
import { ZONES, type Biome } from "../layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver, PATH_SAMPLES } from "../terrain/samples";
import { TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";
import { isDeepCrown } from "./instances";
import { FOREST_SUN_SHAFT_PROGRESS } from "../layout/sun-shafts";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown } from "./shapes";

export interface FoliageTree {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly scale: number;
  readonly kind: "pine" | "broadleaf";
  /** Low coastal broadleaf, reusing the existing meshes and instance budget. */
  readonly growth?: "shrub";
  /** Broader, path-facing limbs on the sheltered forest shoulder. */
  readonly trailCanopy?: true;
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
const routeLength = pathLength();
const firstHill = ZONES.findIndex(zone => zone.biome === "hill");
const forestEdge = (ZONES[firstHill - 1]!.t + ZONES[firstHill]!.t) / 2;
const sunGaps = FOREST_SUN_SHAFT_PROGRESS.map(pathPointAt);
const trailCanopySpawn = pathPointAt(0);
const trailFootprint = (() => {
  const crown = createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], true);
  const position = crown.getAttribute("position"), surface = crown.getAttribute("surface");
  // Each leaf bunch has twelve vertices. Separate footprints retain the gaps
  // between bunches when the shorter route brings clearings closer together.
  const bounds = [];
  for (let start = 0; start < position.count && surface.getX(start) === 0; start += 12) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = start; i < start + 12; i++) {
      minX = Math.min(minX, position.getX(i)); maxX = Math.max(maxX, position.getX(i));
      minZ = Math.min(minZ, position.getZ(i)); maxZ = Math.max(maxZ, position.getZ(i));
    }
    bounds.push({ minX, maxX, minZ, maxZ });
  }
  crown.dispose();
  return bounds;
})();

/** Metres back from the hill boundary in the path-defined biome map. */
export function forestHillDistanceAt(x: number, z: number): number {
  return Math.max(0, (forestEdge - nearestPath(x, z).t) * routeLength);
}

function hasCanopyRoom(x: number, z: number, scale: number, path: ReturnType<typeof nearestPath>): boolean {
  const nx = (path.x - x) / path.distance, nz = (path.z - z) / path.distance;
  // The selected trail shape is upright and faces inward. Its actual footprint
  // keeps pads clear without reserving the obsolete, much larger canopy envelope.
  const clears = (px: number, pz: number, radius: number) => {
    const dx = px - x, dz = pz - z;
    const along = dx * nx + dz * nz, sideways = -dx * nz + dz * nx;
    return trailFootprint.every(box => Math.hypot(
      Math.max(box.minX * scale - 1 - along, 0, along - box.maxX * scale - 1),
      Math.max(box.minZ * scale - 1 - sideways, 0, sideways - box.maxZ * scale - 1),
    ) > radius);
  };
  return ZONES.every(zone => clears(zone.position.x, zone.position.z, zone.radius + 1))
    && sunGaps.every(point => clears(point.x, point.z, 9));
}

function randomFor(key: string): () => number {
  let state = TERRAIN_SEED;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function biomeAtProgress(t: number): Biome {
  // The coastal ticket includes the short lead-in before the nearest-zone split.
  if (t >= 0.82) return "coast-dusk";
  return ZONES.reduce((best, zone) => Math.abs(zone.t - t) < Math.abs(best.t - t) ? zone : best).biome;
}

/** Nearest zone in walking distance; no separate biome map to drift from layout. */
export function foliageBiomeAt(x: number, z: number): Biome {
  return biomeAtProgress(nearestPath(x, z).t);
}

/** Walking-left normal (fz, -fx), including bends near the last station. */
function coastInlandDistance(x: number, z: number, path: ReturnType<typeof nearestPath>): number {
  const index = Math.min(PATH_SAMPLES.length - 2, Math.floor(path.t * (PATH_SAMPLES.length - 1)));
  const a = PATH_SAMPLES[index]!, b = PATH_SAMPLES[index + 1]!;
  const nx = b.z - a.z, nz = a.x - b.x;
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
    || (biomeAtProgress(path.t) === "forest-dawn" && sunGaps.some(point => Math.hypot(x - point.x, z - point.z) < 13))
    || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < BRIDGE_CLEARANCE);
}

/** World-space prop footprints supplied by compose; no mutable global bounds. */
export function isGroundCoverExcluded(x: number, z: number, zoneBounds: readonly Box3[] = [], radius = 0): boolean {
  const path = nearestPath(x, z), height = worldHeight(x, z);
  return height < SHORE_MIN_HEIGHT || height <= waterLevelAt(z) + 0.15
    || path.distance < PATH_WIDTH / 2 + 0.3 + radius
    || nearestRiver(x, z).distance < RIVER_CLEARANCE + radius
    || Math.hypot(x - trailCanopySpawn.x, z - trailCanopySpawn.z) < 2 + radius
    || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < BRIDGE_CLEARANCE + radius)
    || zoneBounds.some(box => x >= box.min.x - 0.4 - radius && x <= box.max.x + 0.4 + radius
      && z >= box.min.z - 0.4 - radius && z <= box.max.z + 0.4 + radius);
}

interface Candidate { x: number; z: number; priority: number; scale: number; kind: FoliageTree["kind"]; lean: number; growth?: "shrub"; canopy?: true; trailCanopy?: true }
interface Clump { x: number; z: number; radius: number }
const CLUMP_SIZE = TILE_SIZE / 2;
const coastalPoints = PATH_SAMPLES.filter(point => point.t >= 0.82);
const coastalTiles = {
  minX: Math.floor((Math.min(...coastalPoints.map(p => p.x)) - 260) / TILE_SIZE),
  maxX: Math.floor((Math.max(...coastalPoints.map(p => p.x)) + 260) / TILE_SIZE),
  minZ: Math.floor((Math.min(...coastalPoints.map(p => p.z)) - 260) / TILE_SIZE),
  maxZ: Math.floor((Math.max(...coastalPoints.map(p => p.z)) + 260) / TILE_SIZE),
};
const forestPoints = PATH_SAMPLES.filter(point => point.t <= forestEdge);
const forestTiles = {
  minX: Math.floor((Math.min(...forestPoints.map(p => p.x)) - 25) / TILE_SIZE),
  maxX: Math.floor((Math.max(...forestPoints.map(p => p.x)) + 25) / TILE_SIZE),
  minZ: Math.floor((Math.min(...forestPoints.map(p => p.z)) - 25) / TILE_SIZE),
  maxZ: Math.floor((Math.max(...forestPoints.map(p => p.z)) + 25) / TILE_SIZE),
};

function onCoastalSlope(x: number, z: number, far = 260, path = nearestPath(x, z)): boolean {
  if (path.t < 0.82 || path.distance > far || coastInlandDistance(x, z, path) < 22) return false;
  // Do not spend the canopy budget on the unseen fan beyond the route's end.
  const end = PATH_SAMPLES[PATH_SAMPLES.length - 1]!, before = PATH_SAMPLES[PATH_SAMPLES.length - 2]!;
  return path.t < 1 || (x - end.x) * (end.x - before.x) + (z - end.z) * (end.z - before.z) <= 0;
}

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
  const coastalTile = ix >= coastalTiles.minX && ix <= coastalTiles.maxX && iz >= coastalTiles.minZ && iz <= coastalTiles.maxZ;
  const forestTile = ix >= forestTiles.minX && ix <= forestTiles.maxX && iz >= forestTiles.minZ && iz <= forestTiles.maxZ;
  for (let i = 0; i < (coastalTile || forestTile ? 720 : 180); i++) {
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
    const inland = path.t >= 0.82 ? coastInlandDistance(x, z, path) : 0;
    const canopy = onCoastalSlope(x, z, 260, path);
    const shoulder = biome === "forest-dawn" && distance >= 4 && distance <= 25;
    if (i >= 180 && !canopy && !shoulder) continue;
    // Extra proposals serve the forest shoulder and coastal slope. Keep the
    // existing hidden-interior reduction instead of filling the whole biome.
    const forestWeight = distance > 40 ? 0.32 : distance > 22 ? 0.85 : 1;
    // Colour comes from the renderer's position hash: favour its deep buckets
    // without another material, mesh, colour override or extra random draws.
    // Keep the established deep-green majority over the shorter coastal field.
    const density = canopy ? (isDeepCrown(x, z) ? 0.98 : 0.16) * (distance > 200 ? 0.25 : 1)
      : biome === "forest-dawn" ? Math.min(1, clump * (shoulder ? 2.4 : forestWeight)) : biome === "hill" ? clump * 0.2
        : inland > 260 ? clump * 0.01 : clump * 0.25;
    if (densityRoll >= density || isFoliageExcluded(x, z)) continue;
    if (biome === "forest-dawn" && clearings.some(c => Math.hypot(x - c.x, z - c.z) < c.radius)) continue;
    const shrub = biome === "coast-dusk" && !canopy;
    const pineChance = biome === "forest-dawn" ? ((forestEdge - path.t) * routeLength <= 40 ? 0.72 : 0.12) : 0.6;
    const kind = shrub || canopy ? "broadleaf" : kindRoll < pineChance ? "pine" : "broadleaf";
    // Test the rendered footprint against the now closer clearings and pads.
    const trailCanopy = shoulder && kind === "broadleaf"
      && Math.hypot(x - trailCanopySpawn.x, z - trailCanopySpawn.z) >= 12
      && hasCanopyRoom(x, z, 1.39 + scaleRoll * 0.01, path);
    // The renderer multiplies trail scale by three. 1.35–1.40 effective scale
    // gives 12–13 m trees with <=1.4x bark width; only their limbs reach inward.
    const trailScale = (1.39 + scaleRoll * 0.01) / 3;
    result.push({ x, z, priority, scale: shrub ? 0.12 + scaleRoll * 0.08 : canopy ? 0.9 + scaleRoll * 0.6 : trailCanopy ? trailScale : 0.8 + scaleRoll * 0.5,
      // Broad crowns overlap in projection up the slope and reuse the coastal
      // shrub species, so the denser coast does not activate extra draw calls.
      kind, lean: trailCanopy ? 0 : lean,
      ...(shrub ? { growth: "shrub" as const } : {}),
      ...(canopy ? { canopy: true as const } : {}),
      ...(trailCanopy ? { trailCanopy: true as const } : {}),
    });
  }
  return result;
}

/**
 * Seeded Poisson candidates with Matérn-II hard-core thinning. The 8-neighbour
 * halo makes the 4 m disk constraint independent of tile loading order, even
 * across seams, independently of quality and mutable random state.
 */
function poissonCandidates(ix: number, iz: number, getCandidates = candidates): Candidate[] {
  const own = getCandidates(ix, iz);
  const halo: Candidate[] = [...own];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dx || dz) halo.push(...getCandidates(ix + dx, iz + dz));
  }
  return own.filter(a => !halo.some(b => b !== a
    && (b.priority < a.priority || (b.priority === a.priority && (b.x < a.x || (b.x === a.x && b.z < a.z))))
    && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < MIN_TREE_DISTANCE ** 2));
}

const candidateKey = (tree: Candidate) => `${tree.x}:${tree.z}`;
let coastalSelection: ReadonlySet<string> | undefined;
let windbreak: readonly FoliageTree[] | undefined;

/** Two staggered, irregular shelter belts follow the dry inland bank. World
 * coordinates and clearance tests are shared by every tile and quality level. */
export function coastalWindbreakSites(): readonly FoliageTree[] {
  if (windbreak) return windbreak;
  const random = randomFor("hr-casuarina-windbreak"), sites: FoliageTree[] = [];
  for (let row = 0; row < 2; row++) {
    let distance = routeLength * 0.835 + row * 4;
    while (distance < routeLength - 3) {
      const t = distance / routeLength, p = pathPointAt(t), next = pathPointAt(Math.min(1, t + 0.002));
      const dx = next.x - p.x, dz = next.z - p.z, length = Math.hypot(dx, dz);
      const inland = 28 + row * 16 + (random() - 0.5) * 7;
      const x = p.x + dz / length * inland, z = p.z - dx / length * inland;
      const y = worldHeight(x, z), scale = 0.91 + random() * 0.12;
      if (!isFoliageExcluded(x, z) && y >= SHORE_MIN_HEIGHT
        && sites.every(other => Math.hypot(other.x - x, other.z - z) >= MIN_TREE_DISTANCE)) {
        sites.push({ x, y, z, scale, kind: "broadleaf", lean: (random() - 0.5) * 0.025 });
      }
      distance += 8 + random() * 6;
    }
  }
  windbreak = sites;
  return windbreak;
}

/** A fixed, finite coastal field keeps the row veto independent of tile order.
 * Only selected position keys survive initialization; candidate/coverage working
 * sets are released. Neither quality nor loaded tiles can change this field.
 */
function selectedCoastalCanopy(): ReadonlySet<string> {
  if (coastalSelection) return coastalSelection;
  const cache = new Map<string, Candidate[]>();
  const getCandidates = (ix: number, iz: number) => {
    const key = tileKey(ix, iz);
    if (!cache.has(key)) cache.set(key, candidates(ix, iz));
    return cache.get(key)!;
  };
  const pool: { tree: Candidate; cells: string[]; farBand: number }[] = [];
  for (let ix = coastalTiles.minX; ix <= coastalTiles.maxX; ix++) for (let iz = coastalTiles.minZ; iz <= coastalTiles.maxZ; iz++) {
    for (const tree of poissonCandidates(ix, iz, getCandidates).filter(tree => tree.canopy)) {
      const cells: string[] = [];
      // Rank existing random positions by new broad-crown footprint, rather
      // than putting trunks on a grid. Two phases avoid favouring grid seams.
      const radius = 2.1 * tree.scale;
      for (const phase of [0, 5]) {
        for (let x = Math.floor((tree.x - radius - phase) / 10) * 10 + phase; x <= tree.x + radius; x += 10) {
          for (let z = Math.floor((tree.z - radius - phase) / 10) * 10 + phase; z <= tree.z + radius; z += 10) {
            if (onCoastalSlope(x + 5, z + 5, 200)
              && Math.hypot(Math.max(x - tree.x, 0, tree.x - x - 10), Math.max(z - tree.z, 0, tree.z - z - 10)) <= radius) {
              cells.push(`${phase}:${x},${z}`);
            }
          }
        }
      }
      const path = nearestPath(tree.x, tree.z);
      pool.push({ tree, cells, farBand: path.distance >= 200 ? Math.min(2, Math.floor((path.t - 0.82) / 0.06)) : -1 });
    }
  }
  const buckets = new Map<string, Candidate[]>();
  const selected: Candidate[] = [];
  const occupied = new Set<string>();
  const farBands = new Set<number>();
  const following = (a: Candidate, b: Candidate): Candidate[] => {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const x = b.x + dx, z = b.z + dz, reach = length * 0.18;
    const result: Candidate[] = [];
    for (let ix = Math.floor((x - reach) / 16); ix <= Math.floor((x + reach) / 16); ix++) {
      for (let iz = Math.floor((z - reach) / 16); iz <= Math.floor((z + reach) / 16); iz++) {
        for (const c of buckets.get(tileKey(ix, iz)) ?? []) {
          const cx = c.x - b.x, cz = c.z - b.z, distance = Math.hypot(cx, cz);
          // 11.2% also catches the reverse of a step shortened by 10%.
          if (Math.abs(distance / length - 1) < 0.112
            && (dx * cx + dz * cz) / (length * distance) > Math.cos(Math.PI / 60)) result.push(c);
        }
      }
    }
    return result;
  };
  while (pool.length) {
    let best = 0, score = -1;
    for (let i = 0; i < pool.length; i++) {
      const { cells, farBand } = pool[i]!;
      // Reserve a far-shoulder tree in each available third before filling gaps.
      const value = cells.filter(key => !occupied.has(key)).length + (farBand >= 0 && !farBands.has(farBand) ? 10 : 0);
      if (value > score) { score = value; best = i; }
    }
    const { tree, cells, farBand } = pool.splice(best, 1)[0]!;
    // A new tree can finish a row or lie inside it. Reversing the row covers
    // the other two positions, including rows spanning multiple terrain tiles.
    if (selected.some(b => {
      const before = following(tree, b);
      return before.some(a => following(b, a).length > 0)
        || (before.length > 0 && following(b, tree).length > 0);
    })) continue;
    selected.push(tree);
    if (farBand >= 0) farBands.add(farBand);
    for (const key of cells) occupied.add(key);
    const key = tileKey(Math.floor(tree.x / 16), Math.floor(tree.z / 16));
    const bucket = buckets.get(key) ?? [];
    bucket.push(tree);
    buckets.set(key, bucket);
  }
  coastalSelection = new Set(selected.map(candidateKey));
  return coastalSelection;
}

export function scatterTile(tile: TileAddress | TerrainTile): FoliageTree[] {
  const ix = "ix" in tile ? tile.ix : tile.origin.x / TILE_SIZE;
  const iz = "iz" in tile ? tile.iz : tile.origin.z / TILE_SIZE;
  tileKey(ix, iz);
  if ("size" in tile && tile.size !== TILE_SIZE) throw new RangeError("Foliage requires standard terrain tiles");
  const belt = coastalWindbreakSites();
  const trees: FoliageTree[] = poissonCandidates(ix, iz)
    .filter(tree => !tree.canopy || selectedCoastalCanopy().has(candidateKey(tree)))
    .filter(tree => belt.every(other => Math.hypot(tree.x - other.x, tree.z - other.z) >= MIN_TREE_DISTANCE))
    .map(({ x, z, scale, kind, lean, growth, trailCanopy }) => ({ x, z, y: worldHeight(x, z), scale, kind, lean,
      ...(growth ? { growth } : {}),
      ...(trailCanopy ? { trailCanopy } : {}),
    }));
  return [...trees, ...belt.filter(tree => Math.floor(tree.x / TILE_SIZE) === ix && Math.floor(tree.z / TILE_SIZE) === iz)];
}
