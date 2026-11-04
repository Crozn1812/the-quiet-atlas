import { pathLength, pathPointAt } from "../layout/path";
import { clampProgress } from "../layout/river";
import { TILE_SIZE, tileKey, tilesForPathRange, type TileAddress } from "./tiles";

/** Desired resident set, not a fetch queue. t is normalized WALKING distance. */
export function tilesToLoad(playerT: number, aheadM = 120, behindM = 60): TileAddress[] {
  const t = clampProgress(playerT);
  if (![aheadM, behindM].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError("Streaming distances must be finite and non-negative");
  const distance = t * pathLength();
  const tiles = tilesForPathRange(distance - behindM, distance + aheadM);
  // Explicitly include the true spline point, even with a zero-length window.
  const player = pathPointAt(t);
  const underfoot = { ix: Math.floor(player.x / TILE_SIZE), iz: Math.floor(player.z / TILE_SIZE) };
  if (!tiles.some(tile => tile.ix === underfoot.ix && tile.iz === underfoot.iz)) tiles.push(underfoot);
  return tiles;
}

/** Subtract the desired set from caller-owned residents; does not mutate or cache. */
export function tilesToUnload(playerT: number, loaded: Iterable<TileAddress>, aheadM = 120, behindM = 60): TileAddress[] {
  const keep = new Set(tilesToLoad(playerT, aheadM, behindM).map(tile => tileKey(tile.ix, tile.iz)));
  const unload = new Map<string, TileAddress>();
  for (const tile of loaded) {
    const key = tileKey(tile.ix, tile.iz);
    if (!keep.has(key)) unload.set(key, { ix: tile.ix, iz: tile.iz });
  }
  return [...unload.values()];
}
