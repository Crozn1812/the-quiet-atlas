import { reportBudget } from "./report-budget";
import { Color, Matrix4, Vector3 } from "three";
import { expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createFoliage, foliageVariantAt, isDeepCrown } from "../../../src/features/world/foliage/instances";
import { foliageBiomeAt, foliageClumpAt, isFoliageExcluded, isZoneApproach, scatterTile, type FoliageTree } from "../../../src/features/world/foliage/scatter";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { PRESETS } from "../../../src/features/world/terrain";
import { TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { placeZoneScenes } from "../../../src/features/world/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";

const tiles = tilesAlongPath();
const forest = tiles.flatMap(tile => scatterTile(tile));

// Measure against the curve's finite-difference normal, independently of scatter's
// sampled-segment normal: walking left is (fz, -fx), also at the final bend.
function coastalPosition(tree: { x: number; z: number }) {
  const path = nearestPath(tree.x, tree.z);
  const before = pathPointAt(Math.max(0, path.t - 0.00001));
  const after = pathPointAt(Math.min(1, path.t + 0.00001));
  const nx = after.z - before.z, nz = before.x - after.x;
  const inland = (tree.x - path.x) * nx + (tree.z - path.z) * nz > 0;
  return { ...path, inland };
}

it("concentrates forest trees in continuous clumps and keeps each tile below 180 trees", () => {
  const area = [0, 0], count = [0, 0];
  for (const tile of tiles) {
    reportBudget("tests/unit/world/foliage-natural.test.ts:33 scatterTile(tile).length", scatterTile(tile).length, 180);
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

it("uses existing broadleaf instances for sparse coastal shrubs below 2 m", () => {
  const shrubs = forest.filter(tree => tree.growth === "shrub");
  expect(shrubs.length).toBeGreaterThan(10 * WORLD_SCALE);
  // B2-153 adds mature inland forest; the low-shrub ratio applies seaward.
  const coast = forest.filter(tree => foliageBiomeAt(tree.x, tree.z) === "coast-dusk" && !coastalPosition(tree).inland);
  const seaShrubs = coast.filter(tree => tree.growth === "shrub");
  expect(seaShrubs.length).toBeGreaterThan(0);
  expect(seaShrubs.length / coast.length).toBe(1);
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
      // B2-182 raises the authored tree to 9-14 m; existing shrub scales stay fixed.
      expect(height).toBeLessThan(2);
    }
    expect(foliage.group.children).toHaveLength(10);
  } finally { foliage.dispose(); }
});

it("layers a denser, mostly forestDeep inland canopy while keeping the sea view open within the old instance budget", () => {
  // Include the complete 160 m band, its tile seams and the hidden interior
  // beyond it. These are the unmodified seed's populations, not raised caps.
  const wideTiles = tilesAlongPath(240);
  const wideForest = wideTiles.flatMap(tile => scatterTile(tile));
  reportBudget("tests/unit/world/foliage-natural.test.ts:112 wideForest.length", wideForest.length, 2841);
  for (const tile of wideTiles) reportBudget("tests/unit/world/foliage-natural.test.ts:113 scatterTile(tile).length", scatterTile(tile).length, 180);
  const coast = wideForest.filter(tree => foliageBiomeAt(tree.x, tree.z) === "coast-dusk");
  const stretch = coast.filter(tree => {
    const path = coastalPosition(tree);
    return path.t >= 0.85 && path.t <= 0.97;
  });
  const tall = stretch.filter(tree => tree.growth !== "shrub");
  const inland = tall.filter(tree => coastalPosition(tree).inland && nearestPath(tree.x, tree.z).distance >= 22
    && nearestPath(tree.x, tree.z).distance <= 160);
  const seaward = tall.filter(tree => !coastalPosition(tree).inland && nearestPath(tree.x, tree.z).distance >= 22
    && nearestPath(tree.x, tree.z).distance <= 160);
  expect(inland.length).toBeGreaterThan(100);
  expect(inland.length).toBeGreaterThanOrEqual(seaward.length * 4);
  expect(stretch.filter(tree => !coastalPosition(tree).inland && nearestPath(tree.x, tree.z).distance <= 40
    && tree.growth !== "shrub")).toHaveLength(0);
  // The whole coastal sea side remains open, including beyond the 40 m strip.
  expect(coast.filter(tree => !coastalPosition(tree).inland && tree.growth !== "shrub")).toHaveLength(0);
  for (const [near, far] of [[22, 60], [60, 100], [100, 160]] as const) {
    expect(inland.filter(tree => {
      const distance = nearestPath(tree.x, tree.z).distance;
      return distance >= near && distance < far;
    }).length).toBeGreaterThan(10);
  }
  for (const tree of coast.filter(tree => tree.growth !== "shrub")) {
    expect(tree.kind).toBe("broadleaf");
    expect(tree.y).toBe(worldHeight(tree.x, tree.z));
    expect(nearestPath(tree.x, tree.z).distance).toBeGreaterThanOrEqual(22);
    // B2-159 extends the canopy over the crest and onto the far shoulder.
    expect(nearestPath(tree.x, tree.z).distance).toBeLessThanOrEqual(260);
  }

  const area = { coast: 0, forest: 0 };
  for (const tile of wideTiles) for (let x = 4; x < TILE_SIZE; x += 8) for (let z = 4; z < TILE_SIZE; z += 8) {
    const px = tile.ix * TILE_SIZE + x, pz = tile.iz * TILE_SIZE + z;
    const path = coastalPosition({ x: px, z: pz });
    if (path.distance < 22 || path.distance > 160 || isFoliageExcluded(px, pz)) continue;
    const biome = foliageBiomeAt(px, pz);
    if (biome === "forest-dawn") area.forest++;
    if (biome === "coast-dusk" && path.inland && path.t >= 0.85 && path.t <= 0.97) area.coast++;
  }
  const ordinary = wideForest.filter(tree => {
    const path = nearestPath(tree.x, tree.z);
    return foliageBiomeAt(tree.x, tree.z) === "forest-dawn" && path.distance >= 22 && path.distance <= 160;
  });
  expect(area.coast).toBeGreaterThan(0);
  expect(area.forest).toBeGreaterThan(0);
  expect(inland.length / area.coast).toBeGreaterThan(ordinary.length / area.forest * 1.5);

  // Verify rendered instance colours as well as the hash, at every quality.
  const foliage = createFoliage(inland.length);
  const actual = new Color(), deep = new Color(PALETTE.forestDeep);
  // ADR 0017 leaves fewer coastal trees: Low's small stratified subset can
  // differ from the full population. Keep the majority gate on the population
  // and independently verify the exact rendered subset at every quality.
  expect(inland.filter(tree => isDeepCrown(tree.x, tree.z)).length / inland.length).toBeGreaterThanOrEqual(0.6);
  try {
    foliage.setTiles(inland);
    for (const quality of ["Low", "Balanced", "High"] as const) {
      foliage.setQuality(quality);
      let deepCount = 0, total = 0;
      for (const { crowns } of foliage.species.broadleaf.variants) for (let i = 0; i < crowns.count; i++) {
        crowns.getColorAt(i, actual);
        actual.multiply(crowns.material.color);
        const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        if (Math.abs(luma(actual) / luma(deep) - 1) <= 0.080001) deepCount++;
        total++;
      }
      expect(total).toBeGreaterThan(0);
      const count = Math.round(inland.length * PRESETS[quality].density);
      const expectedDeep = Array.from({ length: count }, (_, i) => inland[Math.floor((i + 0.5) * inland.length / count)]!)
        .filter(tree => isDeepCrown(tree.x, tree.z)).length;
      expect(total).toBe(count);
      expect(deepCount).toBe(expectedDeep);
      reportBudget("coastal foliage draws", Object.values(foliage.species).flatMap(species => species.variants)
        .flatMap(variant => [variant.trunks, variant.crowns]).filter(mesh => mesh.count > 0).length, 4);
    }
  } finally { foliage.dispose(); }
  console.info(`B2-153: inland=${inland.length}, seaward=${seaward.length}, deep=${inland.filter(tree => isDeepCrown(tree.x, tree.z)).length}; instances=${wideForest.length}/2841`);
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
  const colors = new Map<string, Color>();
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
          const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
          expect(Math.abs(luma(actual) / luma(expected) - 1)).toBeLessThanOrEqual(0.080001);
          const hue = (color: Color) => color.getHSL({ h: 0, s: 0, l: 0 }).h;
          expect(Math.abs(hue(actual) / hue(expected) - 1)).toBeLessThanOrEqual(0.08);
          const key = `${tree.x}:${tree.z}`;
          if (!colors.has(key)) colors.set(key, actual.clone());
          expect(actual).toEqual(colors.get(key));
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
