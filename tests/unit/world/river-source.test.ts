import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { riverLength, riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { surfaceHeight, worldSpawn } from "../../../src/features/world/scene/compose";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createRibbonGeometry, riverWidthAt, RIBBON_SEGMENTS } from "../../../src/features/world/water/ribbon";

describe("river spring ribbon", () => {
  it("starts at 0.6 m and widens monotonically into the unchanged ribbon at t=0.03", () => {
    expect(riverWidthAt(0)).toBeCloseTo(0.6, 12);
    expect(riverWidthAt(0)).toBeLessThanOrEqual(0.8);
    let previous = riverWidthAt(0);
    for (let i = 1; i <= 300; i++) {
      const width = riverWidthAt(i * 0.03 / 300);
      expect(width).toBeGreaterThanOrEqual(previous);
      previous = width;
    }
    expect(previous).toBe(4 + 6 * 0.03);
    const geometry = createRibbonGeometry();
    try {
      const positions = geometry.getAttribute("position");
      let previousWidth = 0;
      for (let row = 0; row / RIBBON_SEGMENTS <= 0.03; row++) {
        const a = new Vector3().fromBufferAttribute(positions, row * 2);
        const b = new Vector3().fromBufferAttribute(positions, row * 2 + 1);
        const width = a.distanceTo(b);
        expect(width).toBeGreaterThanOrEqual(previousWidth);
        expect(width).toBeCloseTo(riverWidthAt(row / RIBBON_SEGMENTS), 5);
        previousWidth = width;
      }
    } finally { geometry.dispose(); }
  });

  it("buries both cap vertices by at least 5 cm and emerges inside the spring pool", () => {
    const geometry = createRibbonGeometry();
    try {
      const positions = geometry.getAttribute("position");
      for (const vertex of [0, 1]) {
        const x = positions.getX(vertex);
        const y = positions.getY(vertex);
        const z = positions.getZ(vertex);
        expect(worldHeight(x, z) - y).toBeGreaterThanOrEqual(0.05);
        expect(surfaceHeight(x, z) - y).toBeGreaterThanOrEqual(0.05);
      }
      // The cap gives way to visible water before leaving the 4 m hollow.
      const row = Math.floor(3.5 / riverLength() * RIBBON_SEGMENTS);
      for (const vertex of [row * 2, row * 2 + 1]) {
        expect(Math.hypot(positions.getX(vertex), positions.getZ(vertex))).toBeLessThan(4);
        expect(positions.getY(vertex)).toBeGreaterThan(surfaceHeight(positions.getX(vertex), positions.getZ(vertex)));
      }
      let previousSink = Infinity;
      for (let row = 0; row / RIBBON_SEGMENTS <= 0.03; row++) {
        const t = row / RIBBON_SEGMENTS;
        const sink = waterLevelAt(riverPointAt(t).z) - positions.getY(row * 2);
        // Float32 heights can differ from the analytic surface by a fraction of a micrometre.
        expect(sink).toBeLessThanOrEqual(previousSink + 1e-6);
        if (t * riverLength() >= 4) expect(Math.abs(sink)).toBeLessThan(1e-6);
        previousSink = sink;
      }
    } finally { geometry.dispose(); }
  });

  it.each([RIBBON_SEGMENTS, 1000, 17, 1])("preserves every old vertex/normal/UV from t=0.03 (%s segments)", segments => {
    const geometry = createRibbonGeometry(segments);
    try {
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      const uv = geometry.getAttribute("uv");
      for (let row = 0; row <= segments; row++) {
        const t = row / segments;
        if (t < 0.03) continue;
        const centre = riverPointAt(t);
        const tangent = riverTangentAt(t);
        const progress = Math.max(0, (t - 0.96) / 0.04);
        const mouth = progress * progress * (3 - 2 * progress);
        const halfWidth = (4 + 6 * t + 50 * mouth) / 2;
        const level = waterLevelAt(centre.z) - 0.05 * mouth;
        for (const side of [-1, 1]) {
          const vertex = row * 2 + (side + 1) / 2;
          // The old geometry also stored its formula in Float32BufferAttribute.
          const expected = [centre.x - tangent.z * halfWidth * side, level, centre.z + tangent.x * halfWidth * side];
          const actual = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)];
          actual.forEach((value, axis) => expect(Math.abs(value - Math.fround(expected[axis]!))).toBeLessThanOrEqual(1e-6));
          expect([normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)]).toEqual([0, 1, 0]);
          expect(uv.getX(vertex)).toBe((side + 1) / 2);
          expect(uv.getY(vertex)).toBe(Math.fround(t * riverLength()));
        }
      }
    } finally { geometry.dispose(); }
  });
});

