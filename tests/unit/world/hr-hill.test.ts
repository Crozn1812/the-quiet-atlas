import { Box3, MeshToonMaterial, Vector3 } from "three";
import { expect, it } from "vitest";
import { ZONES } from "../../../src/features/world/layout/zones";
import { nearHillSites } from "../../../src/features/world/terrain/hill-dressing";
import { surfaceHeight, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { hillDrainage, horizonHillRegion, nearHillRelief, nearHillWeight } from "../../../src/features/world/terrain/hills";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";

it("keeps hill fields continuous, bounded and clear of water, walking strips and zone pads", () => {
  const relief: number[] = [];
  for (let x = -150; x <= 150; x += 3) for (let z = -400; z <= 80; z += 3) {
    const path = nearestPath(x, z), river = nearestRiver(x, z);
    const weight = nearHillWeight(x, z, path.distance, river.distance, path.t);
    expect(weight).toBeGreaterThanOrEqual(0); expect(weight).toBeLessThanOrEqual(1);
    if (path.distance <= 16 || river.distance <= 20
      || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) <= zone.radius + 4)) expect(weight).toBe(0);
    if (weight > 0.5) relief.push(nearHillRelief(x, z));
  }
  expect(Math.max(...relief) - Math.min(...relief)).toBeGreaterThan(1);
  expect(Math.max(...relief)).toBeLessThan(1.45); expect(Math.min(...relief)).toBeGreaterThan(-2);
  for (let z = -390; z <= 50; z += 7) {
    expect(nearHillRelief(-64 - 1e-6, z)).toBeCloseTo(nearHillRelief(-64 + 1e-6, z), 4);
    expect(hillDrainage(-64 - 1e-6, z)).toBeCloseTo(hillDrainage(-64 + 1e-6, z), 4);
  }
  for (const z of [-900, -600, -490, 100]) expect(nearHillWeight(70, z, 100, 100, 0)).toBe(0);
  for (const t of [0.79, 0.82, 1]) expect(nearHillWeight(-80, -360, 100, 100, t)).toBe(0);
});

it("owns clusters exactly once across neighbouring tiles and buries stones below footprint support", () => {
  const bounds = (minX: number, maxX: number) => new Box3(new Vector3(minX, -100, -384), new Vector3(maxX, 100, 64));
  const whole = nearHillSites(bounds(-128, 128));
  const split = [...nearHillSites(bounds(-128, -64)), ...nearHillSites(bounds(-64, 0)),
    ...nearHillSites(bounds(0, 64)), ...nearHillSites(bounds(64, 128))];
  const ordered = (sites: typeof whole) => sites.toSorted((a, b) => a.x - b.x || a.z - b.z);
  expect(ordered(split)).toEqual(ordered(whole));
  expect(new Set(whole.map(site => `${site.x}:${site.z}`)).size).toBe(whole.length);
  expect(whole.length).toBeGreaterThan(60);
  const rocks = whole.filter(site => site.asset.startsWith("hr-rock"));
  expect(rocks.length).toBeGreaterThan(20);
  expect(whole.some(site => site.asset.includes("grass"))).toBe(true);
  expect(whole.some(site => site.asset.includes("bush"))).toBe(true);
  // Full-cell jitter and varying cluster membership must survive distant views.
  expect(new Set(rocks.map(site => Math.round(site.z * 100))).size).toBeGreaterThan(rocks.length * 0.9);
  expect(new Set(rocks.map(site => site.size[1].toFixed(2))).size).toBeGreaterThan(15);
  for (const site of whole) {
    expect(nearestPath(site.x, site.z).distance).toBeGreaterThan(16);
    expect(nearestRiver(site.x, site.z).distance).toBeGreaterThan(20);
    expect(surfaceHeight(site.x, site.z)).toBeGreaterThan(waterLevelAt(site.z) + 1.2);
    expect(site.baseY).toBeLessThan(surfaceHeight(site.x, site.z));
    if (!site.asset.startsWith("hr-rock")) continue;
    const radius = site.size[0] / 2 / 1.15;
    for (const [dx, dz] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius]]) {
      expect(site.baseY! + site.size[1] * 0.4).toBeLessThanOrEqual(surfaceHeight(site.x + dx!, site.z + dz!) + 1e-9);
    }
  }
});

it.each([-320, -448])("shares hill height, normals and cover across streamed mesh edges at z=%s", originZ => {
  const material = new MeshToonMaterial();
  const tile = (originX: number) => {
    const origin = { x: originX, y: 0, z: originZ }, cells = 16, size = 32;
    const heights = Float32Array.from({ length: 17 ** 2 }, (_, i) => worldHeight(originX + Math.floor(i / 17) * 2, originZ + i % 17 * 2));
    return createTileMesh({ origin, cells, size, heights }, material);
  };
  const left = tile(-96), right = tile(-64);
  try {
    const covers: number[] = [];
    for (let z = 0; z <= 16; z++) {
      for (const name of ["normal", "color", "nearHillSurface", "cc0Surface"]) {
        const a = left.geometry.getAttribute(name), b = right.geometry.getAttribute(name);
        for (let c = 0; c < a.itemSize; c++) expect(a.getComponent(16 * 17 + z, c)).toBe(b.getComponent(z, c));
      }
      expect(left.geometry.getAttribute("position").getY(16 * 17 + z)).toBe(right.geometry.getAttribute("position").getY(z));
      covers.push(right.geometry.getAttribute("nearHillSurface").getX(z));
    }
    expect(Math.max(...covers)).toBeGreaterThan(0);
  } finally { left.geometry.dispose(); right.geometry.dispose(); material.dispose(); }
});

it("covers the actual Horizon crest, flank and red toe without extending into Old Trail or coastal pads", () => {
  for (const [x, z] of [[-52, -445], [-35, -440], [-15, -438], [-5, -431], [-17, -423]]) {
    const path = nearestPath(x!, z!), river = nearestRiver(x!, z!);
    expect(nearHillWeight(x!, z!, path.distance, river.distance, path.t)).toBeGreaterThan(0.6);
  }
  for (const z of [-382, -320, -287, -482, -510, -550]) expect(horizonHillRegion(-48, z)).toBe(0);
  const bounds = (minX: number, maxX: number) => new Box3(new Vector3(minX, -100, -500), new Vector3(maxX, 100, -400));
  const whole = nearHillSites(bounds(-128, 0));
  const split = [...nearHillSites(bounds(-128, -64)), ...nearHillSites(bounds(-64, 0))];
  const ordered = (sites: typeof whole) => sites.toSorted((a, b) => a.x - b.x || a.z - b.z);
  expect(ordered(split)).toEqual(ordered(whole));
  const rocks = whole.filter(site => site.asset.startsWith("hr-rock"));
  expect(rocks.length).toBeGreaterThan(5);
  expect(rocks.length).toBeLessThan(45);
  expect(rocks.filter(site => site.x > -55 && site.z > -465).length).toBeGreaterThan(5);
  expect(new Set(rocks.map(site => Math.round(site.z * 100))).size).toBeGreaterThan(rocks.length * 0.9);
  expect(whole.filter(site => !site.asset.startsWith("hr-rock")).length).toBeGreaterThan(rocks.length);
  for (const rock of rocks) expect(rock.baseY! + rock.size[1] * 0.4).toBeLessThan(surfaceHeight(rock.x, rock.z));
});
