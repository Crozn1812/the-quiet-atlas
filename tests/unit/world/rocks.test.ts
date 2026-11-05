import { BufferGeometry, Color, Group, Mesh, MeshToonMaterial, Vector2, Vector3, type DataTexture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { createRockGeometry, createRockStack, type RockKind } from "../../../src/features/world/props/rocks";

afterEach(() => { disposeRampGradients(); vi.restoreAllMocks(); });

const kinds = ["pebble", "stone", "boulder", "slab"] as const;
const limits: Record<RockKind, number> = { pebble: 80, stone: 200, boulder: 400, slab: 160 };
const triangles = (geometry: BufferGeometry) => geometry.getAttribute("position").count / 3;
function faces(geometry: BufferGeometry) {
  const p = geometry.getAttribute("position");
  return Array.from({ length: p.count / 3 }, (_, i) => {
    const a = new Vector3().fromBufferAttribute(p, i * 3);
    const b = new Vector3().fromBufferAttribute(p, i * 3 + 1);
    const c = new Vector3().fromBufferAttribute(p, i * 3 + 2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    return { a, b, c, area: cross.length() / 2, normal: cross.normalize() };
  });
}
function paletteDistance(color: Vector3, a: Color, b: Color) {
  const start = new Vector3(a.r, a.g, a.b), delta = new Vector3(b.r, b.g, b.b).sub(start);
  const t = Math.max(0, Math.min(1, color.clone().sub(start).dot(delta) / delta.lengthSq()));
  return color.distanceTo(start.addScaledVector(delta, t));
}
function expectPalette(geometry: BufferGeometry) {
  const rock = new Color(PALETTE.rock);
  const pairs = [[new Color(PALETTE.rockDark), rock], [rock, new Color(PALETTE.sand)], [rock, new Color(PALETTE.grass)]];
  const c = geometry.getAttribute("color");
  expect(c.count).toBe(geometry.getAttribute("position").count);
  for (let i = 0; i < c.count; i++) {
    const color = new Vector3(c.getX(i), c.getY(i), c.getZ(i));
    expect(Math.min(...pairs.map(([a, b]) => paletteDistance(color, a!, b!)))).toBeLessThan(1e-6);
    expect(color.dot(new Vector3(0.2126, 0.7152, 0.0722))).toBeGreaterThanOrEqual(0.06);
  }
}

describe("shared cut-plane rock kit", () => {
  for (const kind of kinds) {
    it(`${kind}: respects metre bounds, triangle limits and has at least four seeded shapes`, () => {
      const variants = new Set<string>();
      for (let seed = 0; seed < 16; seed++) {
        const geometry = createRockGeometry(kind, seed);
        try {
          expect(triangles(geometry)).toBeGreaterThan(12);
          expect(triangles(geometry)).toBeLessThanOrEqual(limits[kind]);
          expect(geometry.groups).toHaveLength(0);
          const bounds = geometry.boundingBox!, size = bounds.getSize(new Vector3());
          expect(bounds.min.y).toBe(0);
          expect(bounds.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
          expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0, 6);
          const [min, max] = kind === "pebble" ? [0.1, 0.3] : kind === "stone" ? [0.3, 0.8]
            : kind === "boulder" ? [1.2, 3] : [0.1, 1];
          for (const value of size.toArray()) {
            expect(value).toBeGreaterThanOrEqual(min!);
            expect(value).toBeLessThanOrEqual(max!);
          }
          if (kind === "slab") expect(size.y / Math.min(size.x, size.z)).toBeLessThan(0.33);
          expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
          variants.add(JSON.stringify(Array.from(geometry.getAttribute("position").array)));
        } finally { geometry.dispose(); }
      }
      expect(variants.size).toBeGreaterThanOrEqual(4);
    });

    it(`${kind}: has closed outward faces and at least 30% coplanar fracture triangles`, () => {
      for (const seed of [0, 1, 2, 3]) {
        const geometry = createRockGeometry(kind, seed);
        try {
          const meshFaces = faces(geometry), edges = new Map<string, number>();
          const normals = geometry.getAttribute("normal");
          let volume = 0;
          meshFaces.forEach(({ a, b, c, normal, area }, i) => {
            expect(area).toBeGreaterThan(1e-8);
            for (let j = 0; j < 3; j++) expect(new Vector3().fromBufferAttribute(normals, i * 3 + j).distanceTo(normal))
              .toBeLessThan(1e-6);
            volume += a.dot(b.clone().cross(c)) / 6;
            const keys = [a, b, c].map(p => p.toArray().map(v => v.toFixed(7)).join(","));
            for (let j = 0; j < 3; j++) {
              const key = [keys[j], keys[(j + 1) % 3]].sort().join(";");
              edges.set(key, (edges.get(key) ?? 0) + 1);
            }
          });
          expect(volume).toBeGreaterThan(0);
          expect([...edges.values()].every(count => count === 2)).toBe(true);
          const planar = meshFaces.filter((face, i) => meshFaces.some((other, j) => i !== j
            && face.normal.dot(other.normal) > 0.99999
            && Math.abs(face.normal.dot(other.a.clone().sub(face.a))) < 1e-6));
          expect(planar.length / meshFaces.length).toBeGreaterThanOrEqual(0.3);
        } finally { geometry.dispose(); }
      }
    });

    it(`${kind}: repeats all attributes and palette pigment regardless of runtime random state`, () => {
      // Three uses Math.random for UUIDs; those resource IDs must not affect the asset.
      const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
      const first = createRockGeometry(kind, -17, true);
      random.mockReturnValue(0.9);
      const second = createRockGeometry(kind, -17, true);
      const coastal = createRockGeometry(kind, -17);
      try {
        for (const name of Object.keys(first.attributes)) expect(first.getAttribute(name).array).toEqual(second.getAttribute(name).array);
        expect(first.boundingBox).toEqual(second.boundingBox);
        expect(first.boundingSphere).toEqual(second.boundingSphere);
        expectPalette(first);
        expectPalette(coastal);
      } finally { first.dispose(); second.dispose(); coastal.dispose(); random.mockRestore(); }
    });
  }

  it("uses brighter bevels, upward moss only on request, and rockDark on downward faces", () => {
    const dry = createRockGeometry("boulder", 4), mossy = createRockGeometry("boulder", 4, true);
    try {
      const normal = dry.getAttribute("normal"), a = dry.getAttribute("color"), b = mossy.getAttribute("color");
      const dark = new Color(PALETTE.rockDark), rock = new Color(PALETTE.rock);
      let moss = 0, bright = 0, up = 0, down = 0;
      for (let i = 0; i < a.count; i++) {
        if (normal.getY(i) < -0.3) {
          expect(new Color().fromBufferAttribute(a, i).toArray()).toEqual(dark.toArray().map(v => expect.closeTo(v, 6)));
          down++;
        }
        if (normal.getY(i) > 0.3) {
          expect(a.getX(i)).toBeGreaterThan(dark.r);
          up++;
        }
        if (a.getX(i) > rock.r + 1e-6) bright++;
        if (a.getX(i) !== b.getX(i)) { expect(normal.getY(i)).toBeGreaterThan(0.3); moss++; }
      }
      expect(Math.min(moss, bright, up, down)).toBeGreaterThan(0);
      expect(dry.getAttribute("position").array).toEqual(mossy.getAttribute("position").array);
    } finally { dry.dispose(); mossy.dispose(); }
  });

  it("cuts one or two concave fissures into boulders and multiple ledges into slate", () => {
    for (const seed of [0, 1, 2, 3]) {
      const geometry = createRockGeometry("boulder", seed);
      try {
        const p = geometry.getAttribute("position"), levels = new Map<number, Map<string, Vector2>>();
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), points = levels.get(y) ?? new Map<string, Vector2>();
          points.set(`${p.getX(i)}:${p.getZ(i)}`, new Vector2(p.getX(i), p.getZ(i)));
          levels.set(y, points);
        }
        const ring = [...[...levels.entries()].sort(([a], [b]) => a - b)[1]![1].values()]
          .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
        const reflex = ring.filter((point, i) => point.clone().sub(ring[(i + ring.length - 1) % ring.length]!)
          .cross(ring[(i + 1) % ring.length]!.clone().sub(point)) < -1e-6);
        expect(reflex).toHaveLength(1 + seed % 2);
      } finally { geometry.dispose(); }
    }
    const slab = createRockGeometry("slab", 7);
    try {
      const p = slab.getAttribute("position");
      expect(new Set(Array.from({ length: p.count }, (_, i) => p.getY(i))).size).toBeGreaterThanOrEqual(7);
    } finally { slab.dispose(); }
  });

  it("constructs each variant comfortably inside the 20 ms additional Node allowance", () => {
    for (const kind of kinds) {
      createRockGeometry(kind, 0).dispose();
      const start = performance.now();
      for (let seed = 0; seed < 64; seed++) createRockGeometry(kind, seed).dispose();
      const average = (performance.now() - start) / 64;
      expect(average).toBeLessThan(20);
      console.info(`Rock ${kind}: ${average.toFixed(3)} ms/geometry (Node, 64 seeds).`);
    }
  });
});

