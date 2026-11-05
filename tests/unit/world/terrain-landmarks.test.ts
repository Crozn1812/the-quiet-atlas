import { describe, expect, it } from "vitest";
import { pathLength, pathPointAt, PATH_BRIDGES } from "../../../src/features/world/layout/path";
import { riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
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
  it.each(["milestones", "horizon"])("leaves the full 18 m river corridor below the %s relief", id => {
    const zone = ZONES.find(zone => zone.id === id)!;
    const station = nearestRiver(zone.position.x, zone.position.z).t;
    for (let i = -40; i <= 40; i++) {
      const t = station + i / 1000;
      const point = riverPointAt(t);
      const tangent = riverTangentAt(t);
      for (const side of [-1, 1]) for (const distance of [6, 10, 14, 16, 18]) {
        const x = point.x - tangent.z * distance * side;
        const z = point.z + tangent.x * distance * side;
        // The original seeded valley contributes at most 0.2 m at 18 m;
        // neither a raised path foundation nor landmark relief belongs here.
        expect(worldHeight(x, z) - waterLevelAt(z)).toBeLessThanOrEqual(0.65);
      }
    }
  });

  it("keeps every zone footprint dry outside the open river channel", () => {
    for (const zone of ZONES) for (let radius = 0; radius <= zone.radius; radius += 2) {
      for (let i = 0; i < 32; i++) {
        const x = zone.position.x + radius * Math.cos(i * Math.PI / 16);
        const z = zone.position.z + radius * Math.sin(i * Math.PI / 16);
        if (nearestRiver(x, z).distance < 14) continue;
        const height = worldHeight(x, z);
        expect(height, zone.id).toBeGreaterThanOrEqual(0.4);
        expect(height - waterLevelAt(z), zone.id).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  // Keep B2-109's absolute crest heights after moving the summits inland to
  // make room for the 18 m setback and the gentle river-facing shoulders.
  it.each([
    { id: "milestones" as const, height: 13.515667885798045, offset: 42, seaward: 0 },
    { id: "horizon" as const, height: 14.201059027988306, offset: 58, seaward: 40 },
  ])("preserves the $id crest elevation beyond the low river bank", ({ id, height, offset, seaward }) => {
    const crest = anchor(id, offset, seaward);
    expect(worldHeight(crest.x, crest.z)).toBeCloseTo(height, 10);
    expect(nearestRiver(crest.x, crest.z).distance).toBeGreaterThan(42);
    expect(worldHeight(crest.zone.position.x, crest.zone.position.z)).toBeLessThan(worldHeight(crest.x, crest.z));
    if (id === "milestones") {
      expect(nearestPath(crest.x, crest.z).distance).toBeGreaterThanOrEqual(40);
      expect(nearestPath(crest.x, crest.z).distance).toBeLessThanOrEqual(45);
    } else {
      expect(crest.z).toBeLessThan(crest.zone.position.z);
    }
  });

  it("rounds the Milestones hill equally in all four directions", () => {
    const crest = anchor("milestones", 42);
    const rises = [
      [10, 0, 10.775717091361535], [-10, 0, 7.556700319396303],
      [0, 10, 7.556172715992713], [0, -10, 10.493412618941836],
    ].map(([dx, dz, baseline]) => worldHeight(crest.x + dx!, crest.z + dz!) - baseline!);
    expect(Math.min(...rises)).toBeGreaterThan(4.5);
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
    const crest = anchor("horizon", 58, 40);
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
      [0, -900, -0.8258008344976953], [0, -960, -2.5],
    ]) expect(worldHeight(x!, z!)).toBeCloseTo(baseline!, 10);
    // B2-152b: the ridge is west of the road; the old eastern probe is in the bay.
    const path = nearestPath(-100, -880);
    expect(worldHeight(-100, -880) - worldHeight(path.x, path.z)).toBeGreaterThanOrEqual(30);
  });

  it("has no height jumps at landmark, pad or path blend boundaries", () => {
    const hill = anchor("milestones", 42);
    const headland = anchor("horizon", 58, 40);
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
    // The new bank setback and the end of its smooth shoulder must be continuous too.
    for (const feature of [hill, headland]) for (const distance of [18, 42]) {
      const river = nearestRiver(feature.x, feature.z);
      points.push({ x: river.x + feature.nx * distance, z: river.z + feature.nz * distance });
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
