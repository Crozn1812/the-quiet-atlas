import { Matrix4, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { expect, it } from "vitest";
import { TRUNK_HEIGHT } from "../../../src/features/world/foliage/colliders";
import { createFoliage, foliageVariantAt } from "../../../src/features/world/foliage/instances";
import { scatterTile } from "../../../src/features/world/foliage/scatter";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown } from "../../../src/features/world/foliage/shapes";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { PATH_WIDTH } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { tilesAlongPath } from "../../../src/features/world/terrain/tiles";

const trees = tilesAlongPath(240).flatMap(scatterTile);
const canopy = trees.filter(tree => tree.trailCanopy);

it("authors thick limbs at 55–70% height with 3–6 m reach and bounded construction cost", () => {
  const timings: number[] = [];
  for (const trail of [false, true]) {
    const samples: number[] = [];
    for (let i = 0; i < 31; i++) {
      const start = performance.now();
      const shape = createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], trail);
      samples.push(performance.now() - start);
      if (trail) {
        const positions = shape.getAttribute("position"), first = positions.count - 84;
        const center = (id: number) => [0, 1, 2].reduce((sum, j) => sum.add(new Vector3().fromBufferAttribute(positions, id + j)), new Vector3()).divideScalar(3);
        const top = shape.boundingBox!.max.y + TRUNK_HEIGHT;
        let section = 0;
        for (const count of [5, 5, 4]) {
          const root = center(first + section * 6), tip = center(first + (section + count - 1) * 6 + 3);
          expect((root.y + TRUNK_HEIGHT) / top).toBeGreaterThanOrEqual(0.55);
          expect((root.y + TRUNK_HEIGHT) / top).toBeLessThanOrEqual(0.70);
          const reach = Math.hypot(tip.x - root.x, tip.z - root.z);
          expect(reach * 1.35).toBeGreaterThanOrEqual(3);
          expect(reach * 1.4).toBeLessThanOrEqual(6);
          expect(new Vector3().fromBufferAttribute(positions, first + section * 6).distanceTo(root) * 1.35).toBeGreaterThanOrEqual(0.18);
          section += count;
        }
      }
      shape.dispose();
    }
    timings.push(samples.sort((a, b) => a - b)[15]!);
  }
  expect(timings[1]! - timings[0]!).toBeLessThan(20);
  process.stdout.write(`B2-198 construction median: ${timings.map(t => t.toFixed(3)).join(" -> ")} ms; crown=425 triangles; limbs=3\n`);
});

it("keeps trail canopy trunks clear of the path and opening camera (B2-196)", () => {
  const spawn = pathPointAt(0);
  expect(canopy.length).toBeGreaterThan(0);
  expect(canopy.length).toBeLessThanOrEqual(48); // Measured on HEAD before B2-196.
  for (const tree of canopy) {
    expect(tree.kind).toBe("broadleaf");
    expect(nearestPath(tree.x, tree.z).distance).toBeGreaterThanOrEqual(PATH_WIDTH / 2 + 2.5);
    expect(Math.hypot(tree.x - spawn.x, tree.z - spawn.z)).toBeGreaterThanOrEqual(12);
    expect(Math.abs(tree.lean)).toBeLessThanOrEqual(Math.PI / 30);
    // instances.ts grows trail crowns uniformly by 3 * scale, including bark.
    const heightScale = 3 * tree.scale;
    expect(tree.scale).toBeGreaterThanOrEqual(1.35 / 3);
    expect(tree.scale).toBeLessThanOrEqual(1.4 / 3);
    expect(heightScale).toBeGreaterThanOrEqual(1.35);
    expect(heightScale).toBeLessThanOrEqual(1.4);
  }
});

