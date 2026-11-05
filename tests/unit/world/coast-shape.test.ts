import { describe, expect, it } from "vitest";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { PATH_WIDTH, worldHeight } from "../../../src/features/world/terrain/height";
import { placeZoneScenes } from "../../../src/features/world/zones";

function station(t: number) {
  const point = pathPointAt(t);
  const forward = pathPointAt(Math.min(1, t + 0.00001))
    .sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
  return (left: number) => ({ x: point.x - forward.z * left, z: point.z + forward.x * left });
}

// Parallel transects across the whole inlet, from its northern lip to the cape.
const start = pathPointAt(0.82);
const forward = pathPointAt(1).sub(start).normalize();
function bayPoint(along: number, right: number) {
  return { x: start.x + forward.x * along + forward.z * right,
    z: start.z + forward.z * along - forward.x * right };
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
  it.each([0.85, 0.9, 0.95])("puts the mountain to the left and sea to the right at t=%s", t => {
    const at = station(t);
    const road = at(0), mountain = at(100), sea = at(-60);
    for (const height of [worldHeight, surfaceHeight]) {
      expect(height(mountain.x, mountain.z) - height(road.x, road.z)).toBeGreaterThanOrEqual(30);
      expect(height(sea.x, sea.z)).toBeLessThan(0);
    }
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
    const shore = [-15, 30, 75, 120, 165].map(waterline);
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
        const p = bayPoint(-15 + i * 45, shore[i]! + offshore);
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
  ])("preserves the existing walking elevation at t=%s", (t, baseline) => {
    const { x, z } = pathPointAt(t);
    expect(worldHeight(x, z)).toBeCloseTo(baseline, 10);
  });

  it("is deterministic across reversed and interleaved coastal queries", () => {
    const points = [0.82, 0.85, 0.9, 0.95, 1].flatMap(t => [-100, -60, 0, 26.5, 40, 100, 140].map(station(t)));
    const first = points.map(p => worldHeight(p.x, p.z));
    for (const p of [...points].reverse()) worldHeight(p.x + 0.01, p.z - 0.01);
    expect(points.map(p => worldHeight(p.x, p.z))).toEqual(first);
  });

  it("keeps the far ridge continuous where the nearest walking segment changes", () => {
    // This point used to jump between projections onto the bend and route end.
    for (let z = -867; z <= -864; z += 0.05) {
      expect(Math.abs(worldHeight(202, z + 0.05) - worldHeight(202, z))).toBeLessThan(0.06);
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
