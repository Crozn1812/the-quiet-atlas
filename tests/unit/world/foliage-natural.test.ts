import { Color, Matrix4, Vector3 } from "three";
import { expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createFoliage, foliageVariantAt, isDeepCrown } from "../../../src/features/world/foliage/instances";
import { foliageBiomeAt, foliageClumpAt, isFoliageExcluded, isZoneApproach, scatterTile, type FoliageTree } from "../../../src/features/world/foliage/scatter";
import { ZONES } from "../../../src/features/world/layout/zones";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { PRESETS } from "../../../src/features/world/terrain";
import { TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";
import { placeZoneScenes } from "../../../src/features/world/zones";

const tiles = tilesAlongPath();
const forest = tiles.flatMap(tile => scatterTile(tile));

it("concentrates forest trees in continuous clumps without increasing the 180-candidate tile budget", () => {
  const area = [0, 0], count = [0, 0];
  for (const tile of tiles) {
    expect(scatterTile(tile).length).toBeLessThanOrEqual(180);
    for (let x = 2; x < TILE_SIZE; x += 4) for (let z = 2; z < TILE_SIZE; z += 4) {
      const px = tile.ix * TILE_SIZE + x, pz = tile.iz * TILE_SIZE + z;
      if (foliageBiomeAt(px, pz) !== "forest-dawn" || isFoliageExcluded(px, pz)) continue;
      area[foliageClumpAt(px, pz) >= 0.3 ? 1 : 0]!++;
    }
    const seam = tile.ix * TILE_SIZE;
    const middle = (tile.iz + 0.5) * TILE_SIZE;
    expect(Math.abs(foliageClumpAt(seam - 1e-6, middle) - foliageClumpAt(seam + 1e-6, middle))).toBeLessThan(1e-6);
  }
  for (const tree of forest.filter(tree => foliageBiomeAt(tree.x, tree.z) === "forest-dawn")) {
    count[foliageClumpAt(tree.x, tree.z) >= 0.3 ? 1 : 0]!++;
  }
  expect(area.every(value => value > 0)).toBe(true);
  expect(count[1]! / area[1]!).toBeGreaterThan(count[0]! / area[0]! * 1.5);
});

it("clears the full 60-degree incoming cone through 15 m beyond each zone edge", () => {
  const opening = ZONES[0]!;
  const heading = Math.atan2(-opening.lookDirection.x, -opening.lookDirection.z);
  const sample = (degrees: number, distance: number) => ({
    x: opening.position.x + Math.sin(heading + degrees * Math.PI / 180) * distance,
    z: opening.position.z + Math.cos(heading + degrees * Math.PI / 180) * distance,
  });
  for (const angle of [-29.99, 0, 29.99]) {
    const p = sample(angle, opening.radius + 14.99);
    expect(isZoneApproach(p.x, p.z)).toBe(true);
    expect(isFoliageExcluded(p.x, p.z)).toBe(true);
  }
  for (const angle of [-30.01, 30.01, 180]) {
    const p = sample(angle, opening.radius + 10);
    expect(isZoneApproach(p.x, p.z)).toBe(false);
  }
  const outside = sample(0, opening.radius + 15.01);
  expect(isZoneApproach(outside.x, outside.z)).toBe(false);
  for (const tree of forest) for (const zone of ZONES) {
    const dx = tree.x - zone.position.x, dz = tree.z - zone.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > zone.radius + 15) continue;
    const cosine = -(dx * zone.lookDirection.x + dz * zone.lookDirection.z)
      / (distance * Math.hypot(zone.lookDirection.x, zone.lookDirection.z));
    expect(cosine).toBeLessThan(Math.cos(Math.PI / 6));
  }
});

it("uses existing broadleaf instances for sparse coastal shrubs below 1.6 m", () => {
  const shrubs = forest.filter(tree => tree.growth === "shrub");
  expect(shrubs.length).toBeGreaterThan(10);
  const coast = forest.filter(tree => foliageBiomeAt(tree.x, tree.z) === "coast-dusk");
  expect(shrubs.length / coast.length).toBeGreaterThan(0.9);
  const foliage = createFoliage(shrubs.length);
  try {
    foliage.setTiles(shrubs);
    const matrix = new Matrix4();
    for (const tree of shrubs) {
      expect(tree.kind).toBe("broadleaf");
      expect(foliageBiomeAt(tree.x, tree.z)).toBe("coast-dusk");
      expect(tree.scale).toBeGreaterThanOrEqual(0.12);
      expect(tree.scale).toBeLessThanOrEqual(0.2);
    }
    for (const { crowns } of foliage.species.broadleaf.variants) for (let i = 0; i < crowns.count; i++) {
      crowns.getMatrixAt(i, matrix);
      // Crown top relative to root: 5 m anchor plus the authored broadleaf bounds.
      const height = (5 + crowns.geometry.boundingBox!.max.y) * new Vector3().setFromMatrixScale(matrix).y;
      expect(height).toBeLessThan(1.6);
    }
    expect(foliage.group.children).toHaveLength(10);
  } finally { foliage.dispose(); }
});

it("assigns about 30% forestDeep crowns, preserving per-position colour through LOD, reorder and compaction", () => {
  const trees: FoliageTree[] = Array.from({ length: 4000 }, (_, i) => ({
    kind: i % 2 ? "pine" : "broadleaf", x: i * 4.23, z: (i % 61) * -5.17, y: 0, scale: 1, lean: 0,
  }));
  const proportion = trees.filter(tree => isDeepCrown(tree.x, tree.z)).length / trees.length;
  expect(proportion).toBeGreaterThan(0.28);
  expect(proportion).toBeLessThan(0.32);
  const foliage = createFoliage(trees.length);
  const actual = new Color();
  try {
    for (const input of [trees, [...trees].reverse(), trees.slice(50, 70)]) {
      foliage.setTiles(input);
      for (const quality of ["Low", "Balanced", "High"] as const) {
        foliage.setQuality(quality);
        const indices = new Map<object, number>();
        const count = Math.round(input.length * PRESETS[quality].density);
        for (let i = 0; i < count; i++) {
          const tree = input[Math.floor((i + 0.5) * input.length / count)]!;
          const species = foliage.species[tree.kind];
          const variant = species.variants[foliageVariantAt(tree.x, tree.z, species.variants.length)]!;
          const index = indices.get(variant) ?? 0;
          indices.set(variant, index + 1);
          variant.crowns.getColorAt(index, actual);
          const expected = isDeepCrown(tree.x, tree.z) ? new Color(PALETTE.forestDeep) : variant.crowns.material.color;
          actual.multiply(variant.crowns.material.color);
          expect(actual.r).toBeCloseTo(expected.r, 6);
          expect(actual.g).toBeCloseTo(expected.g, 6);
          expect(actual.b).toBeCloseTo(expected.b, 6);
        }
        expect(foliage.group.children).toHaveLength(10);
      }
    }
  } finally { foliage.dispose(); }
});

it("places all eight zone scenes on the real composed terrain without throwing", () => {
  const zones = placeZoneScenes(surfaceHeight);
  try {
    expect(zones.map(zone => zone.zoneId)).toEqual(ZONES.map(zone => zone.id));
    for (const zone of zones) {
      expect(zone.group.position.y).toBe(surfaceHeight(zone.layout.position.x, zone.layout.position.z));
    }
  } finally { zones.forEach(zone => zone.dispose()); }
});
