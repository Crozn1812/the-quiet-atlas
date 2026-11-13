import { MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { ZONES } from "../../../src/features/world/layout/zones";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { PATH_WIDTH, roadBaseHeight, worldHeight } from "../../../src/features/world/terrain/height";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { buildTile, TILE_SIZE } from "../../../src/features/world/terrain/tiles";
import { createSea } from "../../../src/features/world/water/sea";
import { placeZoneScenes } from "../../../src/features/world/zones";

function rightOf(forward: { x: number; z: number }) {
  return { x: -forward.z, z: forward.x };
}

function station(t: number) {
  const point = pathPointAt(t);
  const forward = pathPointAt(Math.min(1, t + 0.00001))
    .sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
  const right = rightOf(forward);
  return (left: number) => ({ x: point.x - right.x * left, z: point.z - right.z * left });
}

// Parallel transects across the whole inlet, from its northern lip to the cape.
const start = pathPointAt(0.82);
const forward = pathPointAt(1).sub(start).normalize();
function bayPoint(along: number, right: number) {
  along *= WORLD_SCALE;
  const side = rightOf(forward);
  return { x: start.x + forward.x * along + side.x * right,
    z: start.z + forward.z * along + side.z * right };
}

function waterline(along: number) {
  const height = (right: number) => {
    const { x, z } = bayPoint(along, right);
    return worldHeight(x, z);
  };
  // Find the outer shore, skipping any separate zero crossings at the stream.
  let inland = 0;
  for (let right = 0; right <= 150; right += 2) if (height(right) > 0) inland = right;
  let sea = inland + 2;
  expect(height(inland)).toBeGreaterThan(0);
  expect(height(sea)).toBeLessThanOrEqual(0);
  for (let i = 0; i < 40; i++) {
    const middle = (inland + sea) / 2;
    if (height(middle) > 0) inland = middle;
    else sea = middle;
  }
  const right = (inland + sea) / 2;
  expect(Math.abs(height(right))).toBeLessThan(1e-9);
  return right;
}

describe("coastal mountain and curved bay", () => {
  it("puts right at +X when walking toward -Z in the Y-up frame", () => {
    expect(rightOf({ x: 0, z: -1 })).toEqual({ x: 1, z: 0 });
  });

  it.each([0.85, 0.9, 0.95])("puts the mountain to the left and sea to the right at t=%s", t => {
    const at = station(t);
    const road = at(0), mountain = at(120), sea = at(-60);
    for (const height of [worldHeight, surfaceHeight]) {
      expect(height(mountain.x, mountain.z) - height(road.x, road.z)).toBeGreaterThanOrEqual(30);
      expect(height(sea.x, sea.z)).toBeLessThan(0);
    }
  });

  it("reaches gentle sand 25–45 m past the right road edge and bay water 35–70 m away throughout t=0.84–0.97", () => {
    for (let i = 840; i <= 970; i++) {
      const t = i / 1000, at = station(t);
      for (const height of [worldHeight, surfaceHeight]) {
        const sample = (right: number) => {
          const p = at(-right);
          return height(p.x, p.z);
        };
        expect(sample(40), `right 40 m at t=${t}`).toBeLessThanOrEqual(1.5);
        // Sand is fully visible below 0.9 m (terrain/mesh). Measure from the
        // edge of the 3 m road, outside the preserved scene foundations.
        let sand = false;
        for (let right = PATH_WIDTH / 2 + 25; right <= PATH_WIDTH / 2 + 45; right += 0.5) {
          const ground = sample(right);
          sand ||= ground >= 0 && ground <= 0.9;
          expect(Math.abs(sample(right + 0.5) - ground) / 0.5, `beach slope at t=${t}, right=${right}`)
            .toBeLessThanOrEqual(0.25);
        }
        expect(sand, `dry sand at t=${t}`).toBe(true);
        // As in waterline(), take the outer shore, skipping the estuary's
        // separate channel crossing near the end of the route.
        let land = 0;
        for (let right = 0; right <= 100; right += 0.5) if (sample(right) > 0) land = right;
        let sea = land + 0.5;
        expect(sample(land)).toBeGreaterThan(0);
        expect(sample(sea)).toBeLessThanOrEqual(0);
        for (let step = 0; step < 24; step++) {
          const middle = (land + sea) / 2;
          if (sample(middle) > 0) land = middle;
          else sea = middle;
        }
        expect((land + sea) / 2, `bay shore at t=${t}`).toBeGreaterThanOrEqual(35);
        expect((land + sea) / 2, `bay shore at t=${t}`).toBeLessThanOrEqual(70);
      }
    }
  });

  it.each([
    [0.86, 60, 60], [0.9, 35, 115], [0.94, 50, 80],
  ])("sees the water surface before terrain from road eye height at t=%s, %s degrees right", (t, degrees, reach) => {
    const point = pathPointAt(t);
    const forward = pathPointAt(t + 0.00001).sub(pathPointAt(t - 0.00001)).normalize();
    const right = rightOf(forward), angle = degrees * Math.PI / 180;
    const eye = point.clone().setY(surfaceHeight(point.x, point.z) + 1.7);
    const target = new Vector3(point.x + reach * (forward.x * Math.cos(angle) + right.x * Math.sin(angle)), 0,
      point.z + reach * (forward.z * Math.cos(angle) + right.z * Math.sin(angle)));
    expect(degrees).toBeGreaterThanOrEqual(30);
    expect(degrees).toBeLessThanOrEqual(70);
    expect(eye.distanceTo(target)).toBeLessThanOrEqual(120);
    const sea = createSea("Balanced"), material = new MeshBasicMaterial();
    const terrain = [];
    try {
      // Raycast the actual Float32 tile triangles and sea plane, rather than
      // sampling ground below a horizontal ray or treating submerged bed as water.
      for (let ix = Math.floor(Math.min(eye.x, target.x) / TILE_SIZE); ix <= Math.floor(Math.max(eye.x, target.x) / TILE_SIZE); ix++) {
        for (let iz = Math.floor(Math.min(eye.z, target.z) / TILE_SIZE); iz <= Math.floor(Math.max(eye.z, target.z) / TILE_SIZE); iz++) {
          terrain.push(createTileMesh(buildTile(ix, iz), material));
        }
      }
      sea.mesh.updateMatrixWorld(true);
      const ray = new Raycaster(eye, target.clone().sub(eye).normalize(), 0, 120);
      const hit = ray.intersectObjects([...terrain, sea.mesh])[0];
      expect(hit?.object).toBe(sea.mesh);
      expect(hit!.distance).toBeLessThanOrEqual(120);
      expect(hit!.point.y).toBeCloseTo(0, 10);
      for (const height of [worldHeight, surfaceHeight]) expect(height(hit!.point.x, hit!.point.z)).toBeLessThan(0);
    } finally {
      terrain.forEach(mesh => mesh.geometry.dispose());
      material.dispose();
      sea.dispose();
    }
  });

  it.each([
    ["quiet-shore", [1.0224300441140761, -0.04959022199994727, 1.5455488722688442, 1.2276747103343617,
      0.0028866587171639648, 0.7091202605513263, 1.1251046551384698]],
    ["last-postcard", [0.779999596389497, -1.811331394101019, 0.4000144882959093, 0.39998487667371585,
      0.7590227537771185, -1.4454987414503455, 0.4921380314618295]],
  ] as const)("locks relocated rendered foundations and surrounding channels at %s (ADR 0017)", (id, baseline) => {
    const zone = ZONES.find(zone => zone.id === id)!;
    const offsets = [[0, 0], [-12, 0], [12, 0], [0, -12], [0, 12], [-8, -8], [8, 8]] as const;
    offsets.forEach(([dx, dz], i) => {
      // The new route crosses different seeded terrain and 2 m mesh triangles.
      const height = surfaceHeight(zone.position.x + dx, zone.position.z + dz);
      const original = baseline[i]!;
      expect(height).toBeCloseTo(original, 6);
    });
  });

  it.each([0.82, 0.85, 0.9, 0.95, 1])("has a soft shoulder and a 35–55 m crest 80–140 m inland at t=%s", t => {
    const at = station(t), road = at(0);
    const roadHeight = worldHeight(road.x, road.z);
    const heights = Array.from({ length: 61 }, (_, i) => {
      const point = at(80 + i);
      return worldHeight(point.x, point.z) - roadHeight;
    });
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(35);
    expect(Math.max(...heights)).toBeLessThanOrEqual(55);
    const limit = Math.tan(35 * Math.PI / 180);
    for (let left = PATH_WIDTH / 2; left <= PATH_WIDTH / 2 + 40; left += 0.5) {
      const p = at(left), next = at(left + 0.5);
      expect(Math.abs(worldHeight(next.x, next.z) - worldHeight(p.x, p.z)) / 0.5).toBeLessThanOrEqual(limit);
      // Check full triangle gradients on the actual 2 m mesh, including X/Z slope together.
      const x = Math.floor(p.x / 2) * 2, z = Math.floor(p.z / 2) * 2;
      const [a, b, c, d] = [[x, z], [x + 2, z], [x, z + 2], [x + 2, z + 2]]
        .map(([x, z]) => Math.fround(worldHeight(x!, z!))) as [number, number, number, number];
      expect(Math.hypot(b - a, c - a) / 2).toBeLessThanOrEqual(limit);
      expect(Math.hypot(d - b, d - c) / 2).toBeLessThanOrEqual(limit);
    }
  });

  it("recesses the middle waterline at least 25 m inland of the chord across five shore points", () => {
    // The corrected bay's southern lip must precede the existing estuary/sea.
    const alongs = [-40, 5, 50, 95, 140];
    const shore = alongs.map(waterline);
    const first = shore[0]!, last = shore[4]!;
    const chordSlope = (last - first) / 180;
    const middleRecess = ((first + last) / 2 - shore[2]!) / Math.hypot(1, chordSlope);
    expect(middleRecess).toBeGreaterThanOrEqual(25);
    for (let i = 1; i <= 3; i++) {
      expect(shore[i]).toBeLessThan(first + (last - first) * i / 4);
      expect(shore[i - 1]! - 2 * shore[i]! + shore[i + 1]!).toBeGreaterThan(0);
    }
    // The low beach keeps its gentle descent into the existing -2.5 m sea floor.
    for (let i = 0; i < shore.length; i++) {
      let previous = 0;
      for (let offshore = 2; offshore <= 64; offshore += 2) {
        const p = bayPoint(alongs[i]!, shore[i]! + offshore);
        const height = worldHeight(p.x, p.z);
        expect(height).toBeLessThanOrEqual(previous + 1e-9);
        expect((previous - height) / 2).toBeLessThanOrEqual(0.2);
        previous = height;
      }
      expect(previous).toBeCloseTo(-2.5, 10);
    }
  });

  it.each([
    [0.82, 1.599925809422297], [0.85, 1.3551162395363545],
    [0.9, 1.0101815306759032], [0.95, 0.7590683251249655], [1, 0.8299999999078336],
  ])("keeps walking ground within 5 cm of the existing elevation at t=%s", (t, baseline) => {
    const { x, z } = pathPointAt(t);
    // ADR 0017 changes the offset path's Z slightly at the same route progress.
    expect(Math.abs(roadBaseHeight(x, z) - baseline)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(worldHeight(x, z) - baseline)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("is deterministic across reversed and interleaved coastal queries", () => {
    const points = [0.82, 0.85, 0.9, 0.95, 1].flatMap(t => [-100, -60, 0, 26.5, 40, 100, 140].map(station(t)));
    const first = points.map(p => worldHeight(p.x, p.z));
    for (const p of [...points].reverse()) worldHeight(p.x + 0.01, p.z - 0.01);
    expect(points.map(p => worldHeight(p.x, p.z))).toEqual(first);
  });

  it("keeps the relocated far ridge continuous across the walking bend", () => {
    // The old x=202 probe is now in the bay; follow the western ridge instead.
    for (let along = 80; along <= 140; along += 0.05) {
      const point = bayPoint(along, -150), next = bayPoint(along + 0.05, -150);
      expect(worldHeight(point.x, point.z)).toBeGreaterThan(5);
      expect(Math.abs(worldHeight(next.x, next.z) - worldHeight(point.x, point.z))).toBeLessThan(0.06);
    }
  });

  it("places all zone scenes on the actual rendered terrain", () => {
    const placed = placeZoneScenes(surfaceHeight);
    try {
      expect(placed.map(zone => zone.zoneId)).toEqual(ZONES.map(zone => zone.id));
      for (const zone of placed) {
        const { x, z } = zone.layout.position;
        expect(zone.group.position.y).toBe(surfaceHeight(x, z));
      }
    } finally {
      placed.forEach(zone => zone.dispose());
      disposeRampGradients();
    }
  });
});
