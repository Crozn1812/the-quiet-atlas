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
      const shape = shapes[foliageVariantAt(tree.x, tree.z, shapes.length)]!;
      const positions = shape.getAttribute("position");
      const surfaces = shape.getAttribute("surface");
      const shift = variant.crowns.geometry.getAttribute("canopyShift");
      const reach = variant.crowns.geometry.getAttribute("treeStyle").getZ(index);
      const rings = [-TRUNK_HEIGHT, -2.7, -0.2, 2.5].map(y => ({ y, center: new Vector3(), count: 0 }));
      let top = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        point.x += reach * shift.getX(i);
        point.applyMatrix4(matrix);
        top = Math.max(top, point.y - tree.y);
        if (surfaces.getX(i) === 0) {
          expect(shift.getX(i)).toBe(1);
          minLeafDistance = Math.min(minLeafDistance, nearestPath(point.x, point.z).distance);
        }
        if (surfaces.getX(i) === 1) {
          const ring = rings.find(ring => Math.abs(positions.getY(i) - ring.y) < 1e-6);
          if (ring) {
            // Include every rooted surface, not just the separate trunk mesh.
            expect(shift.getX(i)).toBe(0);
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

it("uses the same canopy reach in colour and shadow passes and resets bounds after tile replacement", () => {
  const foliage = createFoliage(canopy.length);
  const variants = foliage.species.broadleaf.variants;
  const originalBounds = variants.map(({ crowns }) => crowns.geometry.boundingBox!.clone());
  try {
    const crowns = foliage.species.broadleaf.crowns;
    for (const [material, source] of [[crowns.material, ShaderLib.toon!], [crowns.customDepthMaterial!, ShaderLib.depth!], [crowns.customDistanceMaterial!, ShaderLib.distance!]] as const) {
      const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.vertexShader).toContain("transformed.x += treeStyle.z * canopyShift.x;");
      expect(shader.vertexShader.indexOf("transformed.x +=")).toBeGreaterThan(shader.vertexShader.indexOf("transformed += shapeA"));
      expect(material.customProgramCacheKey()).toContain("trail-canopy-shift-v1");
    }
    for (const quality of ["Low", "Balanced", "High", "Low"] as const) {
      foliage.setTiles(canopy);
      foliage.setQuality(quality);
      for (const { crowns, crownBounds } of variants) if (crowns.count) {
        expect(crowns.geometry.boundingBox!.max.x).toBeGreaterThan(crownBounds.max.x);
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
    expect(total).toBe(894407);
    expect(total).toBeLessThanOrEqual(736223 * 1.25);
    expect(foliage.group.children).toHaveLength(10);
    process.stdout.write(`B2-196 240 m / High: trees=${trees.length}; triangles=${total}; ${sizes.join("; ")}; mesh slots=${foliage.group.children.length}\n`);
  } finally { foliage.dispose(); }
});