describe("spring terrain and dry access", () => {
  const source = riverPointAt(0);
  const tangent = riverTangentAt(0);

  // Isolate the new hollow from the existing rounded channel near the inland source.
  const depressionAt = (point: Vector3) => {
    const distance = nearestRiver(point.x, point.z).distance;
    const bank = Math.min(1, distance / 6);
    const oldChannel = waterLevelAt(point.z) + 0.35 - 1.1 + 1.2 * bank * bank * (3 - 2 * bank);
    return oldChannel - worldHeight(point.x, point.z);
  };

  it("carves a 4 m hollow 0.45 m deep with a soft rim and at least 0.3 m below its banks", () => {
    expect(depressionAt(source)).toBeCloseTo(0.45, 10);
    for (let i = 0; i < 16; i++) {
      const direction = new Vector3(Math.cos(i * Math.PI / 8), 0, Math.sin(i * Math.PI / 8));
      let previous = Infinity;
      for (let radius = 0; radius <= 4; radius += 0.5) {
        const point = source.clone().addScaledVector(direction, radius);
        const depression = depressionAt(point);
        expect(depression).toBeGreaterThanOrEqual(-1e-10);
        expect(depression).toBeLessThanOrEqual(previous + 1e-10);
        previous = depression;
      }
      const rim = source.clone().addScaledVector(direction, 4);
      expect(depressionAt(rim)).toBeCloseTo(0, 10);
      expect(worldHeight(rim.x, rim.z) - worldHeight(source.x, source.z)).toBeGreaterThanOrEqual(0.3);
    }
    const upstream = (metres: number) => source.clone().addScaledVector(tangent, -metres);
    expect(depressionAt(upstream(3.99))).toBeGreaterThan(0);
    expect(depressionAt(upstream(3.99)) / 0.01).toBeLessThan(0.001);
    for (const radius of [4, 4.01, 5]) expect(depressionAt(upstream(radius))).toBeCloseTo(0, 10);
  });

  it("leaves spawn at least 4 m away on analytic and rendered dry ground with 0.4 m clearance", () => {
    const spawn = worldSpawn();
    expect(Math.hypot(spawn.x - source.x, spawn.z - source.z)).toBeGreaterThanOrEqual(4);
    const water = waterLevelAt(spawn.z);
    expect(worldHeight(spawn.x, spawn.z) - water).toBeGreaterThanOrEqual(0.4);
    expect(surfaceHeight(spawn.x, spawn.z) - water).toBeGreaterThanOrEqual(0.4);
    expect(spawn.y).toBeGreaterThan(surfaceHeight(spawn.x, spawn.z));
  });

  it("keeps the full 3 m path strip near the spring at least 0.4 m above water", () => {
    for (let i = 0; i <= 60; i++) {
      const t = i * 0.0005;
      const point = pathPointAt(t);
      const direction = pathPointAt(t + 0.00001).sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
      for (const offset of [-1.5, 0, 1.5]) {
        const x = point.x - direction.z * offset;
        const z = point.z + direction.x * offset;
        expect(worldHeight(x, z) - waterLevelAt(z)).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it("retains the old water-level formula everywhere, including beyond the source", () => {
    for (let z = 20; z >= -1000; z--) {
      const coastProgress = Math.max(0, Math.min(1, (-z - 760) / 140));
      const coastal = 1 - coastProgress * coastProgress * (3 - 2 * coastProgress);
      expect(waterLevelAt(z)).toBe(Math.max(0, z + 900) * 0.008 - 0.35 * coastal);
    }
  });
});
