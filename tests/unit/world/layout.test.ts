import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { WALK_SPEED } from "../../../src/features/interaction/movement";
import { ZONE_IDS } from "../../../src/features/interaction/targets";
import { RIVER_CONTROL_POINTS, riverLength, riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { PATH_BRIDGES, pathLength, pathPointAt, pathRiverTAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { routeSeconds, secondsToZone } from "../../../src/features/world/layout/timing";
import { LIGHTING_TRANSITION, timeOfDayAt } from "../../../src/features/world/layout/lighting";

function measuredLength(pointAt: (t: number) => Vector3, end = 1): number {
  let length = 0;
  let previous = pointAt(0);
  for (let i = 1; i <= 8192; i++) {
    const point = pointAt(end * i / 8192);
    length += previous.distanceTo(point);
    previous = point;
  }
  return length;
}

describe("river and walking geometry", () => {
  it("forms a clear alternating S ribbon from forest to coast, flat with unit tangents", () => {
    const samples = Array.from({ length: 1025 }, (_, i) => riverPointAt(i / 1024));
    let previousSign = 0;
    let reversals = 0;
    for (let i = 1; i < samples.length - 1; i++) {
      const before = samples[i]!.clone().sub(samples[i - 1]!);
      const after = samples[i + 1]!.clone().sub(samples[i]!);
      const turn = before.x * after.z - before.z * after.x;
      // Ignore numerically straight pieces, including the estuary.
      if (Math.abs(turn) > 1e-4) {
        const sign = Math.sign(turn);
        if (previousSign && sign !== previousSign) reversals++;
        previousSign = sign;
      }
      expect(samples[i]!.y).toBe(0);
      expect(samples[i]!.z).toBeLessThan(samples[i - 1]!.z);
      expect(riverTangentAt(i / 1024).length()).toBeCloseTo(1, 8);
    }
    expect(reversals).toBeGreaterThanOrEqual(3);
    expect(Math.max(...samples.map(p => p.x))).toBeGreaterThan(50);
    expect(Math.min(...samples.map(p => p.x))).toBeLessThan(-50);
    expect(samples[0]).toEqual(new Vector3(0, 0, 0));
    expect(samples.at(-1)).toEqual(new Vector3(0, 0, -900));
    expect(riverLength()).toBeCloseTo(measuredLength(riverPointAt), 1);
    expect(Object.isFrozen(RIVER_CONTROL_POINTS)).toBe(true);
  });

  it("uses actual walking distance, including bridges, as its parameter", () => {
    expect(pathLength()).toBeCloseTo(measuredLength(pathPointAt), 1);
    for (const t of [0.14, 0.19, 0.235, 0.36, 0.5, 0.69, 0.89]) {
      expect(Math.abs(measuredLength(pathPointAt, t) - pathLength() * t)).toBeLessThan(0.02);
    }
    // A caller cannot mutate subsequent geometry queries.
    const original = pathPointAt(0.5);
    pathPointAt(0.5).set(999, 999, 999);
    expect(pathPointAt(0.5)).toEqual(original);
    const tangent = riverTangentAt(0.5);
    riverTangentAt(0.5).set(0, 0, 0);
    expect(riverTangentAt(0.5)).toEqual(tangent);
  });

  it("stays 6–10 m from the nearest river centre outside the two bridge corridors", () => {
    // Compare against ALL river segments, not just the corresponding river t:
    // the latter alone could miss a path clipping an adjacent bend.
    const river = Array.from({ length: 2049 }, (_, i) => riverPointAt(i / 2048));
    let previousBank = 0;
    let bankChanges = 0;
    for (let i = 0; i <= 2048; i++) {
      const t = i / 2048;
      const point = pathPointAt(t);
      expect(point.y).toBe(0);
      const riverT = pathRiverTAt(t);
      const offset = point.clone().sub(riverPointAt(riverT));
      const tangent = riverTangentAt(riverT);
      const side = offset.dot(new Vector3(-tangent.z, 0, tangent.x));
      if (Math.abs(side) > 0.01) {
        const bank = Math.sign(side);
        if (previousBank && previousBank !== bank) bankChanges++;
        previousBank = bank;
      }
      if (PATH_BRIDGES.some(bridge => t >= bridge.tStart && t <= bridge.tEnd)) continue;
      let nearest = Infinity;
      for (let j = 1; j < river.length; j++) {
        const a = river[j - 1]!;
        const b = river[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
        nearest = Math.min(nearest, Math.hypot(point.x - a.x - u * dx, point.z - a.z - u * dz));
      }
      expect(nearest).toBeGreaterThanOrEqual(6);
      expect(nearest).toBeLessThanOrEqual(10);
      expect(Math.abs(side)).toBeCloseTo(8, 6);
    }
    expect(bankChanges).toBe(2);
    expect(PATH_BRIDGES).toHaveLength(2);
    for (const bridge of PATH_BRIDGES) {
      expect(bridge.tStart).toBeLessThan(bridge.t);
      expect(bridge.t).toBeLessThan(bridge.tEnd);
      expect(pathPointAt(bridge.t).distanceTo(bridge.position)).toBeLessThan(1e-8);
      expect(bridge.position.distanceTo(riverPointAt(pathRiverTAt(bridge.t)))).toBeLessThan(1e-8);
      for (const t of [bridge.tStart, bridge.tEnd]) {
        expect(pathPointAt(t - 1e-7).distanceTo(pathPointAt(t + 1e-7))).toBeLessThan(0.001);
      }
    }
  });
});

describe("zone placement and design timing gates", () => {
  it("uses all interaction IDs once in walking order, with the three final destinations", () => {
    expect(ZONES.map(zone => zone.id)).toEqual([
      "first-light", "workshop", "roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard",
    ]);
    expect(new Set(ZONES.map(zone => zone.id))).toEqual(new Set(ZONE_IDS));
    expect(ZONES[0]!.t).toBe(0);
    expect(ZONES.at(-1)!.t).toBe(1);
    expect(ZONES.at(-1)!.biome).toBe("coast-dusk");
    // Three estimates endpoint tangents with finite differences; the normal
    // offset can shift Z by a few millimetres at the river mouth.
    expect(Math.abs(ZONES.at(-1)!.position.z + 900)).toBeLessThan(0.01);
    expect(ZONES.at(-1)!.lookDirection.z).toBeLessThan(-0.99);
    for (const zone of ZONES) {
      expect(zone.position).toEqual(pathPointAt(zone.t));
      expect(zone.radius).toBeGreaterThan(0);
      expect(zone.lookDirection.length()).toBeCloseTo(1, 8);
      expect(["forest-dawn", "hill", "coast-dusk"]).toContain(zone.biome);
      for (const other of ZONES) {
        if (other.id !== zone.id) expect(zone.position.distanceTo(other.position)).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("walks the complete route in 5–7 minutes and reaches the early content on time", () => {
    expect(WALK_SPEED).toBe(3);
    expect(routeSeconds()).toBeGreaterThanOrEqual(300);
    expect(routeSeconds()).toBeLessThanOrEqual(420);
    expect(secondsToZone("first-light")).toBe(0);
    expect(secondsToZone("workshop")).toBeGreaterThanOrEqual(45);
    expect(secondsToZone("workshop")).toBeLessThanOrEqual(60);
    expect(secondsToZone("roots")).toBeLessThanOrEqual(90);
    expect(secondsToZone("milestones")).toBeLessThanOrEqual(90);
    expect(secondsToZone("last-postcard")).toBe(routeSeconds());
    for (const zone of ZONES) {
      expect(Math.abs(secondsToZone(zone.id) - measuredLength(pathPointAt, zone.t) / WALK_SPEED)).toBeLessThan(0.01);
    }
  });
});

describe("spatial lighting and progress boundaries", () => {
  it("holds dawn/dusk and blends smoothly and monotonically between them", () => {
    expect(timeOfDayAt(0)).toBe(0);
    expect(timeOfDayAt(1)).toBe(1);
    expect(timeOfDayAt(LIGHTING_TRANSITION.start)).toBe(0);
    expect(timeOfDayAt(LIGHTING_TRANSITION.end)).toBe(1);
    expect(timeOfDayAt((LIGHTING_TRANSITION.start + LIGHTING_TRANSITION.end) / 2)).toBeCloseTo(0.5, 10);
    let previous = 0;
    for (let i = 0; i <= 4096; i++) {
      const value = timeOfDayAt(i / 4096);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    const delta = 1e-5;
    expect(timeOfDayAt(LIGHTING_TRANSITION.start + delta) / delta).toBeLessThan(0.001);
    expect((1 - timeOfDayAt(LIGHTING_TRANSITION.end - delta)) / delta).toBeLessThan(0.001);
  });

  it("clamps out-of-range progress and rejects non-finite inputs", () => {
    for (const pointAt of [riverPointAt, riverTangentAt, pathPointAt]) {
      expect(pointAt(-1)).toEqual(pointAt(0));
      expect(pointAt(2)).toEqual(pointAt(1));
      for (const t of [NaN, Infinity, -Infinity]) expect(() => pointAt(t)).toThrow(RangeError);
    }
    expect(timeOfDayAt(-1)).toBe(0);
    expect(timeOfDayAt(2)).toBe(1);
    for (const t of [NaN, Infinity, -Infinity]) expect(() => timeOfDayAt(t)).toThrow(RangeError);
  });
});
