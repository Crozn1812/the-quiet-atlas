import { Vector3 } from "three";
import { expect, it } from "vitest";
import { riverLength, riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createRibbonGeometry, createRiverRibbon, riverWidthAt, RIBBON_SEGMENTS, WATER_LEVEL } from "../../../src/features/world/water/ribbon";
import { createSea } from "../../../src/features/world/water/sea";

// Actual terrain triangles use a 2 m lattice and the b-c diagonal.
function renderedHeight(x: number, z: number): number {
  const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
  const tx = (x - gx) / 2, tz = (z - gz) / 2;
  const a = Math.fround(worldHeight(gx, gz));
  const b = Math.fround(worldHeight(gx + 2, gz));
  const c = Math.fround(worldHeight(gx, gz + 2));
  const d = Math.fround(worldHeight(gx + 2, gz + 2));
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
    : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

it.each([RIBBON_SEGMENTS, 1000, 17, 1])("preserves every upstream vertex at t < 0.95 (%s segments)", segments => {
  const geometry = createRibbonGeometry(segments);
  try {
    const positions = geometry.getAttribute("position");
    const source = riverPointAt(0);
    const tangent = riverTangentAt(0);
    const sourceBed = Math.min(...[-1, 0, 1].map(side => worldHeight(
      source.x - tangent.z * riverWidthAt(0) / 2 * side,
      source.z + tangent.x * riverWidthAt(0) / 2 * side,
    )));
    const sourceSink = Math.max(0, waterLevelAt(source.z) - sourceBed + 0.06);
    for (let row = 0; row / segments < 0.95; row++) {
      const t = row / segments;
      const centre = riverPointAt(t);
      const tangent = riverTangentAt(t);
      const emergence = Math.min(1, t * riverLength() / 4);
      const level = waterLevelAt(centre.z) - sourceSink * (1 - emergence * emergence * (3 - 2 * emergence));
      for (const side of [-1, 1]) {
        const vertex = row * 2 + (side + 1) / 2;
        expect([positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)]).toEqual([
          centre.x - tangent.z * riverWidthAt(t) / 2 * side, level,
          centre.z + tangent.x * riverWidthAt(t) / 2 * side,
        ].map(Math.fround));
      }
    }
  } finally { geometry.dispose(); }
});

it.each([RIBBON_SEGMENTS, 1000, 17, 1])("keeps vertices and triangle interiors below visible sea without a cinematic mask (%s segments)", segments => {
  const geometry = createRibbonGeometry(segments);
  const sea = createSea("High");
  const bounds = sea.mesh.geometry.boundingBox!;
  let seaSamples = 0;
  const check = (point: Vector3) => {
    if (point.x < bounds.min.x || point.x > bounds.max.x || point.z < bounds.min.z || point.z > bounds.max.z) return;
    if (Math.min(worldHeight(point.x, point.z), renderedHeight(point.x, point.z)) >= WATER_LEVEL) return;
    // The sea quad extends underneath enclosed inland channels. Only water
    // connected laterally to the open coast is visible sea, not that bed.
    const t = nearestRiver(point.x, point.z).t;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const bank = riverWidthAt(t) / 2 + 3;
    if ([-bank, bank].every(offset => {
      const x = centre.x - tangent.z * offset, z = centre.z + tangent.x * offset;
      return Math.min(worldHeight(x, z), renderedHeight(x, z)) >= WATER_LEVEL;
    })) return;
    seaSamples++;
    expect(point.y, `overlap at ${point.x},${point.z}`).toBeLessThan(WATER_LEVEL);
  };
  try {
    const positions = geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex++) check(new Vector3().fromBufferAttribute(positions, vertex));
    const indices = geometry.index!;
    for (let triangle = 0; triangle < indices.count; triangle += 3) {
      const [a, b, c] = [0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, indices.getX(triangle + offset)));
      for (let u = 0; u <= 12; u++) for (let v = 0; v <= 12 - u; v++) {
        check(a!.clone().multiplyScalar(1 - (u + v) / 12).addScaledVector(b!, u / 12).addScaledVector(c!, v / 12));
      }
    }
    expect(seaSamples).toBeGreaterThan(0);
  } finally { geometry.dispose(); sea.dispose(); }
});

it.each(["Low", "Balanced", "High"] as const)("uses complete river and sea surfaces in %s gameplay and ending", quality => {
  const river = createRiverRibbon(quality);
  const sea = createSea(quality);
  try {
    expect(river.mesh.geometry.drawRange).toEqual({ start: 0, count: Infinity });
    expect(sea.mesh.material.uniforms.uHasShore!.value).toBe(1);
    const positions = river.mesh.geometry.getAttribute("position");
    expect(positions.getY(positions.count - 1)).toBeCloseTo(-0.05);
  } finally { river.dispose(); sea.dispose(); }
});
