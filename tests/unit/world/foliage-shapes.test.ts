import { type BufferGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { TRUNK_HEIGHT } from "../../../src/features/world/foliage/colliders";
import { createBroadleafCrown as legacyBroadleaf, createPineCrown as legacyPine } from "../../../src/features/world/foliage/instances";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, PINE_VARIANT_SEEDS } from "../../../src/features/world/foliage/shapes";

const variants = [
  ...PINE_VARIANT_SEEDS.map(seed => ({ kind: "pine", seed, create: createPineCrown })),
  ...BROADLEAF_VARIANT_SEEDS.map(seed => ({ kind: "broadleaf", seed, create: createBroadleafCrown })),
];
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

describe("painted procedural tree shapes", () => {
  it("provides at least three distinct pines and two broadleaves through the original exports", () => {
    expect(PINE_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(BROADLEAF_VARIANT_SEEDS.length).toBeGreaterThanOrEqual(2);
    expect(legacyPine).toBe(createPineCrown);
    expect(legacyBroadleaf).toBe(createBroadleafCrown);
    const shapes = variants.map(variant => variant.create(variant.seed));
    try {
      expect(new Set(shapes.map(shape => JSON.stringify(Array.from(shape.getAttribute("position").array)))).size).toBe(variants.length);
      expect(triangles(shapes[0]!)).toBe(3 * 44);
      expect(triangles(shapes[1]!)).toBe(4 * 44);
      expect(triangles(shapes[2]!)).toBe(5 * 44);
      expect(triangles(shapes[3]!)).toBe(4 * 20);
      expect(triangles(shapes[4]!)).toBe(6 * 20);
    } finally { shapes.forEach(shape => shape.dispose()); }
  });

  for (const { kind, seed, create } of variants) {
    it(`${kind} ${seed}: stays within triangle/clearance budgets and repeats exactly`, () => {
      const crown = create(seed), repeated = create(seed), trunk = createTreeTrunk();
      try {
        expect(triangles(crown) + triangles(trunk)).toBeLessThanOrEqual(300);
        for (const name of ["position", "normal", "color"]) {
          expect(Array.from(crown.getAttribute(name).array)).toEqual(Array.from(repeated.getAttribute(name).array));
        }
        expect(Array.from(crown.index!.array)).toEqual(Array.from(repeated.index!.array));
        crown.computeBoundingBox();
        const bounds = crown.boundingBox!;
        const size = bounds.getSize(new Vector3());
        expect(size.y).toBeGreaterThanOrEqual(3);
        expect(size.y).toBeLessThanOrEqual(5.5);
        expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(4.4);
        if (kind === "broadleaf") expect(size.y).toBeLessThan(Math.max(size.x, size.z));
        // Anchor stays at 5 m; the old 3 m exposed trunk is now 30% shorter.
        expect(TRUNK_HEIGHT + bounds.min.y).toBeCloseTo(3 * 0.7, 5);
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

  it("tapers a full-height trunk without changing collider constants or transforms", () => {
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
    } finally { trunk.dispose(); }
  });
});