it("renders every selected trail shape 12–16 m high with trunk width <=1.4x and lean <=6 degrees", () => {
  const foliage = createFoliage(trees.length);
  const shapes = BROADLEAF_VARIANT_SEEDS.map(seed => createBroadleafCrown(seed));
  const counters = new Map<object, number>();
  const matrix = new Matrix4(), point = new Vector3();
  let low = Infinity, high = -Infinity, minLean = Infinity, maxLean = -Infinity, minLeafDistance = Infinity;
  try {
    foliage.setTiles(trees);
    for (const tree of trees) {
      const species = foliage.species[tree.kind];
      const variant = species.variants[foliageVariantAt(tree.x, tree.z, species.variants.length)]!;
      const index = counters.get(variant) ?? 0;
      counters.set(variant, index + 1);
      if (!tree.trailCanopy) continue;
      variant.crowns.getMatrixAt(index, matrix);
      const shape = tree.trailCanopy ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[0], true) : shapes[foliageVariantAt(tree.x, tree.z, shapes.length)]!;
      const positions = shape.getAttribute("position");
      const surfaces = shape.getAttribute("surface");
      const rings = [-TRUNK_HEIGHT, -2.7, -0.2, 2.5].map(y => ({ y, center: new Vector3(), count: 0 }));
      let top = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);

        point.applyMatrix4(matrix);
        top = Math.max(top, point.y - tree.y);
        if (surfaces.getX(i) === 0) {
          expect(variant.crowns.geometry.getAttribute("treeStyle").getZ(index)).toBe(1);
          minLeafDistance = Math.min(minLeafDistance, nearestPath(point.x, point.z).distance);
        }
        if (surfaces.getX(i) === 1) {
          const ring = rings.find(ring => Math.abs(positions.getY(i) - ring.y) < 1e-6);
          if (ring) {
            // Include every rooted surface, not just the separate trunk mesh.
            expect(variant.crowns.geometry.getAttribute("canopyShift")).toBeUndefined();
            ring.center.add(point); ring.count++;
          }
        }
      }
      for (const ring of rings) { expect(ring.count).toBeGreaterThan(0); ring.center.divideScalar(ring.count); }
      for (let i = 1; i < rings.length; i++) {
        const axis = rings[i]!.center.clone().sub(rings[i - 1]!.center);
        const barkLean = Math.atan2(Math.hypot(axis.x, axis.z), axis.y) * 180 / Math.PI;
        minLean = Math.min(minLean, barkLean); maxLean = Math.max(maxLean, barkLean);
      }
      low = Math.min(low, top); high = Math.max(high, top);
      expect(top).toBeGreaterThanOrEqual(12);
      expect(top).toBeLessThanOrEqual(16);
      // Measure every wooden triangle after the actual instance transform.
      for (let i = 0; i < shape.index!.count; i += 3) {
        const ids = [0, 1, 2].map(j => shape.index!.getX(i + j));
        if (surfaces.getX(ids[0]!) !== 1) continue;
        const vertices = ids.map(id => new Vector3().fromBufferAttribute(positions, id).applyMatrix4(matrix));
        for (let j = 0; j < 3; j++) expect(vertices[j]!.distanceTo(vertices[(j + 1) % 3]!)).toBeLessThanOrEqual(6);
      }
      expect(shape.index!.count / 3).toBeLessThanOrEqual(700);
      // The final 84 vertices are fourteen section pairs making three limbs.
      for (let i = positions.count - 84; i < positions.count; i += 6) {
        for (const offset of [0, 3]) {
          const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i + offset + j).applyMatrix4(matrix));
          const center = points.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(3);
          for (const v of points) expect(v.distanceTo(center)).toBeGreaterThanOrEqual(0.05);
        }
      }
      shape.dispose();
      // Crown X/Z axes also scale the rooted bark sleeve, unlike limb shear.
      expect(new Vector3().setFromMatrixColumn(matrix, 0).length()).toBeLessThanOrEqual(1.4 + 1e-6);
      expect(new Vector3().setFromMatrixColumn(matrix, 2).length()).toBeLessThanOrEqual(1.4 + 1e-6);
      variant.trunks.getMatrixAt(index, matrix);
      expect(new Vector3().setFromMatrixColumn(matrix, 1).length()).toBeCloseTo(TRUNK_HEIGHT * 3 * tree.scale, 5);
    }
    process.stdout.write(`B2-196 trail canopy: count=${canopy.length}; height=${low.toFixed(2)}–${high.toFixed(2)} m; bark lean=${minLean.toFixed(2)}–${maxLean.toFixed(2)} deg; nearest leaf/path=${minLeafDistance.toFixed(2)} m\n`);
    expect(maxLean, "Every rendered bark segment must respect the lean limit").toBeLessThanOrEqual(6);
    expect(minLeafDistance).toBeLessThan(PATH_WIDTH / 2);
  } finally { foliage.dispose(); shapes.forEach(shape => shape.dispose()); }
});

it("selects the same authored canopy in colour and shadow passes and keeps conservative bounds", () => {
  const foliage = createFoliage(canopy.length);
  const variants = foliage.species.broadleaf.variants;
  const originalBounds = variants.map(({ crowns }) => crowns.geometry.boundingBox!.clone());
  try {
    const crowns = foliage.species.broadleaf.crowns;
    for (const [material, source] of [[crowns.material, ShaderLib.toon!], [crowns.customDepthMaterial!, ShaderLib.depth!], [crowns.customDistanceMaterial!, ShaderLib.distance!]] as const) {
      const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.vertexShader).toContain("mix(shapeA * treeA() + shapeB * treeB(), trailShape, treeStyle.z)");

      expect(material.customProgramCacheKey()).toContain("trail-canopy-shape-v2");
    }
    for (const quality of ["Low", "Balanced", "High", "Low"] as const) {
      foliage.setTiles(canopy);
      foliage.setQuality(quality);
      for (const { crowns, crownBounds } of variants) if (crowns.count) {
        expect(crowns.geometry.boundingBox).toEqual(crownBounds);
      }
      foliage.setTiles(canopy.map(({ x, y, z, kind }) => ({ x, y, z, kind, scale: 1, lean: 0 })));
      variants.forEach(({ crowns }, i) => {
        expect(crowns.geometry.boundingBox).toEqual(originalBounds[i]);
        const style = crowns.geometry.getAttribute("treeStyle");
        for (let j = 0; j < crowns.count; j++) expect(style.getZ(j)).toBe(0);
      });
    }
  } finally { foliage.dispose(); }
});

it("reports the foliage geometry budget after fuller pine needles", () => {
  const foliage = createFoliage(trees.length);
  try {
    const triangles = (variant: typeof foliage.species.broadleaf.variants[number]) =>
      (variant.trunks.geometry.index!.count + variant.crowns.geometry.index!.count) / 3;
    const total = trees.reduce((sum, tree) => {
      const variants = foliage.species[tree.kind].variants;
      return sum + triangles(variants[foliageVariantAt(tree.x, tree.z, variants.length)]!);
    }, 0);
    const sizes = Object.entries(foliage.species).map(([kind, species]) => `${kind}=${species.variants.map(triangles).join("/")}`);
    expect(trees.length).toBeLessThanOrEqual(1801);
    // B2-191b: 552-triangle needle-mass crowns replace B2-194's thin pines.
    // Keep the pre-B2-194 corridor baseline and +25% ceiling used by foliage.test.ts.
    // ADR 0017 shortens the sampled corridor; retain the original triangle cap.
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(736223 * 1.25);
    expect(foliage.group.children).toHaveLength(10);
    process.stdout.write(`B2-196 240 m / High: trees=${trees.length}; triangles=${total}; ${sizes.join("; ")}; mesh slots=${foliage.group.children.length}\n`);
  } finally { foliage.dispose(); }
});
