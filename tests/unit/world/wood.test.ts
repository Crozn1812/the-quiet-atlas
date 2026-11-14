import { reportBudget } from "./report-budget";
import { BufferGeometry, Color, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import {
  createBenchGeometry, createFenceSpanGeometry, createLogGeometry,
  createPlankGeometry, createPostGeometry, createStumpGeometry,
} from "../../../src/features/world/props/wood";

const seeds = [0, 1, 2, 3, 77, -19, 0xffffffff];
const variants = [
  { name: "log", create: createLogGeometry, budget: 400, bounds: [[2, 4], [0.35, 1], [0.3, 0.95]], grounded: true },
  { name: "stump", create: createStumpGeometry, budget: 300, bounds: [[0.65, 1.4], [0.43, 0.76], [0.65, 1.4]], grounded: true },
  { name: "plank", create: (seed: number) => createPlankGeometry(2.75, seed), budget: 60,
    bounds: [[2.75, 2.75], [0.05, 0.09], [0.22, 0.25]], grounded: false },
  { name: "post", create: (seed: number) => createPostGeometry(1.6, seed), budget: 80,
    bounds: [[0.1, 0.22], [1.6, 1.6], [0.1, 0.22]], grounded: true },
  { name: "fence", create: (seed: number) => createFenceSpanGeometry(seed, { flowers: false }), budget: 600,
    bounds: [[2.2, 2.7], [1.05, 1.2], [0.12, 0.4]], grounded: true },
  { name: "flower fence", create: (seed: number) => createFenceSpanGeometry(seed, { flowers: true }), budget: 600,
    bounds: [[2.2, 2.7], [1.05, 1.2], [0.12, 0.4]], grounded: true },
  { name: "bench", create: createBenchGeometry, budget: 500,
    bounds: [[1.5, 1.8], [0.88, 0.94], [0.42, 0.6]], grounded: true },
] as const;
const palette = (key: keyof typeof PALETTE) => new Vector3(...new Color(PALETTE[key]).toArray());
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

function onMix(color: Vector3, a: Vector3, b: Vector3, max = 1): boolean {
  const direction = b.clone().sub(a), delta = color.clone().sub(a);
  const t = delta.dot(direction) / direction.lengthSq();
  return t >= -1e-6 && t <= max + 1e-6 && a.clone().addScaledVector(direction, t).distanceTo(color) < 1e-6;
}

// Barycentric pigment weights permit rock/rockDark with no more than 15% dusk.
function isWood(color: Vector3): boolean {
  const a = palette("rock"), b = palette("rockDark").sub(a), c = palette("dusk").sub(a);
  const delta = color.clone().sub(a);
  const bb = b.dot(b), cc = c.dot(c), bc = b.dot(c), denominator = bb * cc - bc * bc;
  const dark = (delta.dot(b) * cc - delta.dot(c) * bc) / denominator;
  const warm = (delta.dot(c) * bb - delta.dot(b) * bc) / denominator;
  return dark >= -1e-6 && warm >= -1e-6 && warm <= 0.15 + 1e-6 && dark + warm <= 1 + 1e-6
    && a.addScaledVector(b, dark).addScaledVector(c, warm).distanceTo(color) < 1e-6;
}
const isCut = (color: Vector3) => onMix(color, palette("sand"), palette("dusk"), 0.1);
const isGreen = (color: Vector3) => onMix(color, palette("forestDeep"), palette("forestLight"));
const isFlower = (color: Vector3) => color.distanceTo(palette("flower")) < 1e-6;
const isNail = (color: Vector3) => color.distanceTo(palette("ink").lerp(palette("rock"), 0.2)) < 1e-6;

function colorsOf(geometry: BufferGeometry): Vector3[] {
  const colors = geometry.getAttribute("color");
  return Array.from({ length: colors.count }, (_, i) => new Vector3().fromBufferAttribute(colors, i));
}

describe("B2-187 procedural wood kit", () => {
  for (const { name, create, budget, bounds, grounded } of variants) {
    it(`${name}: meets the triangle/draw-call budget with finite, nondegenerate faces`, () => {
      for (const seed of seeds) {
        const geometry = create(seed);
        try {
          expect(triangles(geometry)).toBeGreaterThan(20);
          reportBudget("tests/unit/world/wood.test.ts:60 triangles(geometry)", triangles(geometry), budget);
          expect(geometry.groups).toHaveLength(0); // One material, including foliage/flowers.
          const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
          expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
          expect(normals.count).toBe(positions.count);
          for (let i = 0; i < positions.count; i += 3) {
            const a = new Vector3().fromBufferAttribute(positions, i);
            const b = new Vector3().fromBufferAttribute(positions, i + 1);
            const c = new Vector3().fromBufferAttribute(positions, i + 2);
            const normal = b.sub(a).cross(c.sub(a));
            expect(normal.length()).toBeGreaterThan(1e-8);
            normal.normalize();
            for (let j = 0; j < 3; j++) {
              expect(new Vector3().fromBufferAttribute(normals, i + j).distanceTo(normal)).toBeLessThan(1e-6);
            }
          }
        } finally { geometry.dispose(); }
      }
    });

    it(`${name}: has metre-scale bounds and a documented origin`, () => {
      for (const seed of seeds) {
        const geometry = create(seed);
        try {
          const box = geometry.boundingBox!, size = box.getSize(new Vector3()).toArray();
          bounds.forEach(([min, max], axis) => {
            expect(size[axis]!).toBeGreaterThanOrEqual(min - 1e-6);
            expect(size[axis]!).toBeLessThanOrEqual(max + 1e-6);
          });
          if (grounded) expect(box.min.y).toBeCloseTo(0, 6);
          else expect(Math.abs(box.getCenter(new Vector3()).y)).toBeLessThan(0.01);
          expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
          const positions = geometry.getAttribute("position");
          for (let i = 0; i < positions.count; i++) {
            expect(new Vector3().fromBufferAttribute(positions, i).distanceTo(geometry.boundingSphere!.center))
              .toBeLessThanOrEqual(geometry.boundingSphere!.radius + 1e-6);
          }
        } finally { geometry.dispose(); }
      }
    });

    it(`${name}: has at least two wood shades, only palette lerps, and rare orange accents`, () => {
      for (const seed of seeds) {
        const geometry = create(seed);
        try {
          expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
          const colors = colorsOf(geometry), shades = new Set<string>();
          for (const color of colors) {
            if (isWood(color)) shades.add(color.toArray().map(value => value.toFixed(5)).join(","));
            expect(isWood(color) || isCut(color) || isGreen(color) || isFlower(color) || isNail(color)).toBe(true);
            expect(color.toArray().every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
            expect(color.dot(new Vector3(0.2126, 0.7152, 0.0722))).toBeGreaterThanOrEqual(0.06);
          }
          expect(shades.size).toBeGreaterThanOrEqual(2);
          expect(colors.some(isFlower)).toBe(name === "flower fence");
        } finally { geometry.dispose(); }
      }
    });

    it(`${name}: repeats all attributes and bounds exactly and produces three distinct shapes`, () => {
      const shapes = new Set<string>();
      for (const seed of [0, 1, 2, -19]) {
        const a = create(seed), b = create(seed);
        try {
          expect(Object.keys(a.attributes)).toEqual(Object.keys(b.attributes));
          for (const attribute of Object.keys(a.attributes)) {
            expect(Array.from(a.getAttribute(attribute).array)).toEqual(Array.from(b.getAttribute(attribute).array));
          }
          expect(a.index).toEqual(b.index);
          expect(a.groups).toEqual(b.groups);
          expect(a.boundingBox).toEqual(b.boundingBox);
          expect(a.boundingSphere).toEqual(b.boundingSphere);
          shapes.add(Array.from(a.getAttribute("position").array).join(","));
        } finally { a.dispose(); b.dispose(); }
      }
      expect(shapes.size).toBeGreaterThanOrEqual(3);
    });
  }

  it.each([0.15, 0.8, 1.7, 3.2])("respects requested post height and plank length %s", value => {
    for (const seed of seeds) {
      const post = createPostGeometry(value, seed), plank = createPlankGeometry(value, seed);
      try {
        expect(post.boundingBox!.min.y).toBe(0);
        expect(post.boundingBox!.max.y).toBeCloseTo(value, 6);
        expect(plank.boundingBox!.getSize(new Vector3()).x).toBeCloseTo(value, 6);
        const positions = post.getAttribute("position"), corners = new Set<string>();
        for (let i = 0; i < positions.count; i++) {
          if (positions.getY(i) === 0 && Math.hypot(positions.getX(i), positions.getZ(i)) > 0.01) {
            corners.add(`${positions.getX(i)},${positions.getZ(i)}`);
          }
        }
        expect(corners.size).toBeGreaterThanOrEqual(6);
        expect(corners.size).toBeLessThanOrEqual(8);
      } finally { post.dispose(); plank.dispose(); }
    }
  });

  it.each([0, -1, Infinity, -Infinity, NaN])("rejects invalid dimensions %s", value => {
    expect(() => createPlankGeometry(value, 1)).toThrow(RangeError);
    expect(() => createPostGeometry(value, 1)).toThrow(RangeError);
  });

  it("paints both log ends with age rings and keeps moss on upward bark", () => {
    const geometry = createLogGeometry(77);
    try {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      const colors = colorsOf(geometry), box = geometry.boundingBox!;
      for (const x of [box.min.x, box.max.x]) {
        const cutShades = new Set<string>();
        for (let i = 0; i < positions.count; i++) {
          if (Math.abs(positions.getX(i) - x) < 1e-5 && isCut(colors[i]!)) {
            cutShades.add(colors[i]!.toArray().join(","));
            expect(Math.abs(normals.getX(i))).toBeCloseTo(1, 5);
          }
        }
        expect(cutShades.size).toBeGreaterThanOrEqual(2);
      }
      const moss = colors.flatMap((color, i) => isGreen(color) ? [i] : []);
      expect(moss.length).toBeGreaterThan(0);
      moss.forEach(i => expect(normals.getY(i)).toBeGreaterThan(0.45));
      // Compare opposite end radii, rather than including the broken limbs in the width.
      const radiusAt = (x: number) => {
        const z: number[] = [];
        for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getX(i) - x) < 1e-5) z.push(positions.getZ(i));
        return Math.max(...z) - Math.min(...z);
      };
      expect(radiusAt(box.max.x)).toBeLessThan(radiusAt(box.min.x) * 0.9);
    } finally { geometry.dispose(); }
  });

  it("gives the stump flared roots and a jagged, ringed top", () => {
    const geometry = createStumpGeometry(77);
    try {
      const positions = geometry.getAttribute("position"), colors = colorsOf(geometry);
      const rootRadius: number[] = [], cutRadius: number[] = [], topHeights = new Set<number>();
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) === 0) rootRadius.push(Math.hypot(positions.getX(i), positions.getZ(i)));
        if (isCut(colors[i]!)) {
          cutRadius.push(Math.hypot(positions.getX(i) - 0.025, positions.getZ(i) - 0.01));
          topHeights.add(positions.getY(i));
        }
      }
      expect(Math.max(...rootRadius)).toBeGreaterThan(Math.max(...cutRadius) * 1.7);
      expect(topHeights.size).toBeGreaterThan(12);
      expect(new Set(colors.filter(isCut).map(color => color.toArray().join(","))).size).toBeGreaterThanOrEqual(2);
    } finally { geometry.dispose(); }
  });

  it("has chamfers, longitudinal grain bands and a bowed plank centre", () => {
    const geometry = createPlankGeometry(2, 77);
    try {
      const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
      const middle: number[] = [], ends: number[] = [], topShades = new Set<string>();
      const colors = colorsOf(geometry);
      let bevels = 0;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getX(i)) < 1e-5) middle.push(positions.getY(i));
        else ends.push(positions.getY(i));
        if (normals.getY(i) > 0.95) topShades.add(colors[i]!.toArray().join(","));
        if (Math.abs(normals.getY(i)) > 0.3 && Math.abs(normals.getZ(i)) > 0.3) bevels++;
      }
      expect(Math.min(...middle)).toBeLessThan(Math.min(...ends) - 0.002);
      expect(topShades.size).toBeGreaterThanOrEqual(3);
      expect(bevels).toBeGreaterThan(0);
    } finally { geometry.dispose(); }
  });

  it("adds only optional vines/flowers and keeps their surface area small", () => {
    for (const seed of seeds) {
      const plain = createFenceSpanGeometry(seed, { flowers: false });
      const flowering = createFenceSpanGeometry(seed, { flowers: true });
      try {
        for (const attribute of ["position", "normal", "color"]) {
          const prefix = Array.from(flowering.getAttribute(attribute).array).slice(0, plain.getAttribute(attribute).array.length);
          expect(prefix).toEqual(Array.from(plain.getAttribute(attribute).array));
        }
        expect(colorsOf(plain).some(isGreen)).toBe(false);
        const positions = flowering.getAttribute("position"), colors = colorsOf(flowering);
        let totalArea = 0, flowerArea = 0;
        for (let i = 0; i < positions.count; i += 3) {
          const a = new Vector3().fromBufferAttribute(positions, i);
          const b = new Vector3().fromBufferAttribute(positions, i + 1);
          const c = new Vector3().fromBufferAttribute(positions, i + 2);
          const area = b.sub(a).cross(c.sub(a)).length() / 2;
          totalArea += area;
          if (isFlower(colors[i]!)) flowerArea += area;
        }
        expect(colors.filter(isFlower)).toHaveLength(4 * 8 * 3);
        expect(colors.some(isGreen)).toBe(true);
        expect(flowerArea).toBeGreaterThan(0);
        expect(flowerArea / totalArea).toBeLessThan(0.01);
      } finally { plain.dispose(); flowering.dispose(); }
    }
  });

  it("has front-facing log end caps and usable bench seat/back surfaces", () => {
    const log = createLogGeometry(77), bench = createBenchGeometry(77), material = new MeshBasicMaterial({ vertexColors: true });
    try {
      const logMesh = new Mesh(log, material), benchMesh = new Mesh(bench, material);
      const center = log.boundingBox!.getCenter(new Vector3());
      for (const side of [-1, 1]) {
        const ray = new Raycaster(new Vector3(side * 5, center.y, 0), new Vector3(-side, 0, 0));
        expect(ray.intersectObject(logMesh).length).toBeGreaterThan(0);
      }
      const seat = new Raycaster(new Vector3(0, 1.5, -0.1), new Vector3(0, -1, 0)).intersectObject(benchMesh)[0];
      expect(seat?.point.y).toBeGreaterThan(0.45);
      expect(seat?.point.y).toBeLessThan(0.49);
      const back = new Raycaster(new Vector3(0, 0.63, -1), new Vector3(0, 0, 1)).intersectObject(benchMesh)[0];
      expect(back?.point.z).toBeGreaterThan(0.15);
      expect(back?.point.z).toBeLessThan(0.3);
    } finally { log.dispose(); bench.dispose(); material.dispose(); }
  });
});
