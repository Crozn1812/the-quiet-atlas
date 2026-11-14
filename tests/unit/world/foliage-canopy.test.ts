import { reportBudget } from "./report-budget";
import { expect, it } from "vitest";
import { createFoliage, foliageVariantAt } from "../../../src/features/world/foliage/instances";
import { MIN_TREE_DISTANCE, scatterTile, type FoliageTree } from "../../../src/features/world/foliage/scatter";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";

const wideTiles = tilesAlongPath(240);
const wideForests = wideTiles.map(scatterTile);
const forest = wideForests.flat();
const extended = tilesAlongPath(280).flatMap(scatterTile);

function position(point: { x: number; z: number }) {
  const path = nearestPath(point.x, point.z);
  const a = pathPointAt(Math.max(0, path.t - 0.00001));
  const b = pathPointAt(Math.min(1, path.t + 0.00001));
  const dx = b.x - a.x, dz = b.z - a.z;
  const along = ((point.x - path.x) * dx + (point.z - path.z) * dz) / Math.hypot(dx, dz);
  return { ...path, along, left: ((point.x - path.x) * dz - (point.z - path.z) * dx) / Math.hypot(dx, dz) };
}

const canopy = extended.filter(tree => {
  const p = position(tree);
  return p.t >= 0.82 && p.left >= 22 && p.distance <= 260 && tree.growth !== "shrub" && (p.t < 1 || p.along <= 0);
});

it("closes 85% of 10 m coastal hillside cells with real crown radii, including the upper slope", () => {
  const foliage = createFoliage(canopy.length);
  try {
    const crowns = canopy.map(tree => {
      const variants = foliage.species[tree.kind].variants;
      const geometry = variants[foliageVariantAt(tree.x, tree.z, variants.length)]!.crowns.geometry;
      const vertices = geometry.getAttribute("position");
      let radius = 0;
      for (let i = 0; i < vertices.count; i++) radius = Math.max(radius, Math.hypot(vertices.getX(i), vertices.getZ(i)) * tree.scale);
      return { x: tree.x - Math.sin(tree.lean) * 5 * tree.scale, z: tree.z, radius };
    });
    // Independent world-space square grids; a cell is occupied when a crown
    // disk intersects it, including crowns rooted in neighbouring cells/tiles.
    for (const phase of [0, 5]) {
      const cells = new Map<string, { x: number; z: number }>();
      for (const tile of wideTiles) {
        for (let x = Math.floor(tile.ix * TILE_SIZE / 10) * 10 + phase; x < (tile.ix + 1) * TILE_SIZE; x += 10) {
          for (let z = Math.floor(tile.iz * TILE_SIZE / 10) * 10 + phase; z < (tile.iz + 1) * TILE_SIZE; z += 10) {
            const p = position({ x: x + 5, z: z + 5 });
            if (p.t >= 0.82 && p.left >= 22 && p.distance <= 200 && (p.t < 1 || p.along <= 0)) cells.set(`${x},${z}`, { x, z });
          }
        }
      }
      const covered = [...cells.values()].filter(cell => crowns.some(crown =>
        Math.hypot(Math.max(cell.x - crown.x, 0, crown.x - cell.x - 10),
          Math.max(cell.z - crown.z, 0, crown.z - cell.z - 10)) <= crown.radius)).length;
      process.stdout.write(`B2-159 grid phase=${phase}: ${covered}/${cells.size} = ${(covered / cells.size * 100).toFixed(2)}%; instances=${forest.length}/3551; canopy=${canopy.length}\n`);
      expect(covered / cells.size).toBeGreaterThanOrEqual(0.85);
    }
    expect(canopy.filter(tree => position(tree).distance >= 200).length).toBeGreaterThan(0);
  } finally { foliage.dispose(); }
});