describe("balanced rock stack", () => {
  it("merges 3–5 contacting stones into one draw call under 700 triangles", () => {
    for (let seed = 0; seed < 6; seed++) {
      const stack = createRockStack(seed);
      try {
        expect(stack.group.children).toHaveLength(1);
        const mesh = stack.group.children[0] as Mesh<BufferGeometry, MeshToonMaterial>;
        expect(mesh).toBeInstanceOf(Mesh);
        expect(mesh.material.vertexColors).toBe(true);
        expect((mesh.material.gradientMap as DataTexture).image.width).toBe(4);
        expect(mesh.geometry.groups).toHaveLength(0);
        expect(triangles(mesh.geometry)).toBeLessThanOrEqual(700);
        expectPalette(mesh.geometry);
        const meshFaces = faces(mesh.geometry);
        const caps = meshFaces.filter(face => Math.abs(face.normal.y) > 0.99999);
        const levels = [...new Set(caps.map(face => face.a.y.toFixed(6)))].map(Number).sort((a, b) => a - b);
        expect(levels.length - 1).toBe(3 + seed % 3);
        expect(levels[0]).toBe(0);
        for (const level of levels.slice(1, -1)) {
          expect(caps.some(face => Math.abs(face.a.y - level) < 1e-6 && face.normal.y > 0)).toBe(true);
          expect(caps.some(face => Math.abs(face.a.y - level) < 1e-6 && face.normal.y < 0)).toBe(true);
          // Centre of mass of every stone above this contact projects into its support cap.
          let volume = 0;
          const moment = new Vector3();
          for (const { a, b, c } of meshFaces.filter(face => Math.min(face.a.y, face.b.y, face.c.y) >= level - 1e-6
            && !(Math.max(face.a.y, face.b.y, face.c.y) <= level + 1e-6 && face.normal.y > 0))) {
            const v = a.dot(b.clone().cross(c)) / 6;
            moment.addScaledVector(a.clone().add(b).add(c).multiplyScalar(0.25), v);
            volume += v;
          }
          const center = moment.divideScalar(volume);
          const support = caps.filter(face => Math.abs(face.a.y - level) < 1e-6 && face.normal.y > 0);
          expect(support.some(({ a, b, c }) => {
            const point = new Vector3(center.x, a.y, center.z);
            return [a, b, c].every((v, i, vertices) => vertices[(i + 1) % 3]!.clone().sub(v)
              .cross(point.clone().sub(v)).y >= -1e-6);
          })).toBe(true);
        }
      } finally { stack.dispose(); }
    }
  });

  it("is seeded and releases geometry/material exactly once while retaining the shared ramp", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const stack = createRockStack(12);
    random.mockReturnValue(0.9);
    const same = createRockStack(12), different = createRockStack(13);
    const mesh = stack.group.children[0] as Mesh<BufferGeometry, MeshToonMaterial>;
    const geometry = vi.spyOn(mesh.geometry, "dispose"), material = vi.spyOn(mesh.material, "dispose");
    const gradient = vi.spyOn(mesh.material.gradientMap!, "dispose");
    try {
      expect(mesh.geometry.getAttribute("position").array).toEqual((same.group.children[0] as Mesh).geometry.getAttribute("position").array);
      expect(mesh.geometry.getAttribute("position").array).not.toEqual((different.group.children[0] as Mesh).geometry.getAttribute("position").array);
      new Group().add(stack.group);
      stack.dispose(); stack.dispose();
      expect(stack.group.parent).toBeNull();
      expect(stack.group.children).toHaveLength(0);
      expect(geometry).toHaveBeenCalledTimes(1);
      expect(material).toHaveBeenCalledTimes(1);
      expect(gradient).not.toHaveBeenCalled();
    } finally { stack.dispose(); same.dispose(); different.dispose(); random.mockRestore(); gradient.mockRestore(); }
  });
});
