import RAPIER from "@dimforge/rapier3d-compat";
import { Box3, BoxGeometry, type BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Scene, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createCrownFade } from "../../../src/features/world/crown-fade";
import { createFoliageColliders, TRUNK_HEIGHT, TRUNK_RADIUS } from "../../../src/features/world/foliage/colliders";
import { createFoliage, foliageVariantAt, hasHangingFoliage, selectFoliageOccludingCrowns } from "../../../src/features/world/foliage/instances";
import { createPineCrownV2 } from "../../../src/features/world/foliage/pine";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, pineHeight } from "../../../src/features/world/foliage/shapes";
import { foliageBiomeAt, MIN_TREE_DISTANCE, scatterTile, SHORE_MIN_HEIGHT, type FoliageTree } from "../../../src/features/world/foliage/scatter";
import { PATH_BRIDGES, pathPointAt } from "../../../src/features/world/layout/path";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE, tileKey, tilesAlongPath } from "../../../src/features/world/terrain/tiles";
import { PRESETS, type Quality } from "../../../src/features/world/terrain";
import { createWorldScene } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";

const route = tilesAlongPath();
const tenTiles = Array.from({ length: 10 }, (_, i) => route[Math.floor(i * (route.length - 1) / 9)]!);
const tenForests = tenTiles.map(tile => scatterTile(tile));

// B2-194: V2 contains a rooted wooden leader; only needles define the canopy.
function leafBounds(geometry: BufferGeometry): Box3 {
  const position = geometry.getAttribute("position"), surface = geometry.getAttribute("surface");
  const bounds = new Box3();
  for (let i = 0; i < position.count; i++) if (surface.getX(i) === 0) {
    bounds.expandByPoint(new Vector3().fromBufferAttribute(position, i));
  }
  return bounds;
}

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

  it("keeps hills sparse and the seaward coast free of mature trees; reports complete route count", () => {
    const stats = { "forest-dawn": { area: 0, count: 0 }, hill: { area: 0, count: 0 }, "coast-dusk": { area: 0, count: 0 } };
    let total = 0;
    for (const tile of route) {
      const trees = scatterTile(tile);
      total += trees.length;
      // Count only tiles wholly in one biome for an equal-area density comparison.
      const biomes = [0, 0.5, 1].flatMap(x => [0, 0.5, 1].map(z => foliageBiomeAt((tile.ix + x) * TILE_SIZE, (tile.iz + z) * TILE_SIZE)));
      const biome = biomes[0]!;
      // B2-153 deliberately replaces the inland coast's old 5% limit with a
      // dense canopy. The sea view retains the sparse-coast contract.
      if (biomes.every(value => value === biome)) {
        stats[biome].area++;
        stats[biome].count += trees.filter(tree => {
          if (tree.growth === "shrub") return false;
          if (biome !== "coast-dusk") return true;
          const path = nearestPath(tree.x, tree.z);
          const before = pathPointAt(Math.max(0, path.t - 0.00001));
          const after = pathPointAt(Math.min(1, path.t + 0.00001));
          const nx = after.z - before.z, nz = before.x - after.x;
          return (tree.x - path.x) * nx + (tree.z - path.z) * nz < 0;
        }).length;
      }
    }
    for (const stat of Object.values(stats)) expect(stat.area).toBeGreaterThan(0);
    const forestDensity = stats["forest-dawn"].count / stats["forest-dawn"].area;
    expect(stats.hill.count / stats.hill.area).toBeLessThan(forestDensity * 0.6);
    expect(stats["coast-dusk"].count).toBe(0);
    // B2-170 permits +25% while concentrating trees around the forest trail.
    expect(total).toBeLessThanOrEqual(Math.floor(577 * 1.25));
    console.info(`B2-018 route: ${total} trees across ${route.length} tiles; density (trees/tile): forest=${forestDensity.toFixed(2)}, hill=${(stats.hill.count / stats.hill.area).toFixed(2)}, coast=${(stats["coast-dusk"].count / stats["coast-dusk"].area).toFixed(2)}`);
  });
});

