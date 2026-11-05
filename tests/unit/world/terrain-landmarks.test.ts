import { describe, expect, it } from "vitest";
import { pathLength, pathPointAt, PATH_BRIDGES } from "../../../src/features/world/layout/path";
import { riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";

function anchor(id: "milestones" | "horizon" | "workshop", offset: number, seaward = 0) {
  const zone = ZONES.find(zone => zone.id === id)!;
  const river = nearestRiver(zone.position.x, zone.position.z);
  const nx = (zone.position.x - river.x) / river.distance;
  const nz = (zone.position.z - river.z) / river.distance;
  return { zone, nx, nz, x: zone.position.x + nx * offset, z: zone.position.z + nz * offset - seaward };
}

describe("zone terrain landmarks", () => {
  // Heights captured before B2-109 at the layout-derived crests, outside the
  // old path/zone blends. These measure added relief, not absolute sea height.
  it.each([
    { id: "milestones" as const, baseline: 6.015667885798044, minimum: 6, maximum: 9, seaward: 0 },
    { id: "horizon" as const, baseline: 2.2010590279883053, minimum: 10, maximum: 14, seaward: 18 },
  ])("raises the $id crest above the previous surrounding ground", ({ id, baseline, minimum, maximum, seaward }) => {
    const crest = anchor(id, 20, seaward);
    const rise = worldHeight(crest.x, crest.z) - baseline;
    expect(rise).toBeGreaterThanOrEqual(minimum);
    expect(rise).toBeLessThanOrEqual(maximum);
    expect(worldHeight(crest.zone.position.x, crest.zone.position.z)).toBeLessThan(worldHeight(crest.x, crest.z));
    if (id === "milestones") {
      expect(nearestPath(crest.x, crest.z).distance).toBeGreaterThanOrEqual(15);
      expect(nearestPath(crest.x, crest.z).distance).toBeLessThanOrEqual(25);
      expect(nearestRiver(crest.x, crest.z).distance).toBeGreaterThan(20);
    } else {
      expect(crest.z).toBeLessThan(crest.zone.position.z);
    }
  });

  it("rounds the Milestones hill equally in all four directions", () => {
    const crest = anchor("milestones", 20);
    const rises = [
      [10, 0, 6.557847820641761], [-10, 0, 5.655139700023217],
      [0, 10, 5.70633114638939], [0, -10, 6.544345707694063],
    ].map(([dx, dz, baseline]) => worldHeight(crest.x + dx!, crest.z + dz!) - baseline!);
    expect(Math.min(...rises)).toBeGreaterThan(7);
    expect(Math.max(...rises) - Math.min(...rises)).toBeLessThan(0.01);
  });

  it("gives Workshop a flat, dry 10 by 8 m pad beside the stream", () => {
    const pad = anchor("workshop", 8);
    const heights: number[] = [];
    for (let along = -5; along <= 5; along += 0.5) for (let across = -4; across <= 4; across += 0.5) {
      const x = pad.x - pad.nz * along + pad.nx * across;
      const z = pad.z + pad.nx * along + pad.nz * across;
      const height = worldHeight(x, z);
      heights.push(height);
      expect(height - waterLevelAt(z)).toBeGreaterThanOrEqual(0.4);
      expect(nearestRiver(x, z).distance).toBeGreaterThan(10);
      expect(nearestRiver(x, z).distance).toBeLessThan(22);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.3);
  });

  it("keeps the sea-facing Horizon nose continuous and steeper than its inland shoulder", () => {
    const crest = anchor("horizon", 20, 18);
    const summit = worldHeight(crest.x, crest.z);
    const seawardDrop = summit - worldHeight(crest.x, crest.z - 20);
    const inlandDrop = summit - worldHeight(crest.x, crest.z + 20);
    expect(seawardDrop).toBeGreaterThan(inlandDrop);
    for (let distance = 0; distance <= 60; distance += 0.5) {
      const z = crest.z - distance;
      expect(Math.abs(worldHeight(crest.x, z) - worldHeight(crest.x, z - 0.5))).toBeLessThanOrEqual(0.6);
    }
  });

  it("preserves the spawn, spring, estuary and offshore baseline heights", () => {
    const spawn = ZONES.find(zone => zone.id === "first-light")!.position;
    expect(worldHeight(spawn.x, spawn.z)).toBeCloseTo(7.327632830104367, 10);
    for (const [x, z, baseline] of [
      [8, 0, 7.303021500741667], [0, 0, 5.6499999999999995],
      [100, -880, -0.3316918335222615], [0, -900, -0.8258008344976953], [0, -960, -2.5],
    ]) expect(worldHeight(x!, z!)).toBeCloseTo(baseline!, 10);
  });

  it("has no height jumps at landmark, pad or path blend boundaries", () => {
    const hill = anchor("milestones", 20);
    const headland = anchor("horizon", 20, 18);
    const pad = anchor("workshop", 8);
    const points: { x: number; z: number }[] = [];
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16;
      points.push({ x: hill.x + 75 * Math.cos(angle), z: hill.z + 75 * Math.sin(angle) });
      points.push({ x: headland.x + 65 * Math.cos(angle), z: headland.z + (Math.sin(angle) < 0 ? 45 : 100) * Math.sin(angle) });
    }
    for (const along of [-11, -5, 0, 5, 11]) for (const across of [-10, -4, 0, 4, 10]) {
      points.push({ x: pad.x - pad.nz * along + pad.nx * across, z: pad.z + pad.nx * along + pad.nz * across });
    }
    for (const feature of [hill, headland]) for (const side of [-1, 1]) {
      for (const offset of [1.5, 3, 4]) {
        points.push({ x: feature.zone.position.x + feature.nx * offset * side, z: feature.zone.position.z + feature.nz * offset * side });
      }
    }
    for (const { x, z } of points) {
      for (const [ox, oz] of [[0.00001, 0], [0, 0.00001]] as const) {
        expect(Math.abs(worldHeight(x + ox, z + oz) - worldHeight(x - ox, z - oz))).toBeLessThan(0.001);
      }
    }
  });

  it("leaves the downstream river sight line clear of landmark relief", () => {
    // A low sight line from the spawn bank to the downstream water stays above
    // the channel. Probe the whole stream axis, including the landmark stations.
    for (let i = 0; i <= 1000; i++) {
      const point = riverPointAt(i / 1000);
      expect(worldHeight(point.x, point.z)).toBeLessThanOrEqual(Math.max(0.4, waterLevelAt(point.z)));
    }
  });

  it("keeps the walking strip dry outside the existing submerged ford approaches", () => {
    const samples = Math.ceil(pathLength() / 0.5);
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (PATH_BRIDGES.some(bridge => Math.abs(t - bridge.t) * pathLength() < 18)) continue;
      const point = pathPointAt(t);
      const before = pathPointAt(Math.max(0, t - 0.00001));
      const after = pathPointAt(Math.min(1, t + 0.00001));
      const direction = after.sub(before).normalize();
      for (const offset of [-1.5, 0, 1.5]) {
        const x = point.x - direction.z * offset;
        const z = point.z + direction.x * offset;
        expect(worldHeight(x, z) - waterLevelAt(z), `path t=${t}, offset=${offset}`).toBeGreaterThanOrEqual(0.4);
      }
    }
  });
});
