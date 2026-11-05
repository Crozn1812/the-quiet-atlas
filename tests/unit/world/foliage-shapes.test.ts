import { type BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { TRUNK_HEIGHT, TRUNK_RADIUS } from "../../../src/features/world/foliage/colliders";
import { RAMP_PRESETS } from "../../../src/features/world/materials/ramp";
import { createBroadleafCrown as legacyBroadleaf, createPineCrown as legacyPine } from "../../../src/features/world/foliage/instances";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, mossColor, pineHeight, PINE_VARIANT_SEEDS } from "../../../src/features/world/foliage/shapes";

const variants = [
  ...PINE_VARIANT_SEEDS.map(seed => ({ kind: "pine", seed, create: createPineCrown })),
  ...BROADLEAF_VARIANT_SEEDS.map(seed => ({ kind: "broadleaf", seed, create: createBroadleafCrown })),
];
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

describe("painted procedural tree shapes", () => {
  it("provides at least three distinct pines and three broadleaf shapes through the original exports", () => {
    expect(PINE_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(BROADLEAF_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(legacyPine).toBe(createPineCrown);
    expect(legacyBroadleaf).toBe(createBroadleafCrown);
    const shapes = variants.map(variant => variant.create(variant.seed));
    try {
      expect(new Set(shapes.map(shape => JSON.stringify(Array.from(shape.getAttribute("position").array)))).size).toBe(variants.length);
      expect(triangles(shapes[0]!)).toBe(3 * 44);
      expect(triangles(shapes[1]!)).toBe(4 * 44);
      expect(triangles(shapes[2]!)).toBe(5 * 44);
    } finally { shapes.forEach(shape => shape.dispose()); }
  });

  for (const { kind, seed, create } of variants) {
    it(`${kind} ${seed}: stays within triangle/clearance budgets and repeats exactly`, () => {
      const crown = create(seed), repeated = create(seed), trunk = createTreeTrunk();
      try {
        expect(triangles(crown) + triangles(trunk)).toBeLessThanOrEqual(600);
        for (const name of ["position", "normal", "color"]) {
          expect(Array.from(crown.getAttribute(name).array)).toEqual(Array.from(repeated.getAttribute(name).array));
        }
        expect(Array.from(crown.index!.array)).toEqual(Array.from(repeated.index!.array));
        crown.computeBoundingBox();
        const bounds = crown.boundingBox!;
        const size = bounds.getSize(new Vector3());
        expect(size.y).toBeGreaterThanOrEqual(3);
        expect(size.y).toBeLessThanOrEqual(kind === "pine" ? 6 : 5.5);
        expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(4.4);
        if (kind === "pine") {
          // B2-129: Da Lat pines replace the 7–8 m fir silhouette with a high,
          // narrow crown; its bottom exposes exactly the lower two thirds.
          const totalHeight = TRUNK_HEIGHT + bounds.max.y;
          expect(totalHeight).toBeCloseTo(pineHeight(seed), 5);
          expect(totalHeight).toBeGreaterThanOrEqual(14);
          expect(totalHeight).toBeLessThanOrEqual(18);
          expect((TRUNK_HEIGHT + bounds.min.y) / totalHeight).toBeCloseTo(2 / 3, 6);
          expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(2.7 + 1e-6);
          expect(size.y / Math.max(size.x, size.z)).toBeGreaterThanOrEqual(1.8);
        } else {
          const positions = crown.getAttribute("position"), surfaces = crown.getAttribute("surface");
          const leafHeights = Array.from({ length: positions.count }, (_, i) => i)
            .filter(i => surfaces.getX(i) === 0).map(i => positions.getY(i) + TRUNK_HEIGHT);
          expect(Math.min(...leafHeights)).toBeCloseTo(5.2, 5);
          expect(Math.max(...leafHeights)).toBeCloseTo(7.7, 5);
        }
        const normals = crown.getAttribute("normal");
        expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
      } finally { crown.dispose(); repeated.dispose(); trunk.dispose(); }
    });

    it(`${kind} ${seed}: uses neutral [0.82, 1] watercolor washes that brighten upwards`, () => {
      const crown = create(seed);
      try {
        const positions = crown.getAttribute("position"), colors = crown.getAttribute("color");
        expect(colors.count).toBe(positions.count);
        const middle = (crown.boundingBox!.min.y + crown.boundingBox!.max.y) / 2;
        const halves = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }];
        const samples: { height: number; value: number }[] = [];
        for (let i = 0; i < positions.count; i++) {
          if (kind === "broadleaf" && crown.getAttribute("surface").getX(i) !== 0) continue;
          const value = colors.getX(i);
          expect(value).toBeGreaterThanOrEqual(0.82);
          expect(value).toBeLessThanOrEqual(1);
          expect(colors.getY(i)).toBe(value);
          expect(colors.getZ(i)).toBe(value);
          const height = positions.getY(i);
          const half = halves[height > middle ? 1 : 0]!;
          half.sum += value; half.count++;
          samples.push({ height, value });
        }
        expect(halves[1]!.sum / halves[1]!.count).toBeGreaterThan(halves[0]!.sum / halves[0]!.count);
        samples.sort((a, b) => a.height - b.height);
        for (let i = 1; i < samples.length; i++) expect(samples[i]!.value).toBeGreaterThanOrEqual(samples[i - 1]!.value - 1e-7);
      } finally { crown.dispose(); }
    });
  }

  it("tapers the unit visual trunk without changing collider constants", () => {
    const trunk = createTreeTrunk();
    try {
      const positions = trunk.getAttribute("position");
      const radiusAt = (height: number, centerX: number) => {
        let radius = 0;
        for (let i = 0; i < positions.count; i++) {
          if (positions.getY(i) === height) radius = Math.max(radius, Math.hypot(positions.getX(i) - centerX, positions.getZ(i)));
        }
        return radius;
      };
      expect(radiusAt(0.5, 0.05)).toBeCloseTo(radiusAt(-0.5, 0) * 0.5, 6);
      trunk.computeBoundingBox();
      expect(trunk.boundingBox!.max.y - trunk.boundingBox!.min.y).toBe(1);
      expect(triangles(trunk)).toBe(42);
      for (let i = 0; i < positions.count; i++) {
        expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(TRUNK_RADIUS + 1e-7);
      }
    } finally { trunk.dispose(); }
  });

  it("paints darker moss at the root and favours upward/damp faces using palette recipes", () => {
    const trunk = createTreeTrunk(true), base = new Color(RAMP_PRESETS.trunk);
    const luma = (color: Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    try {
      const positions = trunk.getAttribute("position"), colors = trunk.getAttribute("color");
      const halves = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }];
      for (let i = 0; i < positions.count; i++) {
        const color = new Color(colors.getX(i), colors.getY(i), colors.getZ(i)).multiply(base);
        expect([color.r, color.g, color.b].every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        const half = halves[positions.getY(i) < 0 ? 0 : 1]!;
        half.sum += luma(color); half.count++;
      }
      expect(halves[0]!.sum / halves[0]!.count).toBeLessThan(halves[1]!.sum / halves[1]!.count);
      // Moss shifts the hue towards green on damp/upward surfaces.
      const greenRatio = (color: Color) => color.g * base.g / (color.r * base.r);
      expect(greenRatio(mossColor(0.4, 1, 1))).toBeGreaterThan(greenRatio(mossColor(0.4, 0, 0)));
    } finally { trunk.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: has real sun gaps between leaf clusters`, () => {
    const geometry = createBroadleafCrown(seed), material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const surface = geometry.getAttribute("surface");
      geometry.setIndex(Array.from(geometry.index!.array).filter(index => surface.getX(index) === 0));
      const mesh = new Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const ray = new Raycaster(), down = new Vector3(0, -1, 0);
      let gaps = 0, hits = 0;
      for (let x = -1.4; x <= 1.4; x += 0.2) for (let z = -1.4; z <= 1.4; z += 0.2) {
        ray.set(new Vector3(x, 4, z), down);
        if (ray.intersectObject(mesh).length) hits++; else gaps++;
      }
      expect(gaps / (gaps + hits)).toBeGreaterThan(0.1);
      expect(hits / (gaps + hits)).toBeGreaterThan(0.3);
    } finally { geometry.dispose(); material.dispose(); }
  });

  for (const seed of BROADLEAF_VARIANT_SEEDS) it(`broadleaf ${seed}: keeps hanging ribbons attached and lit on both sides`, () => {
    const geometry = createBroadleafCrown(seed);
    try {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      const surface = geometry.getAttribute("surface"), hanging = geometry.getAttribute("hanging");
      const ribbons = Array.from({ length: positions.count }, (_, i) => i).filter(i => surface.getX(i) === 2);
      expect(ribbons).toHaveLength(3 * 16);
      for (const i of ribbons) {
        expect(hanging.getX(i)).toBe(1);
        expect(new Vector3().fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 6);
        expect(positions.getY(i) + TRUNK_HEIGHT).toBeGreaterThan(2);
      }
      for (let ribbon = 0; ribbon < 3; ribbon++) for (let vertex = 0; vertex < 8; vertex++) {
        const front = ribbons[ribbon * 16 + vertex]!, back = ribbons[ribbon * 16 + vertex + 8]!;
        expect(new Vector3().fromBufferAttribute(positions, front)).toEqual(new Vector3().fromBufferAttribute(positions, back));
        expect(new Vector3().fromBufferAttribute(normals, front).dot(new Vector3().fromBufferAttribute(normals, back))).toBeCloseTo(-1, 6);
      }
    } finally { geometry.dispose(); }
  });
});
