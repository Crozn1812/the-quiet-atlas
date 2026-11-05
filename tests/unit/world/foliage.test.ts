import RAPIER from "@dimforge/rapier3d-compat";
import { Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createFoliageColliders, TRUNK_RADIUS } from "../../../src/features/world/foliage/colliders";
import { createFoliage, foliageVariantAt } from "../../../src/features/world/foliage/instances";
import { foliageBiomeAt, MIN_TREE_DISTANCE, scatterTile, SHORE_MIN_HEIGHT, type FoliageTree } from "../../../src/features/world/foliage/scatter";
import { PATH_BRIDGES, pathPointAt } from "../../../src/features/world/layout/path";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE, tileKey, tilesAlongPath } from "../../../src/features/world/terrain/tiles";
import { PRESETS, type Quality } from "../../../src/features/world/terrain";

const route = tilesAlongPath();
const tenTiles = Array.from({ length: 10 }, (_, i) => route[Math.floor(i * (route.length - 1) / 9)]!);
const tenForests = tenTiles.map(tile => scatterTile(tile));

function assertSpacing(trees: readonly FoliageTree[]) {
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
    expect(Math.hypot(trees[i]!.x - trees[j]!.x, trees[i]!.z - trees[j]!.z)).toBeGreaterThanOrEqual(MIN_TREE_DISTANCE - 1e-10);
  }
}

