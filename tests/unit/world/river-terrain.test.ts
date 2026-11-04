import { describe, expect, it } from "vitest";
import { pathLength, pathPointAt, PATH_BRIDGES } from "../../../src/features/world/layout/path";
import { riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { tilesToLoad, tilesToUnload } from "../../../src/features/world/terrain/streaming";
import {
  buildTile, TILE_CELLS, TILE_HEIGHT_BYTES, TILE_SIZE, TILE_STRIDE,
  tileKey, tilesAlongPath, type TileAddress,
} from "../../../src/features/world/terrain/tiles";

const keys = (tiles: Iterable<TileAddress>) => new Set(Array.from(tiles, tile => tileKey(tile.ix, tile.iz)));

describe("river terrain heightmap", () => {
  it("is deterministic across interleaved queries and independently built tiles", () => {
    const points = Array.from({ length: 501 }, (_, i) => ({ x: -140 + i * 0.6, z: -i * 2 }));
    const first = points.map(p => worldHeight(p.x, p.z));
    for (const point of [...points].reverse()) worldHeight(point.x, point.z);
    expect(points.map(p => worldHeight(p.x, p.z))).toEqual(first);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(buildTile(-1, -7).heights).toEqual(buildTile(-1, -7).heights);
  });

  it("keeps the walking grade below 20% at 500 samples including bridge approaches", () => {
    let previous = pathPointAt(0);
    let previousHeight = worldHeight(previous.x, previous.z);
    let maxGrade = 0;
    for (let i = 1; i <= 500; i++) {
      const point = pathPointAt(i / 500);
      const height = worldHeight(point.x, point.z);
      maxGrade = Math.max(maxGrade, Math.abs(height - previousHeight) / point.distanceTo(previous));
      previous = point;
      previousHeight = height;
    }
    expect(maxGrade).toBeLessThanOrEqual(0.2);
    // Probe the ford transitions at much finer spacing than the required sweep.
    for (const bridge of PATH_BRIDGES) for (let i = -200; i <= 200; i++) {
      const t = bridge.t + i * 0.05 / pathLength();
      const a = pathPointAt(t);
      const b = pathPointAt(t + 0.05 / pathLength());
      expect(Math.abs(worldHeight(b.x, b.z) - worldHeight(a.x, a.z)) / a.distanceTo(b)).toBeLessThanOrEqual(0.2);
    }
  });

  it("flattens a 3 m walking strip across the path", () => {
    for (let i = 1; i < 100; i++) {
      const t = i / 100;
      const point = pathPointAt(t);
      const before = pathPointAt(t - 0.00001);
      const after = pathPointAt(t + 0.00001);
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const length = Math.hypot(dx, dz);
      const centre = worldHeight(point.x, point.z);
      for (const side of [-1, 1]) {
        const bank = worldHeight(point.x - dz / length * 1.5 * side, point.z + dx / length * 1.5 * side);
        expect(Math.abs(bank - centre)).toBeLessThan(0.01);
      }
    }
  });

  it("also keeps walking grade below 20% on the triangulated 2 m heightfield", () => {
    const cache = new Map<string, ReturnType<typeof buildTile>>();
    const heightAt = (x: number, z: number) => {
      const ix = Math.floor(x / TILE_SIZE);
      const iz = Math.floor(z / TILE_SIZE);
      const key = tileKey(ix, iz);
      if (!cache.has(key)) cache.set(key, buildTile(ix, iz));
      const tile = cache.get(key)!;
      const fx = (x - tile.origin.x) / 2;
      const fz = (z - tile.origin.z) / 2;
      const cx = Math.min(TILE_CELLS - 1, Math.floor(fx));
      const cz = Math.min(TILE_CELLS - 1, Math.floor(fz));
      const tx = fx - cx;
      const tz = fz - cz;
      const a = tile.heights[cz + cx * TILE_STRIDE]!;
      const b = tile.heights[cz + (cx + 1) * TILE_STRIDE]!;
      const c = tile.heights[cz + 1 + cx * TILE_STRIDE]!;
      const d = tile.heights[cz + 1 + (cx + 1) * TILE_STRIDE]!;
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    };
    let previous = pathPointAt(0);
    let previousHeight = heightAt(previous.x, previous.z);
    for (let i = 1; i <= 500; i++) {
      const point = pathPointAt(i / 500);
      const height = heightAt(point.x, point.z);
      expect(Math.abs(height - previousHeight) / point.distanceTo(previous)).toBeLessThanOrEqual(0.2);
      previous = point;
      previousHeight = height;
    }
  });

  it("cuts the river at least 0.6 m below BOTH banks at 100 samples before the coast", () => {
    for (let i = 0; i < 100; i++) {
      const t = i / 99 * 0.82;
      const point = riverPointAt(t);
      const tangent = riverTangentAt(t);
      const centre = worldHeight(point.x, point.z);
      for (const side of [-1, 1]) {
        const bank = worldHeight(point.x - tangent.z * 8 * side, point.z + tangent.x * 8 * side);
        expect(bank - centre, `river t=${t}, side=${side}`).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it("lowers the whole Last Postcard area to the beach and reaches sea level", () => {
    const zone = ZONES.find(zone => zone.id === "last-postcard")!;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const x = zone.position.x + Math.cos(angle) * zone.radius;
      const z = zone.position.z + Math.sin(angle) * zone.radius;
      expect(Math.abs(worldHeight(x, z))).toBeLessThan(0.25);
    }
    expect(Math.abs(worldHeight(zone.position.x, zone.position.z))).toBeLessThan(0.01);
    expect(worldHeight(0, -920)).toBe(0);
    expect(worldHeight(0, -300)).toBeGreaterThan(worldHeight(0, -850));
  });

  it("grows seeded moderate hills beyond the river banks", () => {
    const centre = riverPointAt(0.1);
    const tangent = riverTangentAt(0.1);
    for (const side of [-1, 1]) {
      const bank = worldHeight(centre.x - tangent.z * 8 * side, centre.z + tangent.x * 8 * side);
      const hill = worldHeight(centre.x - tangent.z * 70 * side, centre.z + tangent.x * 70 * side);
      expect(hill - bank).toBeGreaterThan(1);
      expect(hill - bank).toBeLessThan(5);
    }
  });
});

describe("64 m terrain tiles", () => {
  it("stores 33 by 33 absolute world heights in Rapier column-major order", () => {
    const tile = buildTile(-1, -5);
    expect(tile.origin).toEqual({ x: -64, y: 0, z: -320 });
    expect(tile.size).toBe(64);
    expect(tile.cells).toBe(32);
    expect(tile.heights).toBeInstanceOf(Float32Array);
    expect(tile.heights.length).toBe(33 * 33);
    expect(tile.heights.byteLength).toBe(4356);
    for (let x = 0; x <= TILE_CELLS; x++) for (let z = 0; z <= TILE_CELLS; z++) {
      expect(tile.heights[z + x * TILE_STRIDE]).toBe(Math.fround(worldHeight(tile.origin.x + x * 2, tile.origin.z + z * 2)));
    }
  });

  it("shares bit-identical vertices on X and Z seams including negative indices", () => {
    for (const [ix, iz] of [[-2, -5], [-1, -1], [0, 0], [1, -14]] as const) {
      const a = buildTile(ix, iz).heights;
      const east = buildTile(ix + 1, iz).heights;
      const south = buildTile(ix, iz + 1).heights;
      for (let i = 0; i < TILE_STRIDE; i++) {
        expect(a[i + TILE_CELLS * TILE_STRIDE]).toBe(east[i]);
        expect(a[TILE_CELLS + i * TILE_STRIDE]).toBe(south[i * TILE_STRIDE]);
      }
    }
  });

  it("covers the full route and corridor with a reasonable RAM budget", () => {
    const tiles = tilesAlongPath(32);
    const all = keys(tiles);
    expect(all.size).toBe(tiles.length);
    expect(tiles).toEqual(tilesAlongPath(32));
    expect(tiles.length).toBeGreaterThan(25);
    expect(tiles.length).toBeLessThan(100);
    expect(TILE_HEIGHT_BYTES).toBe(4356);
    expect(tiles.length * TILE_HEIGHT_BYTES).toBeLessThan(1024 * 1024);
    for (let i = 0; i <= 500; i++) {
      const p = pathPointAt(i / 500);
      for (const [dx, dz] of [[0, 0], [32, 0], [-32, 0], [0, 32], [0, -32]]) {
        expect(all.has(tileKey(Math.floor((p.x + dx!) / TILE_SIZE), Math.floor((p.z + dz!) / TILE_SIZE)))).toBe(true);
      }
    }
    console.info(`Terrain: ${tiles.length} tiles (32 m radius), ${TILE_HEIGHT_BYTES} bytes/tile, ${tiles.length * TILE_HEIGHT_BYTES} bytes total heightfields, 0 download bytes`);
  });
});

describe("distance-based tile streaming", () => {
  it("always contains the tile underfoot, including endpoints and zero windows", () => {
    const all = keys(tilesAlongPath());
    for (let i = 0; i <= 500; i++) {
      const t = i / 500;
      const point = pathPointAt(t);
      const underfoot = tileKey(Math.floor(point.x / TILE_SIZE), Math.floor(point.z / TILE_SIZE));
      const loaded = keys(tilesToLoad(t));
      expect(loaded.has(underfoot)).toBe(true);
      expect([...loaded].every(key => all.has(key))).toBe(true);
      expect(keys(tilesToLoad(t, 0, 0)).has(underfoot)).toBe(true);
    }
  });

  it("uses metres along the walking route for ahead and behind windows", () => {
    const t = 0.5;
    const loaded = keys(tilesToLoad(t));
    for (let offset = -60; offset <= 120; offset++) {
      const point = pathPointAt(t + offset / pathLength());
      expect(loaded.has(tileKey(Math.floor(point.x / TILE_SIZE), Math.floor(point.z / TILE_SIZE)))).toBe(true);
    }
    const distant = pathPointAt(0.9);
    expect(loaded.has(tileKey(Math.floor(distant.x / TILE_SIZE), Math.floor(distant.z / TILE_SIZE)))).toBe(false);
    expect(keys(tilesToLoad(t, 240, 60)).size).toBeGreaterThan(loaded.size);
    expect(tilesToLoad(-1)).toEqual(tilesToLoad(0));
    expect(tilesToLoad(2)).toEqual(tilesToLoad(1));
  });

  it("returns only obsolete residents without mutating caller state, also when backtracking", () => {
    for (const [from, to] of [[0.1, 0.8], [0.8, 0.1]]) {
      const residents = tilesToLoad(from!);
      const snapshot = JSON.stringify(residents);
      const obsolete = keys(tilesToUnload(to!, residents));
      const desired = keys(tilesToLoad(to!));
      expect(obsolete).toEqual(new Set([...keys(residents)].filter(key => !desired.has(key))));
      expect(obsolete.size).toBeGreaterThan(0);
      expect(JSON.stringify(residents)).toBe(snapshot);
      expect(tilesToUnload(to!, tilesToLoad(to!))).toEqual([]);
    }
  });

  it("rejects non-finite coordinates, fractional indices and invalid distances", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => worldHeight(invalid, 0)).toThrow(RangeError);
      expect(() => worldHeight(0, invalid)).toThrow(RangeError);
      expect(() => tilesToLoad(invalid)).toThrow(RangeError);
      expect(() => tilesToLoad(0, invalid)).toThrow(RangeError);
      expect(() => tilesToLoad(0, 120, invalid)).toThrow(RangeError);
      expect(() => tilesAlongPath(invalid)).toThrow(RangeError);
    }
    expect(() => tileKey(0.5, 0)).toThrow(RangeError);
    expect(() => buildTile(0, 0.5)).toThrow(RangeError);
    expect(() => tilesAlongPath(-1)).toThrow(RangeError);
    expect(() => tilesToLoad(0, -1)).toThrow(RangeError);
  });
});
