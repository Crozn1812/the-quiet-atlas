import { IcosahedronGeometry, InterleavedBuffer, InterleavedBufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PATH_BRIDGES } from "../../../src/features/world/layout/path";
import { riverLength } from "../../../src/features/world/layout/river";
import { surfaceHeight } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createFishSchools } from "../../../src/features/world/water/fish-schools";
import { createStreambedLayout } from "../../../src/features/world/water/streambed-layout";
import { createStreambed, streambedUsesLow } from "../../../src/features/world/water/streambed";
import { roundBedStone } from "../../../src/features/world/water/streambed-geometry";
import { bedStoneColor } from "../../../src/features/world/water/streambed-shader";
import type { WebGLRenderer } from "three";

describe("HR streambed", () => {
  const layout = createStreambedLayout();
  const reaches = Array.from({ length: layout.count }, (_, i) => layout.reach(i));

  it("keeps streamed placement deterministic and rejects invalid reaches", () => {
    expect(layout.reach(1)).toEqual(reaches[1]);
    expect(layout.reach(0)).toEqual(reaches[0]);
    expect(() => layout.reach(-1)).toThrow(RangeError);
    expect(() => layout.reach(layout.count)).toThrow(RangeError);
    expect(reaches.flatMap(r => r.pebbles).length).toBeGreaterThan(9000);
    expect(reaches.flatMap(r => r.boulders).length).toBeGreaterThan(5);
    expect(reaches.flatMap(r => r.weeds).length).toBeGreaterThan(300);
  });

  it("embeds pebbles in the rendered bed and keeps their tops below wading/fish water", () => {
    for (const pebble of reaches.flatMap(r => r.pebbles)) {
      const bed = surfaceHeight(pebble.position.x, pebble.position.z);
      expect(pebble.position.y - pebble.scale.y).toBeLessThan(bed + 0.001);
      expect(pebble.position.y + pebble.scale.y).toBeGreaterThan(bed);
      expect(pebble.position.y + pebble.scale.y).toBeLessThanOrEqual(pebble.water - 0.099);
      expect(pebble.scale.toArray().every(v => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it("reserves bridge approaches, the wading reach and swept fish routes", () => {
    const length = riverLength();
    const crossings = PATH_BRIDGES.map(p => nearestRiver(p.position.x, p.position.z).t * length);
    const schools = createFishSchools();
    for (const reach of reaches) for (const item of [...reach.pebbles, ...reach.boulders, ...reach.weeds, ...reach.leaves]) {
      const river = nearestRiver(item.position.x, item.position.z);
      for (const crossing of crossings) expect(Math.abs(river.t * length - crossing)).toBeGreaterThan(13.5);
    }
    for (const boulder of reaches.flatMap(r => r.boulders)) {
      const river = nearestRiver(boulder.position.x, boulder.position.z);
      expect(river.t).toBeGreaterThan(0.094);
      for (const school of schools) expect(Math.abs(school.t - river.t) * length).toBeGreaterThan(9.5);
      expect(boulder.position.y + boulder.scale.y).toBeGreaterThan(boulder.water + 0.1);
    }
    for (const pebble of reaches.flatMap(r => r.pebbles)) {
      const river = nearestRiver(pebble.position.x, pebble.position.z);
      for (const school of schools) if (Math.abs(school.t - river.t) * length < 7.5 && river.distance < school.width + 0.75) {
        expect(pebble.position.y + pebble.scale.y).toBeLessThan(pebble.water - school.submergence - 0.14);
      }
    }
    for (const weed of reaches.flatMap(r => r.weeds)) {
      expect(weed.position.y + weed.scale.y).toBeLessThan(weed.water - 0.10);
      const river = nearestRiver(weed.position.x, weed.position.z);
      for (const school of schools) if (Math.abs(school.t - river.t) * length < 7.5) expect(river.distance).toBeGreaterThan(school.width + 0.8);
    }
  });

  it("does no optional work before the deferred gate and safely releases an unused/cancelled build", () => {
    const bed = createStreambed({ domElement: {} } as WebGLRenderer);
    const build = bed.build();
    bed.update(1 / 60, false, new Vector3(), "High");
    expect(bed.group.children).toHaveLength(0);
    bed.dispose(); bed.dispose();
    expect(build.next().done).toBe(true);
    expect(bed.group.children).toHaveLength(0);
  });

  it("welds face-split stone meshes and retains bounded, smooth normals without mutating the source", () => {
    const source = new IcosahedronGeometry(1, 1), positions = source.getAttribute("position").array.slice();
    const rounded = roundBedStone(source, true);
    try {
      expect(source.getAttribute("position").array).toEqual(positions);
      expect(rounded.getAttribute("position").count).toBeLessThan(source.getAttribute("position").count);
      expect(rounded.index!.count).toBe(source.getAttribute("position").count);
      expect(rounded.boundingBox!.min.toArray()).toEqual([-1, -1, -1]);
      expect(rounded.boundingBox!.max.toArray()).toEqual([1, 1, 1]);
      const normals = rounded.getAttribute("normal"), normal = new Vector3();
      for (let i = 0; i < normals.count; i++) expect(normal.fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
    } finally { source.dispose(); rounded.dispose(); }
  });

  it("unpacks normalized interleaved meshopt positions before rounding", () => {
    const source = new IcosahedronGeometry(1, 1), p = source.getAttribute("position");
    const storage = new Int16Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      storage[i * 4] = Math.round(p.getX(i) * 32767);
      storage[i * 4 + 1] = Math.round(p.getY(i) * 32767);
      storage[i * 4 + 2] = Math.round(p.getZ(i) * 32767);
      storage[i * 4 + 3] = 123;
    }
    source.setAttribute("position", new InterleavedBufferAttribute(new InterleavedBuffer(storage, 4), 3, 0, true));
    const rounded = roundBedStone(source, true);
    try {
      expect(Array.from(rounded.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      expect(rounded.boundingSphere!.radius).toBeGreaterThan(1);
      expect(rounded.boundingSphere!.radius).toBeLessThan(1.75);
    } finally { source.dispose(); rounded.dispose(); }
  });

  it("makes eight different worn silhouettes and shares a varied mineral palette across quality levels", () => {
    const source = new IcosahedronGeometry(1, 2);
    const variants = Array.from({ length: 8 }, (_, i) => roundBedStone(source, true, i + 1));
    try {
      const shapes = variants.map(g => Array.from(g.getAttribute("position").array).join(","));
      expect(new Set(shapes).size).toBe(8);
      for (const g of variants) {
        expect(g.boundingSphere!.radius).toBeLessThan(1.75);
        for (const bound of [...g.boundingBox!.min.toArray(), ...g.boundingBox!.max.toArray()])
          expect(Math.abs(bound)).toBeCloseTo(1, 5);
      }
      const colours = Array.from({ length: 100 }, (_, i) => bedStoneColor(i / 100));
      expect(colours.some(c => c.r > c.g * 1.4 && c.g > c.b)).toBe(true);
      expect(colours.some(c => c.r > 0.65 && c.b > 0.6)).toBe(true);
      expect(colours.some(c => Math.abs(c.r - c.g) < 0.03 && c.r < 0.4)).toBe(true);
    } finally { source.dispose(); variants.forEach(g => g.dispose()); }
  });

  it("selects the cheap path on CPU rasterizers without downgrading hardware High", () => {
    const device = (name: string) => ({ getContext: () => ({ RENDERER: 1, getExtension: () => null, getParameter: () => name }) }) as unknown as WebGLRenderer;
    expect(streambedUsesLow(device("ANGLE (Google, Vulkan SwiftShader Device)"))).toBe(true);
    expect(streambedUsesLow(device("llvmpipe (LLVM)"))).toBe(true);
    expect(streambedUsesLow(device("ANGLE (NVIDIA GeForce RTX 3060)"))).toBe(false);
  });
});
