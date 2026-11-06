import { Box3, type BufferGeometry, Color, DoubleSide, InstancedMesh, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { TRUNK_HEIGHT } from "../../../src/features/world/foliage/colliders";
import { createPineCrownV2 } from "../../../src/features/world/foliage/pine";
import { createPineCrown, createTreeTrunk, pineHeight, PINE_VARIANT_SEEDS } from "../../../src/features/world/foliage/shapes";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { RAMP_PRESETS } from "../../../src/features/world/materials/ramp";
import { createWorldScene } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";

const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

// Recover needle solids and tiers from geometry, independently of generator counts.
function leafLayers(geometry: BufferGeometry): Box3[][] {
  const position = geometry.getAttribute("position"), surface = geometry.getAttribute("surface");
  const neighbours = new Map<number, Set<number>>();
  for (let i = 0; i < geometry.index!.count; i += 3) {
    const face = [0, 1, 2].map(j => geometry.index!.getX(i + j));
    if (surface.getX(face[0]!) !== 0) continue;
    for (const id of face) neighbours.set(id, new Set([...(neighbours.get(id) ?? []), ...face]));
  }
  const visited = new Set<number>(), blades: Box3[] = [];
  for (const id of neighbours.keys()) {
    if (visited.has(id)) continue;
    const pending = [id], bounds = new Box3();
    while (pending.length) {
      const next = pending.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      bounds.expandByPoint(new Vector3().fromBufferAttribute(position, next));
      pending.push(...neighbours.get(next)!);
    }
    blades.push(bounds);
  }
  const layers: Box3[][] = [];
  for (const blade of blades.sort((a, b) => a.min.y - b.min.y)) {
    const last = layers[layers.length - 1];
    if (last && blade.min.y <= Math.max(...last.map(bounds => bounds.max.y))) last.push(blade);
    else layers.push([blade]);
  }
  return layers;
}

describe("Da Lat pine V2", () => {
  for (const seed of PINE_VARIANT_SEEDS) {
    it(`${seed}: keeps the rooted height, leaf clearance and one-draw geometry within budget`, () => {
      const geometry = createPineCrownV2(seed), legacy = createPineCrown(seed), trunk = createTreeTrunk();
      try {
        const height = pineHeight(seed), bounds = geometry.boundingBox!;
        // Legacy crown omits its separate trunk. Compare the whole rooted tree,
        // then independently compare the leaf-only bounding height to the crown.
        const legacyHeight = legacy.boundingBox!.max.y + TRUNK_HEIGHT;
        expect(bounds.max.y - bounds.min.y).toBeGreaterThanOrEqual(legacyHeight * 0.95);
        expect(bounds.max.y - bounds.min.y).toBeLessThanOrEqual(legacyHeight * 1.05);
        expect(bounds.min.y).toBe(-TRUNK_HEIGHT);
        expect(bounds.max.y + TRUNK_HEIGHT).toBeCloseTo(height, 5);
        expect(triangles(geometry) + triangles(trunk)).toBeLessThanOrEqual(1200);
        expect(geometry.groups).toHaveLength(0);
        expect(Object.keys(geometry.attributes).sort()).toEqual(["color", "normal", "position", "surface"]);
        expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
        const leaves = leafLayers(geometry).flat().reduce((sum, part) => sum.union(part), new Box3());
        expect(leaves.min.y).toBeCloseTo(legacy.boundingBox!.min.y, 5);
        expect(leaves.max.y).toBeCloseTo(legacy.boundingBox!.max.y, 5);
        expect(leaves.getSize(new Vector3()).y / legacy.boundingBox!.getSize(new Vector3()).y).toBeGreaterThanOrEqual(0.95);
        expect(leaves.getSize(new Vector3()).y / legacy.boundingBox!.getSize(new Vector3()).y).toBeLessThanOrEqual(1.05);
        expect(Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)).toBeLessThanOrEqual(2.7 + 1e-6);
        const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
        const a = new Vector3(), b = new Vector3(), c = new Vector3();
        for (let i = 0; i < position.count; i++) {
          expect(new Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 5);
        }
        for (let i = 0; i < geometry.index!.count; i += 3) {
          a.fromBufferAttribute(position, geometry.index!.getX(i));
          b.fromBufferAttribute(position, geometry.index!.getX(i + 1));
          c.fromBufferAttribute(position, geometry.index!.getX(i + 2));
          expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-12);
        }
        console.info(`B2-191 seed=${seed}: crown ${triangles(legacy)} -> ${triangles(geometry)}; with legacy trunk ${triangles(legacy) + triangles(trunk)} -> ${triangles(geometry) + triangles(trunk)}; layers=${leafLayers(geometry).length}; draws=1`);
      } finally { geometry.dispose(); legacy.dispose(); trunk.dispose(); }
    });

    it(`${seed}: separates 5-8 thin needle layers with actual sky gaps`, () => {
      const geometry = createPineCrownV2(seed), material = new MeshBasicMaterial({ side: DoubleSide });
      try {
        const layers = leafLayers(geometry);
        expect(layers.length).toBeGreaterThanOrEqual(5);
        expect(layers.length).toBeLessThanOrEqual(8);
        const bounds = layers.map(layer => layer.reduce((sum, part) => sum.union(part), new Box3()));
        for (const layer of layers) {
          expect(layer.length).toBeGreaterThanOrEqual(9);
          for (const blade of layer) {
            const size = blade.getSize(new Vector3());
            expect(size.y / Math.max(size.x, size.z)).toBeLessThan(0.7);
          }
        }
        const mesh = new Mesh(geometry, material), ray = new Raycaster();
        mesh.updateMatrixWorld();
        for (let i = 1; i < bounds.length; i++) {
          const lower = bounds[i - 1]!, upper = bounds[i]!;
          expect(upper.min.y - lower.max.y).toBeGreaterThan(0.3);
          // Off-axis horizontal rays miss even when including wooden branches.
          const y = (lower.max.y + upper.min.y) / 2;
          for (const z of [-0.55, 0.55]) {
            ray.set(new Vector3(-3, y, z), new Vector3(1, 0, 0));
            expect(ray.intersectObject(mesh)).toHaveLength(0);
          }
        }
        // Broad upper shoulders prevent a Christmas-tree cone silhouette.
        const width = (box: Box3) => Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
        expect(width(bounds[bounds.length - 1]!) / width(bounds[0]!)).toBeGreaterThan(0.7);
      } finally { geometry.dispose(); material.dispose(); }
    });

    it(`${seed}: has bare lower wood, snapped stubs and palette-only cracked bark`, () => {
      const geometry = createPineCrownV2(seed);
      try {
        const position = geometry.getAttribute("position"), surface = geometry.getAttribute("surface"), color = geometry.getAttribute("color");
        const base = new Color(RAMP_PRESETS.crown), dark = new Color(PALETTE.rockDark), dusk = new Color(PALETTE.dusk);
        const deep = new Color(PALETTE.forestDeep), light = new Color(PALETTE.forestLight);
        expect(new Set(Array.from(surface.array))).toEqual(new Set([0, 1]));
        expect(surface.count).toBe(position.count);
        expect(color.count).toBe(position.count);
        const bare = [], stubs = [], stripeColors = new Set<string>();
        for (let i = 0; i < position.count; i++) {
          const wood = surface.getX(i) === 1;
          const pigment = new Color(color.getX(i), color.getY(i), color.getZ(i)).multiply(base);
          // Undo ramp compensation before checking a permitted PALETTE lerp.
          const from = wood ? dark : deep, to = wood ? dusk : light;
          const ratio = (pigment.r - from.r) / (to.r - from.r);
          expect(ratio).toBeGreaterThanOrEqual(-1e-6);
          expect(ratio).toBeLessThanOrEqual(wood ? 0.15 : 1);
          const expected = from.clone().lerp(to, ratio);
          expect(pigment.g).toBeCloseTo(expected.g, 6);
          expect(pigment.b).toBeCloseTo(expected.b, 6);
          expect(0.2126 * pigment.r + 0.7152 * pigment.g + 0.0722 * pigment.b).toBeGreaterThanOrEqual(0.06);
          const rootedY = position.getY(i) + TRUNK_HEIGHT;
          if (rootedY < pineHeight(seed) * 2 / 3 - 1e-5) {
            expect(wood).toBe(true);
            bare.push(i);
            if (rootedY > pineHeight(seed) * 0.2 && Math.hypot(position.getX(i), position.getZ(i)) > 0.34) stubs.push(i);
            if (rootedY === 0) stripeColors.add(pigment.toArray().map(value => value.toFixed(5)).join(":"));
          }
        }
        expect(bare.length).toBeGreaterThan(0);
        expect(stubs.length).toBeGreaterThanOrEqual(9);
        expect(stripeColors.size).toBeGreaterThanOrEqual(3);
        // Repeated colours run vertically, rather than becoming horizontal rings.
        for (const shade of stripeColors) {
          const heights = new Set<number>();
          for (let i = 0; i < position.count; i++) if (surface.getX(i) === 1) {
            const pigment = new Color(color.getX(i), color.getY(i), color.getZ(i)).multiply(base);
            if (pigment.toArray().map(value => value.toFixed(5)).join(":") === shade) heights.add(position.getY(i));
          }
          expect(heights.size).toBeGreaterThanOrEqual(3);
        }
      } finally { geometry.dispose(); }
    });
  }

  it("repeats all attributes and indices exactly and supplies three distinct silhouettes", () => {
    const silhouettes = new Set<string>();
    for (const seed of [...PINE_VARIANT_SEEDS, 303, -1]) {
      const first = createPineCrownV2(seed), second = createPineCrownV2(seed);
      try {
        for (const name of Object.keys(first.attributes)) {
          expect(Array.from(first.getAttribute(name).array)).toEqual(Array.from(second.getAttribute(name).array));
        }
        expect(Array.from(first.index!.array)).toEqual(Array.from(second.index!.array));
        expect(triangles(first) + 42).toBeLessThanOrEqual(1200);
        if (PINE_VARIANT_SEEDS.includes(seed as typeof PINE_VARIANT_SEEDS[number])) {
          silhouettes.add(JSON.stringify(Array.from(first.getAttribute("position").array)));
        }
      } finally { first.dispose(); second.dispose(); }
    }
    expect(silhouettes.size).toBe(3);
  });

  it("constructs within 20 ms of the old factory on Node", () => {
    const medianTime = (factory: typeof createPineCrown) => {
      const samples: number[] = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now();
        const geometry = factory(PINE_VARIANT_SEEDS[i % 3]);
        const elapsed = performance.now() - start;
        geometry.dispose();
        if (i >= 3) samples.push(elapsed);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
    };
    const before = medianTime(createPineCrown), after = medianTime(createPineCrownV2);
    expect(after - before).toBeLessThanOrEqual(20);
    process.stdout.write(`B2-191 construction median: ${before.toFixed(3)} -> ${after.toFixed(3)} ms\n`);
  });

  it("reports the High streamed world's triangle budget before and after the installed factory swap", () => {
    const scene = new Scene(), composed = createWorldScene({ ...createMeshPhysics(), scene, quality: "High" });
    const replacements = PINE_VARIANT_SEEDS.map(createPineCrownV2);
    const legacy = PINE_VARIANT_SEEDS.map(createPineCrown);
    const reports: string[] = [];
    let affectedInstances = 0;
    try {
      for (const t of [0, 0.1, 0.2, 0.4, 0.6, 0.85, 1]) {
        composed.update(pathPointAt(t), 0);
        let after = 0, delta = 0, groundSaving = 0;
        scene.traverseVisible(object => {
          if (!(object instanceof Mesh) || !object.visible) return;
          const count = object instanceof InstancedMesh ? object.count : 1;
          after += triangles(object.geometry) * count;
          // B2-194's ground kit also saves four triangles per submitted solid.
          if (object.name === "ground-wood-stone") groundSaving += 4 * count;
        });
        for (const mesh of composed.foliageMeshes) {
          // The live scene now contains V2; infer the legacy cost for the same
          // submitted instances instead of looking for the removed old crowns.
          const variant = replacements.findIndex(shape => triangles(shape) === triangles(mesh.geometry)
            && mesh.geometry.getAttribute("surface") !== undefined);
          if (variant >= 0) {
            delta += (triangles(mesh.geometry) - triangles(legacy[variant]!)) * mesh.count;
            affectedInstances += mesh.count;
          }
        }
        const before = after - delta + groundSaving;
        reports.push(`t=${t}: ${before} -> ${after}`);
        expect(after, reports.join("; ")).toBeLessThanOrEqual(before * 1.25);
      }
      expect(affectedInstances).toBeGreaterThan(0);
      process.stdout.write(`B2-194 High streamed scene (same submitted instances, colour pass, unchanged trunks/broadleaves): ${reports.join("; ")}\n`);
    } finally {
      composed.dispose(); replacements.forEach(shape => shape.dispose()); legacy.forEach(shape => shape.dispose());
    }
  }, 60_000);
});