describe("foliage instances and colliders", () => {
  it("displays evenly distributed 40/70/100% trees with extended pine visuals and all actual Rapier cylinders unchanged", async () => {
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
          const nominalHeight = pineHeight(variant.seed);
          const heightScale = tree.kind === "pine" ? Math.max(14, Math.min(18, nominalHeight * tree.scale)) / nominalHeight : tree.scale * (tree.trailCanopy ? 3 : 1);
          const visualHeight = tree.kind === "pine" ? nominalHeight * (2 / 3 + 0.05) * heightScale : TRUNK_HEIGHT * heightScale;
          expect(center.x).toBeCloseTo(tree.x - Math.sin(tree.lean) * visualHeight / 2, 4);
          expect(center.y).toBeCloseTo(tree.y + Math.cos(tree.lean) * visualHeight / 2, 4);
          expect(center.z).toBeCloseTo(colliders[index]!.z, 4);
          expect(colliders[index]!.halfHeight).toBeCloseTo(5 * tree.scale / 2, 6);
          variant.crowns.getMatrixAt(instanceIndex, matrix);
          center.setFromMatrixPosition(matrix);
          const expected = new Vector3(tree.x - Math.sin(tree.lean) * 5 * heightScale, tree.y + Math.cos(tree.lean) * 5 * heightScale, tree.z);
          expect(center.x).toBeCloseTo(expected.x, 4);
          expect(center.y).toBeCloseTo(expected.y, 4);
          expect(center.z).toBeCloseTo(expected.z, 4);
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

  it("selects three real broadleaf shapes and ~40% hanging ribbons independently of batching, order and LOD", () => {
    const input = trees.filter(tree => tree.kind === "broadleaf");
    const foliage = createFoliage(input.length);
    const shapes = BROADLEAF_VARIANT_SEEDS.map(seed => createBroadleafCrown(seed));
    try {
      expect(foliage.species.broadleaf.shapeSeeds.length).toBeGreaterThanOrEqual(3);
      const hanging = input.filter(tree => hasHangingFoliage(tree.x, tree.z)).length / input.length;
      expect(hanging).toBeGreaterThan(0.37);
      expect(hanging).toBeLessThan(0.43);
      for (const ordered of [input, [...input].reverse(), input.slice(50, 70)]) {
        foliage.setTiles(ordered);
        for (const quality of ["Low", "Balanced", "High"] as const) {
          foliage.setQuality(quality);
          const counters = foliage.species.broadleaf.variants.map(() => 0);
          const count = Math.round(ordered.length * PRESETS[quality].density);
          const used = new Set<number>();
          for (let i = 0; i < count; i++) {
            const tree = ordered[Math.floor((i + 0.5) * ordered.length / count)]!;
            const batch = foliageVariantAt(tree.x, tree.z, counters.length);
            const { crowns } = foliage.species.broadleaf.variants[batch]!;
            const style = crowns.geometry.getAttribute("treeStyle");
            const shape = style.getX(counters[batch]!);
            expect(shape).toBe(foliageVariantAt(tree.x, tree.z, shapes.length));
            expect(style.getY(counters[batch]!)).toBe(Number(hasHangingFoliage(tree.x, tree.z)));
            counters[batch]!++;
            used.add(shape);
          }
          if (ordered.length > 100) expect(used.size).toBe(3);
        }
      }
      // Reconstruct the GPU-selected positions from actual buffers (variant normals were dropped for the 16-attribute
      // WebGL limit; base normals light all three silhouettes).
      for (const { crowns } of foliage.species.broadleaf.variants) for (let shape = 0; shape < shapes.length; shape++) {
        for (const name of ["position"] as const) {
          const base = crowns.geometry.getAttribute(name), target = shapes[shape]!.getAttribute(name);
          const delta = shape === 0 ? undefined : crowns.geometry.getAttribute((name === "position" ? "shape" : "normal") + (shape === 1 ? "A" : "B"));
          for (let i = 0; i < base.array.length; i++) {
            expect(base.array[i]! + (delta?.array[i] ?? 0)).toBeCloseTo(target.array[i]!, 6);
          }
        }
        expect(crowns.geometry.groups).toHaveLength(0);
        const position = shapes[shape]!.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          expect(crowns.geometry.boundingBox!.containsPoint(new Vector3().fromBufferAttribute(position, i))).toBe(true);
        }
      }
    } finally { foliage.dispose(); shapes.forEach(shape => shape.dispose()); }
  });

  it("chains shape selection into toon, fade and existing depth/distance shadow shaders and disposes them", () => {
    const foliage = createFoliage(1), { crowns } = foliage.species.broadleaf.variants[0]!;
    const materials = [crowns.material, crowns.customDepthMaterial!, crowns.customDistanceMaterial!];
    const spies = materials.slice(1).map(material => vi.spyOn(material, "dispose"));
    createCrownFade(crowns, 1);
    try {
      for (const [i, material] of materials.entries()) {
        const source = [ShaderLib.toon!, ShaderLib.depth!, ShaderLib.distance!][i]!;
        const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
        material.onBeforeCompile(shader, {} as WebGLRenderer);
        expect(shader.vertexShader).toContain("transformed += mix(shapeA");
        expect(shader.vertexShader).toContain("step(1.5, surface) * (1.0 - treeStyle.y)");
        expect(material.customProgramCacheKey()).toContain("forest-shapes-v2");
        if (i === 0) {
          expect(shader.vertexShader).toContain("vCrownAlpha = crownAlpha");
          expect(shader.fragmentShader).toContain("rampShadowTint");
        }
      }
    } finally { foliage.dispose(); }
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports before/after submitted triangles and unchanged active draws over the same 240 m corridor", () => {
    const tiles = tilesAlongPath(240), forests = tiles.map(scatterTile);
    const foliage = createFoliage(Math.max(...forests.map(trees => trees.length)));
    let before = 0, after = 0, beforeDraws = 0, afterDraws = 0;
    try {
      for (const trees of forests) {
        const batches = new Set<string>();
        for (const tree of trees) {
          const variants = foliage.species[tree.kind].variants;
          const batch = foliageVariantAt(tree.x, tree.z, variants.length);
          const { seed } = variants[batch]!;
          // B2-194 baseline is the geometry immediately before this ticket:
          // legacy pine and the already-shipped 425-triangle broadleaf crown.
          before += tree.kind === "pine" ? 42 + (3 + seed % 3) * 44 : 42 + 425;
          batches.add(`${tree.kind}:${batch}`);
        }
        beforeDraws += 2 * batches.size;
        foliage.setTiles(trees);
        for (const mesh of foliage.group.children) {
          if (!("geometry" in mesh) || !("count" in mesh)) continue;
          const instanced = mesh as typeof foliage.species.pine.crowns;
          if (instanced.count > 0) afterDraws++;
          after += instanced.count * instanced.geometry.index!.count / 3;
        }
      }
      expect(afterDraws).toBe(beforeDraws);
      expect(after).toBeLessThanOrEqual(before * 1.25);
      expect(forests.flat().length).toBeGreaterThan(1000);
      // B2-191b replaces tiny blades with closed, notched needle masses and
      // visible tubes: 552 crown + the unchanged 42-triangle trunk. Keep B2-194's baseline/cap.
      process.stdout.write(`B2-194 240 m / High: trees=${forests.flat().length}; triangles=${before} -> ${after}; active mesh draws=${beforeDraws} -> ${afterDraws}; broadleaf=467/tree, pine=594/tree (includes rooted wood and unchanged 42-triangle trunk)\n`);
    } finally { foliage.dispose(); }
  });

  it("keeps resident High world triangles below +25% at forest and coastal review positions", () => {
    const scene = new Scene(), composition = createWorldScene({ ...createMeshPhysics(), scene, quality: "High" });
    try {
      for (const t of [0.15, 0.86, 0.93]) {
        const path = pathPointAt(t);
        composition.update(new Vector3(path.x, worldHeight(path.x, path.z) + 1.7, path.z), 0);
        expect(composition.streamingError).toBeUndefined();
        let after = 0, extra = 0;
        scene.traverseVisible(node => {
          if (!(node instanceof Mesh)) return;
          const submitted = Math.min(node.geometry.drawRange.count, node.geometry.index?.count ?? node.geometry.getAttribute("position").count);
          after += submitted / 3 * (node instanceof InstancedMesh ? node.count : 1);
        });
        for (const mesh of composition.foliageMeshes) {
          if (mesh instanceof InstancedMesh && (mesh.name.startsWith("forest-r1-trees-") || mesh.name.startsWith("coast-r1-trees-"))) {
            // R1 replaces the historic 349-triangle broadleaf with a complete,
            // branched 280-triangle tree. Count the saving in the same world gate.
            extra += mesh.count * (mesh.geometry.getAttribute("position").count / 3 - 349);
            continue;
          }
          if (!(mesh instanceof InstancedMesh) || !mesh.geometry.getAttribute("treeStyle")) continue;
          const surface = mesh.geometry.getAttribute("surface");
          if (!Array.from(surface.array).includes(2)) continue; // Hanging ribbons identify broadleaf; V2 pine also contains wood.
          extra += mesh.count * (mesh.geometry.index!.count / 3 - 349);
        }
        const before = after - extra;
        // R1 forest, hill and coast batches all replace the larger historic crowns.
        expect(extra).toBeLessThan(0);
        expect(after).toBeLessThanOrEqual(before * 1.25);
        // Eager props/character/post are unchanged; adding them only reduces this ratio.
        process.stdout.write(`B2-182b resident world / High / t=${t}: triangles=${before} -> ${after}; increase=${((after / before - 1) * 100).toFixed(3)}%\n`);
      }
    } finally { composition.dispose(); }
  }, 60_000);

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

  it("keeps every pine variant 14–18 m tall with two thirds bare at scatter scale extremes and lean", () => {
    const foliage = createFoliage(1);
    const matrix = new Matrix4();
    try {
      for (let variantIndex = 0; variantIndex < foliage.species.pine.variants.length; variantIndex++) {
        const x = Array.from({ length: 100 }, (_, i) => i).find(x => foliageVariantAt(x, 5, 3) === variantIndex)!;
        const variant = foliage.species.pine.variants[variantIndex]!;
        for (const scale of [0.8, 1, 1.3]) for (const lean of [-0.06, 0, 0.06]) {
          const tree: FoliageTree = { kind: "pine", x, y: 3, z: 5, scale, lean };
          foliage.setTiles([tree]);
          const root = new Vector3(x, 3, 5);
          const axis = new Vector3(-Math.sin(lean), Math.cos(lean), 0);
          variant.trunks.getMatrixAt(0, matrix);
          expect(new Vector3(0, -0.5, 0).applyMatrix4(matrix).distanceTo(root)).toBeLessThan(1e-5);
          const trunkTop = new Vector3(0, 0.5, 0).applyMatrix4(matrix).sub(root).dot(axis);
          variant.crowns.getMatrixAt(0, matrix);
          const bounds = leafBounds(variant.crowns.geometry);
          const base = new Vector3(0, bounds.min.y, 0).applyMatrix4(matrix).sub(root).dot(axis);
          const top = new Vector3(0, bounds.max.y, 0).applyMatrix4(matrix).sub(root).dot(axis);
          expect(new Vector3(0, variant.crowns.geometry.boundingBox!.min.y, 0).applyMatrix4(matrix).distanceTo(root)).toBeLessThan(1e-5);
          expect(top).toBeGreaterThanOrEqual(14 - 1e-5);
          expect(top).toBeLessThanOrEqual(18 + 1e-5);
          expect(base / top).toBeCloseTo(2 / 3, 6);
          expect(trunkTop).toBeGreaterThan(base);
          expect(trunkTop).toBeLessThan(top);
          const collider = createFoliageColliders([tree])[0]!;
          expect(collider.halfHeight).toBe(2.5 * scale);
          expect(collider.radius).toBe(0.28);
        }
      }
    } finally { foliage.dispose(); }
  });

  it("selects and fades real high pine crowns, including lean, scale and transformed parents", () => {
    const foliage = createFoliage(1);
    const matrix = new Matrix4();
    foliage.group.position.set(2, 3, -4);
    foliage.group.rotation.y = 0.4;
    foliage.group.scale.setScalar(1.1);
    try {
      for (let variantIndex = 0; variantIndex < foliage.species.pine.variants.length; variantIndex++) {
        const x = Array.from({ length: 100 }, (_, i) => i).find(x => foliageVariantAt(x, 5, 3) === variantIndex)!;
        const crowns = foliage.species.pine.variants[variantIndex]!.crowns;
        const fade = createCrownFade(crowns, 1);
        for (const scale of [0.8, 1.3]) {
          foliage.setTiles([{ kind: "pine", x, y: 0, z: 5, scale, lean: 0.06 }]);
          crowns.updateWorldMatrix(true, false);
          crowns.getMatrixAt(0, matrix);
          matrix.premultiply(crowns.matrixWorld);
          const bounds = crowns.geometry.boundingBox!, leaves = leafBounds(crowns.geometry);
          const positions = crowns.geometry.getAttribute("position");
          const surface = crowns.geometry.getAttribute("surface"), index = crowns.geometry.index!;
          const faces = [];
          for (let i = 0; i < index.count; i += 3) {
            const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            if (ids.some(id => surface.getX(id) !== 0)) continue;
            const [a, b, c] = ids.map(id => new Vector3().fromBufferAttribute(positions, id));
            faces.push({ center: a!.clone().add(b!).add(c!).divideScalar(3), normal: b!.clone().sub(a!).cross(c!.clone().sub(a!)).normalize() });
          }
          // V2 has intentional sky gaps: raycast real needle faces near the
          // lower/middle/upper canopy, rather than assuming a filled solid.
          for (const t of [0.15, 0.5, 0.85]) {
            const y = leaves.min.y + (leaves.max.y - leaves.min.y) * t;
            const face = faces.reduce((best, face) => Math.abs(face.center.y - y) < Math.abs(best.center.y - y) ? face : best);
            const camera = face.center.clone().addScaledVector(face.normal, 8).applyMatrix4(matrix);
            const player = face.center.clone().addScaledVector(face.normal, -8).applyMatrix4(matrix);
            const direction = player.clone().sub(camera);
            const ray = new Raycaster(camera, direction.clone().normalize(), 0, direction.length());
            expect(ray.intersectObject(crowns).some(hit => hit.instanceId === 0), `variant=${variantIndex}, scale=${scale}, crown fraction=${t}`).toBe(true);
            const blocked = selectFoliageOccludingCrowns(crowns, camera, player);
            expect(blocked).toEqual([0]);
            fade(new Set(blocked), 1);
            expect(crowns.geometry.getAttribute("crownAlpha").getX(0)).toBeLessThan(0.2);
          }
          const worldBounds = new Box3().copy(bounds).applyMatrix4(matrix);
          const center = worldBounds.getCenter(new Vector3());
          const camera = center.clone().add(new Vector3(0, 0, 8));
          const away = center.clone().add(new Vector3(0, 0, 16));
          expect(selectFoliageOccludingCrowns(crowns, camera, away)).toEqual([]);
          const lowCamera = new Vector3(center.x, worldBounds.min.y - 3, center.z + 8);
          const lowPlayer = new Vector3(center.x, worldBounds.min.y - 3, center.z - 8);
          expect(selectFoliageOccludingCrowns(crowns, lowCamera, lowPlayer)).toEqual([]);
          const offset = new Vector3(worldBounds.max.x + 5 - center.x, 0, 0);
          expect(selectFoliageOccludingCrowns(crowns, camera.clone().add(offset), center.clone().add(offset))).toEqual([]);
          // Starting inside the canopy must also fade, then recover when clear.
          expect(selectFoliageOccludingCrowns(crowns, center, away)).toEqual([0]);
          fade(new Set(), 1);
          expect(crowns.geometry.getAttribute("crownAlpha").getX(0)).toBeGreaterThan(0.99);
          foliage.setTiles([]);
          expect(selectFoliageOccludingCrowns(crowns, camera, center)).toEqual([]);
        }
      }
    } finally { foliage.dispose(); }
  });

  it("installs each V2 pine seed without changing triangles, coordinates or wood/needle tags", () => {
    const foliage = createFoliage(1);
    try {
      for (const { seed, crowns } of foliage.species.pine.variants) {
        const expected = createPineCrownV2(seed);
        try {
          expect(crowns.geometry.index!.array).toEqual(expected.index!.array);
          expect(crowns.geometry.index!.count / 3).toBe(expected.index!.count / 3);
          for (const attribute of ["position", "normal", "color", "surface"]) {
            expect(crowns.geometry.getAttribute(attribute).array).toEqual(expected.getAttribute(attribute).array);
          }
          expect(new Set(crowns.geometry.getAttribute("surface").array)).toEqual(new Set([0, 1]));
        } finally { expected.dispose(); }
      }
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

it("reuses crown inverses but immediately respects changed instances, quality slots and parents", () => {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const crowns = new InstancedMesh(geometry, material, 2), parent = new Group();
  parent.add(crowns);
  const matrix = new Matrix4();
  crowns.setMatrixAt(0, matrix.identity());
  crowns.setMatrixAt(1, matrix.makeTranslation(6, 0, 0));
  const invert = vi.spyOn(Matrix4.prototype, "invert");
  function select(x: number, expected: number[], inversions: number) {
    invert.mockClear();
    expect(selectFoliageOccludingCrowns(crowns, new Vector3(x, 0, 4), new Vector3(x, 0, -4))).toEqual(expected);
    expect(invert).toHaveBeenCalledTimes(inversions);
  }
  try {
    select(0, [0], 2);
    select(0, [0], 0); // Repeated frame: exact same hit, no inverse work.
    select(6, [1], 0); // Camera/player motion does not invalidate static transforms.
    crowns.setMatrixAt(0, matrix.makeTranslation(12, 0, 0)); // Deliberately no needsUpdate.
    select(0, [], 1);
    crowns.instanceMatrix.array[16 + 12] = 0; // Direct CPU edit must also be visible immediately.
    select(0, [1], 1);
    crowns.instanceMatrix.needsUpdate = true;
    select(0, [1], 2);
    crowns.count = 1;
    select(0, [], 1);
    crowns.count = 2;
    crowns.setMatrixAt(0, matrix.identity()); // Quality compaction puts a new tree in slot zero.
    crowns.setMatrixAt(1, matrix.makeTranslation(6, 0, 0));
    crowns.instanceMatrix.needsUpdate = true;
    select(0, [0], 2);
    parent.position.x = 6;
    parent.rotation.y = 0.35;
    select(0, [], 2);
    select(6, [0], 0);
    crowns.instanceMatrix = new InstancedBufferAttribute(new Float32Array(crowns.instanceMatrix.array), 16);
    select(6, [0], 2); // A replacement attribute can have the same version and values.
    crowns.count = 0;
    select(6, [], 0);
    crowns.count = 2;
    select(6, [0], 2);
    select(6, [0], 0);
  } finally {
    invert.mockRestore(); crowns.dispose(); geometry.dispose(); material.dispose();
  }
});