it("stays within +25% of 2841 instances and reuses the existing mesh draws", () => {
  reportBudget("tests/unit/world/foliage-canopy.test.ts:61 forest.length", forest.length, Math.floor(2841 * 1.25));
  const foliage = createFoliage(forest.length);
  try {
    foliage.setTiles(forest);
    expect(foliage.group.children).toHaveLength(10);
    expect(foliage.group.children.filter(mesh => "count" in mesh && Number(mesh.count) > 0)).toHaveLength(10);
    // compose.ts renders a foliage group per terrain tile. Count every active
    // trunk/crown variant, not just the shared factory's ten mesh slots.
    const draws = wideForests.reduce((sum, trees) => sum + 2 * new Set(trees.map(tree =>
      `${tree.kind}:${foliageVariantAt(tree.x, tree.z, foliage.species[tree.kind].variants.length)}`)).size, 0);
    // Measured on HEAD before B2-159 over these same 240 m corridor tiles.
    reportBudget("tests/unit/world/foliage-canopy.test.ts:72 draws", draws, 1246);
    process.stdout.write(`B2-159 instances: 2046 -> ${forest.length}; old cap=2841, +25% cap=3551; active mesh draws: 1246 -> ${draws}\n`);
  } finally { foliage.dispose(); }
});

it("keeps mixed tree sizes up to and beyond the crest, clears walking-right, and preserves seam spacing", () => {
  for (const [low, high] of [[0.9, 1.1], [1.1, 1.3], [1.3, 1.5]] as const) {
    expect(canopy.filter(tree => tree.scale >= low && tree.scale < high).length).toBeGreaterThan(5);
  }
  // ADR 0017: remote hillside trees can now project onto the previous bend.
  // Inspect the three physical coastal thirds, including trees on that bend.
  const coastStart = pathPointAt(0.82), coastEnd = pathPointAt(1);
  const span = coastStart.distanceTo(coastEnd), forward = coastEnd.sub(coastStart).normalize();
  for (let third = 0; third < 3; third++) {
    expect(extended.filter(tree => {
      const along = (tree.x - coastStart.x) * forward.x + (tree.z - coastStart.z) * forward.z;
      return tree.growth !== "shrub" && position(tree).distance >= 100
        && along >= third * span / 3 && along < (third + 1) * span / 3;
    }).length).toBeGreaterThan(0);
  }
  expect(canopy.filter(tree => tree.y >= 35 && position(tree).distance <= 160).length).toBeGreaterThan(10);
  expect(extended.filter(tree => {
    const p = position(tree);
    return p.t >= 0.82 && p.left < 0 && tree.growth !== "shrub";
  })).toHaveLength(0);
  let minDistance = Infinity;
  for (const tree of canopy) for (const other of extended) {
    if (tree === other) continue;
    minDistance = Math.min(minDistance, Math.hypot(tree.x - other.x, tree.z - other.z));
  }
  expect(minDistance).toBeGreaterThanOrEqual(MIN_TREE_DISTANCE - 1e-10);
  for (let i = wideTiles.length - 1; i >= 0; i--) expect(scatterTile(wideTiles[i]!)).toEqual(wideForests[i]);
  process.stdout.write(`B2-159 far shoulder (200-260 m): ${canopy.filter(tree => position(tree).distance >= 200).length} trees\n`);
});

it("has no four equally spaced coastal trees aligned within three degrees", () => {
  const buckets = new Map<string, FoliageTree[]>();
  for (const tree of canopy) {
    const key = `${Math.floor(tree.x / 16)},${Math.floor(tree.z / 16)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), tree]);
  }
  const following = (a: FoliageTree, b: FoliageTree) => {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const x = b.x + dx, z = b.z + dz, reach = length * 0.16;
    const result: FoliageTree[] = [];
    for (let ix = Math.floor((x - reach) / 16); ix <= Math.floor((x + reach) / 16); ix++) {
      for (let iz = Math.floor((z - reach) / 16); iz <= Math.floor((z + reach) / 16); iz++) {
        for (const c of buckets.get(`${ix},${iz}`) ?? []) {
          const cx = c.x - b.x, cz = c.z - b.z, distance = Math.hypot(cx, cz);
          if (Math.abs(distance / length - 1) < 0.1 && (dx * cx + dz * cz) / (length * distance) > Math.cos(Math.PI / 60)) result.push(c);
        }
      }
    }
    return result;
  };
  let rows = 0;
  for (const a of canopy) for (const b of canopy) {
    if (a === b) continue;
    for (const c of following(a, b)) rows += following(b, c).length;
  }
  process.stdout.write(`B2-159 aligned rows=${rows}\n`);
  expect(rows).toBe(0);
});
