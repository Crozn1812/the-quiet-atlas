import { pathLength, pathPointAt } from "../layout/path";
import { worldHeight } from "./height";
import { distanceToBoundsSquared, PATH_SAMPLES, segmentFraction } from "./samples";

export const TILE_SIZE = 64;
export const TILE_CELLS = 32;
export const TILE_STRIDE = TILE_CELLS + 1;
export const TILE_HEIGHT_BYTES = TILE_STRIDE ** 2 * Float32Array.BYTES_PER_ELEMENT;
export const TERRAIN_RADIUS = 32;

export interface TileAddress { readonly ix: number; readonly iz: number }
export interface TerrainTile {
  readonly heights: Float32Array;
  readonly size: number;
  readonly cells: number;
  /** Minimum XZ corner, in metres. Rapier translation is origin + size / 2 in XZ. */
  readonly origin: Readonly<{ x: number; y: number; z: number }>;
}

export function tileKey(ix: number, iz: number): string {
  if (!Number.isSafeInteger(ix) || !Number.isSafeInteger(iz)) throw new RangeError("Tile indices must be safe integers");
  return `${ix},${iz}`;
}

export function buildTile(ix: number, iz: number): TerrainTile {
  tileKey(ix, iz);
  const origin = { x: ix * TILE_SIZE, y: 0, z: iz * TILE_SIZE };
  const heights = new Float32Array(TILE_STRIDE ** 2);
  for (let x = 0; x <= TILE_CELLS; x++) for (let z = 0; z <= TILE_CELLS; z++) {
    // Rapier column-major. Mesh and collider must consume this SAME array.
    heights[z + x * TILE_STRIDE] = worldHeight(origin.x + x * 2, origin.z + z * 2);
  }
  return { heights, size: TILE_SIZE, cells: TILE_CELLS, origin };
}

type Point = (typeof PATH_SAMPLES)[number];

function touchesTile(a: Point, b: Point, ix: number, iz: number, radius: number): boolean {
  const bounds = { minX: ix * TILE_SIZE, maxX: (ix + 1) * TILE_SIZE, minZ: iz * TILE_SIZE, maxZ: (iz + 1) * TILE_SIZE };
  let low = 0;
  let high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, bounds.minX, bounds.maxX],
    [a.z, b.z - a.z, bounds.minZ, bounds.maxZ],
  ] as const) {
    if (delta === 0) {
      if (start < min || start > max) { high = -1; break; }
    } else {
      const u = (min - start) / delta;
      const v = (max - start) / delta;
      low = Math.max(low, Math.min(u, v));
      high = Math.min(high, Math.max(u, v));
    }
  }
  if (low <= high) return true;
  let squared = Math.min(distanceToBoundsSquared(a.x, a.z, bounds), distanceToBoundsSquared(b.x, b.z, bounds));
  for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) {
    const u = segmentFraction(x, z, a, b);
    squared = Math.min(squared, (x - a.x - (b.x - a.x) * u) ** 2 + (z - a.z - (b.z - a.z) * u) ** 2);
  }
  return squared <= radius * radius;
}

/** Conservative sub-metre polyline coverage, including exact interval endpoints. */
export function tilesForPathRange(startM: number, endM: number, radiusM = TERRAIN_RADIUS): TileAddress[] {
  if (![startM, endM, radiusM].every(Number.isFinite) || radiusM < 0) throw new RangeError("Tile distances must be finite and radius non-negative");
  const length = pathLength();
  const start = Math.max(0, Math.min(length, startM)) / length;
  const end = Math.max(start, Math.max(0, Math.min(length, endM)) / length);
  const point = (t: number): Point => ({ ...pathPointAt(t), t });
  const points = [point(start), ...PATH_SAMPLES.filter(p => p.t > start && p.t < end), point(end)];
  const tiles = new Map<string, TileAddress>();
  // 2 cm covers chord error between samples, including at radius zero.
  const radius = radiusM + 0.02;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    for (let ix = Math.floor((Math.min(a.x, b.x) - radius) / TILE_SIZE); ix <= Math.floor((Math.max(a.x, b.x) + radius) / TILE_SIZE); ix++) {
      for (let iz = Math.floor((Math.min(a.z, b.z) - radius) / TILE_SIZE); iz <= Math.floor((Math.max(a.z, b.z) + radius) / TILE_SIZE); iz++) {
        const key = tileKey(ix, iz);
        if (!tiles.has(key) && touchesTile(a, b, ix, iz, radius)) tiles.set(key, { ix, iz });
      }
    }
  }
  return [...tiles.values()].sort((a, b) => a.ix - b.ix || a.iz - b.iz);
}

/** All tiles intersecting a radius-metre corridor around the complete walking route. */
export function tilesAlongPath(radiusM = TERRAIN_RADIUS): TileAddress[] {
  return tilesForPathRange(0, pathLength(), radiusM);
}