describe("tile foliage", () => {
  it("is deterministic for addresses/terrain tiles and independent of tile loading order", () => {
    for (let i = tenTiles.length - 1; i >= 0; i--) {
      const tile = tenTiles[i]!;
      expect(scatterTile(tile)).toEqual(tenForests[i]);
      expect(scatterTile(buildTile(tile.ix, tile.iz))).toEqual(tenForests[i]);
      for (const tree of tenForests[i]!) {
        expect(tree.y).toBe(worldHeight(tree.x, tree.z));
        expect(tree.x).toBeGreaterThanOrEqual(tile.ix * TILE_SIZE);
        expect(tree.x).toBeLessThan((tile.ix + 1) * TILE_SIZE);
        expect(tree.z).toBeGreaterThanOrEqual(tile.iz * TILE_SIZE);
        expect(tree.z).toBeLessThan((tile.iz + 1) * TILE_SIZE);
      }
    }
    expect(() => scatterTile({ ix: NaN, iz: 0 })).toThrow(RangeError);
  });

  it("excludes every tree in 10 route tiles from river, path, zones and bridges", () => {
    // Independently measure against dense curve samples rather than reusing the exclusion predicate.
    const path = Array.from({ length: 8193 }, (_, i) => pathPointAt(i / 8192));
    const river = Array.from({ length: 8193 }, (_, i) => riverPointAt(i / 8192));
    const distance = (tree: FoliageTree, points: Vector3[]) => Math.sqrt(points.reduce((best, p) => Math.min(best, (tree.x - p.x) ** 2 + (tree.z - p.z) ** 2), Infinity));
    expect(tenForests.flat().length).toBeGreaterThan(100);
    for (const tree of tenForests.flat()) {
      expect(distance(tree, path)).toBeGreaterThanOrEqual(1.5 + 2.5);
      expect(distance(tree, river)).toBeGreaterThanOrEqual(6 + 3);
      for (const zone of ZONES) expect(Math.hypot(tree.x - zone.position.x, tree.z - zone.position.z)).toBeGreaterThanOrEqual(zone.radius + 4);
      const nearest = nearestPath(tree.x, tree.z);
      for (const bridge of PATH_BRIDGES) {
        if (nearest.t >= bridge.tStart && nearest.t <= bridge.tEnd) expect(nearest.distance).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("respects Poisson spacing within tiles and across a 3-by-3 tile seam", () => {
    for (const trees of tenForests) assertSpacing(trees);
    const block = [];
    for (let ix = -1; ix <= 1; ix++) for (let iz = -3; iz <= -1; iz++) block.push(...scatterTile({ ix, iz }));
    expect(block.length).toBeGreaterThan(100);
    assertSpacing(block);
  });

  it("keeps hills sparse and coast at most 5% of forest density; reports complete route count", () => {
    const stats = { "forest-dawn": { area: 0, count: 0 }, hill: { area: 0, count: 0 }, "coast-dusk": { area: 0, count: 0 } };
    let total = 0;
    for (const tile of route) {
      const trees = scatterTile(tile);
      total += trees.length;
      // Count only tiles wholly in one biome for an equal-area density comparison.
      const biomes = [0, 0.5, 1].flatMap(x => [0, 0.5, 1].map(z => foliageBiomeAt((tile.ix + x) * TILE_SIZE, (tile.iz + z) * TILE_SIZE)));
      const biome = biomes[0]!;
      if (biomes.every(value => value === biome)) { stats[biome].area++; stats[biome].count += trees.length; }
    }
    for (const stat of Object.values(stats)) expect(stat.area).toBeGreaterThan(0);
    const forestDensity = stats["forest-dawn"].count / stats["forest-dawn"].area;
    expect(stats.hill.count / stats.hill.area).toBeLessThan(forestDensity * 0.6);
    expect(stats["coast-dusk"].count / stats["coast-dusk"].area).toBeLessThanOrEqual(forestDensity * 0.05);
    console.info(`B2-018 route: ${total} trees across ${route.length} tiles; density (trees/tile): forest=${forestDensity.toFixed(2)}, hill=${(stats.hill.count / stats.hill.area).toFixed(2)}, coast=${(stats["coast-dusk"].count / stats["coast-dusk"].area).toFixed(2)}`);
  });
});

describe("foliage instances and colliders", () => {
  it("displays evenly distributed 40/70/100% trees with matching transforms and all actual Rapier cylinders unchanged", async () => {
    await RAPIER.init();
    const trees = tenForests.flat();
    const foliage = createFoliage(trees.length);
    foliage.setTiles(trees);
    const colliders = createFoliageColliders(trees);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    for (const c of colliders) world.createCollider(RAPIER.ColliderDesc.cylinder(c.halfHeight, c.radius).setTranslation(c.x, c.y, c.z).setRotation(c.rotation));
    const snapshot = () => {
      const data: unknown[] = [];
      world.forEachCollider(c => data.push({ position: c.translation(), rotation: c.rotation(), radius: c.radius(), halfHeight: c.halfHeight() }));
      return data;
    };
    const original = snapshot();
    const matrix = new Matrix4();
    try {
      for (const quality of ["Low", "Balanced", "High", "Low"] as Quality[]) {
        foliage.setQuality(quality);
        const count = Math.round(trees.length * PRESETS[quality].density);
        const indices = { pine: foliage.species.pine.variants.map(() => 0), broadleaf: foliage.species.broadleaf.variants.map(() => 0) };
        const variants = Object.values(foliage.species).flatMap(s => s.variants);
        expect(variants.reduce((n, s) => n + s.trunks.count, 0)).toBe(count);
        expect(variants.reduce((n, s) => n + s.crowns.count, 0)).toBe(count);
        for (let i = 0; i < count; i++) {
          const index = Math.floor((i + 0.5) * trees.length / count);
          const tree = trees[index]!;
          const species = foliage.species[tree.kind];
          const variantIndex = foliageVariantAt(tree.x, tree.z, species.variants.length);
          const variant = species.variants[variantIndex]!;
          const instanceIndex = indices[tree.kind][variantIndex]!;
          indices[tree.kind][variantIndex] = instanceIndex + 1;
          variant.trunks.getMatrixAt(instanceIndex, matrix);
          const center = new Vector3().setFromMatrixPosition(matrix);
          expect(center.x).toBeCloseTo(colliders[index]!.x, 4);
          expect(center.y).toBeCloseTo(colliders[index]!.y, 4);
          expect(center.z).toBeCloseTo(colliders[index]!.z, 4);
          variant.crowns.getMatrixAt(instanceIndex, matrix);
          center.setFromMatrixPosition(matrix);
          expect(center.x).toBeCloseTo(tree.x - Math.sin(tree.lean) * 5 * tree.scale, 4);
          expect(center.y).toBeCloseTo(tree.y + Math.cos(tree.lean) * 5 * tree.scale, 4);
          expect(center.z).toBeCloseTo(tree.z, 4);
          expect(variant.crowns.count).toBe(variant.trunks.count);
        }
        expect(createFoliageColliders(trees)).toEqual(colliders);
        expect(world.colliders.len()).toBe(trees.length);
        expect(snapshot()).toEqual(original);
        expect(colliders.every(c => c.radius === TRUNK_RADIUS)).toBe(true);
      }
      foliage.setTiles([]);
      expect(Object.values(foliage.species).flatMap(s => s.variants).every(s => s.trunks.count === 0 && s.crowns.count === 0)).toBe(true);
    } finally { world.free(); foliage.dispose(); }
  });

  it("rejects capacity overflow atomically and disposes each shared resource once", () => {
    const foliage = createFoliage(1);
    const tree = tenForests.flat()[0]!;
    foliage.setTiles([tree]);
    expect(() => foliage.setTiles([tree, tree])).toThrow(RangeError);
    expect(foliage.species[tree.kind].variants.reduce((count, variant) => count + variant.trunks.count, 0)).toBe(1);
    const variants = Object.values(foliage.species).flatMap(s => s.variants);
    const resources = new Set(variants.flatMap(s => [s.trunks.geometry, s.trunks.material, s.crowns.geometry, s.crowns.material]).flat());
    const meshSpies = variants.flatMap(s => [vi.spyOn(s.trunks, "dispose"), vi.spyOn(s.crowns, "dispose")]);
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    foliage.dispose(); foliage.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of meshSpies) expect(spy).toHaveBeenCalledTimes(1);
    expect(foliage.group.children).toHaveLength(0);
    expect(() => foliage.setTiles([])).toThrow("disposed");
    expect(() => foliage.setQuality("Low")).toThrow("disposed");
    expect(() => createFoliage(-1)).toThrow(RangeError);
    const empty = createFoliage(0);
    empty.setTiles([]); empty.setQuality("Low"); empty.dispose();
    expect(new Set(tenTiles.map(t => tileKey(t.ix, t.iz))).size).toBe(10);
  });
});

describe("procedural foliage variants", () => {
  const trees: FoliageTree[] = (["pine", "broadleaf"] as const).flatMap(kind => Array.from({ length: 2000 }, (_, i) => ({
    kind, x: (i % 50) * 4.23 - 110, z: Math.floor(i / 50) * -5.17 + 80,
    y: 0, scale: 1, lean: 0,
  })));

  it("shares materials through the legacy handles and uses at most ten draw calls", () => {
    const foliage = createFoliage(2000);
    try {
      expect(foliage.species.pine.variants.length).toBeGreaterThanOrEqual(3);
      expect(foliage.species.broadleaf.variants.length).toBeGreaterThanOrEqual(2);
      for (const species of Object.values(foliage.species)) {
        expect(species.trunks).toBe(species.variants[0]!.trunks);
        expect(species.crowns).toBe(species.variants[0]!.crowns);
        expect(species.crowns.material.vertexColors).toBe(true);
        species.crowns.material.color.setHex(0x5e8c6a);
        for (const variant of species.variants) {
          expect(variant.crowns.material).toBe(species.crowns.material);
          expect(variant.trunks.material).toBe(species.trunks.material);
          expect(variant.crowns.material.color.getHex()).toBe(0x5e8c6a);
        }
      }
      foliage.setTiles(trees);
      const meshes = Object.values(foliage.species).flatMap(s => s.variants.flatMap(v => [v.trunks, v.crowns]));
      expect(foliage.group.children).toEqual(meshes);
      expect(meshes.filter(mesh => mesh.count > 0)).toHaveLength(10);
    } finally { foliage.dispose(); }
  });

  it("assigns each variant >=10% of 2000 trees, stably across quality and input order", () => {
    const foliage = createFoliage(2000);
    const matrix = new Matrix4();
    const assignment = () => Object.values(foliage.species).flatMap(species => species.variants.map(variant => {
      const positions: string[] = [];
      for (let i = 0; i < variant.crowns.count; i++) {
        variant.crowns.getMatrixAt(i, matrix);
        const center = new Vector3().setFromMatrixPosition(matrix);
        positions.push(`${center.x}:${center.z}`);
      }
      return positions.sort();
    }));
    try {
      foliage.setTiles(trees);
      const initial = assignment();
      for (const species of Object.values(foliage.species)) {
        expect(species.variants.reduce((n, variant) => n + variant.crowns.count, 0)).toBe(2000);
        for (const variant of species.variants) expect(variant.crowns.count).toBeGreaterThanOrEqual(200);
      }
      for (const quality of ["Low", "Balanced", "High"] as const) {
        foliage.setQuality(quality);
        const variants = Object.values(foliage.species).flatMap(s => s.variants);
        const count = Math.round(trees.length * PRESETS[quality].density);
        expect(variants.reduce((n, variant) => n + variant.crowns.count, 0)).toBe(count);
        expect(variants.reduce((n, variant) => n + variant.trunks.count, 0)).toBe(count);
        assignment().forEach((positions, i) => expect(positions.every(position => initial[i]!.includes(position))).toBe(true));
      }
      expect(assignment()).toEqual(initial);
      foliage.setTiles([...trees].reverse());
      expect(assignment()).toEqual(initial);
    } finally { foliage.dispose(); }
  });
});

it("never roots a tree on the sea floor or wet sand around the river mouth (B2-031)", () => {
  const mouth = riverPointAt(1);
  const ix = Math.floor(mouth.x / 64);
  const iz = Math.floor(mouth.z / 64);
  let checked = 0;
  for (let x = ix - 3; x <= ix + 3; x++) for (let z = iz - 4; z <= iz + 1; z++) {
    for (const tree of scatterTile({ ix: x, iz: z })) {
      checked++;
      expect(worldHeight(tree.x, tree.z)).toBeGreaterThanOrEqual(SHORE_MIN_HEIGHT);
    }
  }
  expect(checked).toBeGreaterThanOrEqual(0);
});
