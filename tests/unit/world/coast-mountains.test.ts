import { describe, expect, it } from "vitest";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";

// B2-152b: left = (fz, -fx); use the full coastal chord for distant relief,
// and the local walking tangent when measuring the preserved foreground.
const start = pathPointAt(0.82);
const end = pathPointAt(1);
const forward = end.clone().sub(start).normalize();
function point(along: number, left: number) {
  along *= WORLD_SCALE;
  return { x: start.x + forward.x * along + forward.z * left,
    z: start.z + forward.z * along - forward.x * left };
}
function height(along: number, left: number, sample = worldHeight) {
  const p = point(along, left);
  return sample(p.x, p.z);
}
function station(t: number, left: number) {
  const p = pathPointAt(t);
  const f = pathPointAt(Math.min(1, t + 0.00001)).sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
  return { x: p.x + f.z * left, z: p.z - f.x * left };
}
function triangleSlopes(x: number, z: number) {
  const x0 = Math.floor(x / 2) * 2, z0 = Math.floor(z / 2) * 2;
  const [a, b, c, d] = [[x0, z0], [x0 + 2, z0], [x0, z0 + 2], [x0 + 2, z0 + 2]]
    .map(([x, z]) => Math.fround(worldHeight(x!, z!))) as [number, number, number, number];
  return [Math.hypot(b - a, c - a) / 2, Math.hypot(d - b, d - c) / 2];
}

describe("distant coastal mountains and rocky cape (B2-173)", () => {
  it("has one pointed 110–150 m main summit behind the old left ridge", () => {
    const summit = point(155, 325);
    const projection = 155 * WORLD_SCALE / start.distanceTo(end);
    const road = pathPointAt(0.82 + 0.18 * projection);
    expect(projection).toBeGreaterThanOrEqual(0);
    expect(projection).toBeLessThanOrEqual(1);
    expect(nearestPath(summit.x, summit.z).distance).toBeGreaterThanOrEqual(150);
    for (const sample of [worldHeight, surfaceHeight]) {
      const top = sample(summit.x, summit.z);
      const rise = top - sample(road.x, road.z);
      expect(rise).toBeGreaterThanOrEqual(110);
      expect(rise).toBeLessThanOrEqual(150);
      // A flat-topped shelf would fail these four independent summit drops.
      for (const [along, left] of [[135, 325], [175, 325], [155, 305], [155, 345]]) {
        expect(top - height(along!, left!, sample)).toBeGreaterThan(10);
      }
      let highLocalPeaks = 0;
      for (let along = 0; along <= 195; along += 5) for (let left = 150; left <= 900; left += 5) {
        const h = height(along, left, sample);
        expect(h - sample(road.x, road.z)).toBeLessThanOrEqual(150);
        if (h < 110) continue;
        if ([[along - 5, left], [along + 5, left], [along, left - 5], [along, left + 5]]
          .every(([a, l]) => h > height(a!, l!, sample))) highLocalPeaks++;
      }
      expect(highLocalPeaks).toBe(1);
    }
  });

  it("has 30–40 degree road-facing shoulders and a rocky rear cliff on rendered triangles", () => {
    for (let distance = 20; distance <= 110; distance += 2) {
      const shoulder = point(155, 325 - distance);
      for (const slope of triangleSlopes(shoulder.x, shoulder.z)) {
        expect(slope).toBeGreaterThanOrEqual(Math.tan(30 * Math.PI / 180));
        expect(slope).toBeLessThanOrEqual(Math.tan(40 * Math.PI / 180));
      }
    }
    for (let distance = 20; distance <= 80; distance += 2) {
      const cliff = point(155, 325 + distance);
      for (const slope of triangleSlopes(cliff.x, cliff.z)) {
        // mesh.ts fully exposes PALETTE rock on faces steeper than 45 degrees.
        expect(slope).toBeGreaterThan(Math.tan(45 * Math.PI / 180));
        expect(slope).toBeLessThanOrEqual(1.2); // Retain the old coastal slope cap.
      }
    }
  });

  it("separates two lower 70–100 m mountain layers behind the main summit", () => {
    const crests = [[20, 580], [155, 790]] as const;
    for (const sample of [worldHeight, surfaceHeight]) {
      for (const [along, left] of crests) {
        const p = point(along, left);
        const road = pathPointAt(0.82 + 0.18 * along * WORLD_SCALE / start.distanceTo(end));
        const rise = sample(p.x, p.z) - sample(road.x, road.z);
        expect(left).toBeGreaterThan(325);
        expect(nearestPath(p.x, p.z).distance).toBeGreaterThan(150);
        expect(rise).toBeGreaterThanOrEqual(70);
        expect(rise).toBeLessThanOrEqual(100);
        expect(sample(p.x, p.z)).toBeLessThan(height(155, 325, sample));
        expect(sample(p.x, p.z) - height(along + 20, left, sample)).toBeGreaterThan(10);
      }
      // Low saddles make distinct layers, rather than a single broad plateau.
      expect(height(87.5, 452.5, sample)).toBeLessThan(40);
      expect(height(87.5, 685, sample)).toBeLessThan(40);
    }
  });

  it("puts a steep cape right and ahead, attached to the outer bay rim and projecting into the sea", () => {
    const eye = pathPointAt(0.9);
    const f = pathPointAt(0.90001).sub(pathPointAt(0.89999)).normalize();
    const crest = point(210, -330), tip = point(420, -330);
    for (const p of [crest, tip]) {
      const dx = p.x - eye.x, dz = p.z - eye.z;
      expect(dx * f.x + dz * f.z).toBeGreaterThan(0);
      expect(-dx * f.z + dz * f.x).toBeGreaterThan(0);
      expect(nearestRiver(p.x, p.z).distance).toBeGreaterThan(150);
    }
    for (const sample of [worldHeight, surfaceHeight]) {
      expect(height(210, -330, sample)).toBeGreaterThan(30);
      // The nose passes the end of the route; the old seabed here was -2.5 m.
      expect(420).toBeGreaterThan(start.distanceTo(end));
      expect(sample(tip.x, tip.z)).toBeGreaterThan(0);
      expect(height(445, -330, sample)).toBeLessThan(0);
      // Follow the dry spine back onto existing land: this must be a peninsula.
      for (let along = -20; along <= 420; along += 2) {
        expect(height(along, -330, sample), `cape spine at along=${along}`).toBeGreaterThan(0);
      }
      expect(height(210, -275, sample)).toBeLessThan(0);
      expect(height(210, -385, sample)).toBeLessThan(0);
    }
    const flank = point(210, -350);
    for (const slope of triangleSlopes(flank.x, flank.z)) {
      expect(slope).toBeGreaterThan(Math.tan(40 * Math.PI / 180));
      expect(slope).toBeLessThanOrEqual(1.2);
    }
  });

  // ADR 0017: rebaseline the same metre setbacks after relocating the route.
  it.each([
    [0.82, [3.2033698860219904, 10.952158865411047, 27.450340097888112, 40.664694379722086]],
    [0.85, [3.110268073322401, 14.46163434197473, 28.896743553115684, 37.82627472262389]],
    [0.9, [2.300931806526925, 13.22840429272034, 44.19526163130878, 44.3798110141974]],
    [0.95, [1.864767356675216, 11.345374118336428, 42.84906176797373, 42.335025363523044]],
    [1, [-1.337282878550298, 8.911230201594096, 42.57550628964361, 44.73030621348666]],
  ] as const)("locks the relocated left slope at t=%s", (t, baseline) => {
    [40, 60, 100, 140].forEach((left, i) => {
      const p = station(t, left);
      expect(worldHeight(p.x, p.z)).toBe(baseline[i]);
    });
  });

  it("keeps the entire coastal left shoulder within 35 degrees for the first 40 m", () => {
    const limit = Math.tan(35 * Math.PI / 180);
    for (let step = 820; step <= 1000; step++) for (let left = 1.5; left <= 41.5; left += 2) {
      const p = station(step / 1000, left);
      for (const slope of triangleSlopes(p.x, p.z)) expect(slope).toBeLessThanOrEqual(limit);
    }
  });

  it("keeps new summits, saddles, cliff edges and cape toes continuous and deterministic", () => {
    const points = [[155, 325], [20, 580], [155, 790], [87.5, 452.5], [87.5, 685],
      [155, 450], [155, 150], [210, -330], [440, -330], [210, -368], [-20, -330]].map(([a, l]) => point(a!, l!));
    const baseline = points.map(p => worldHeight(p.x, p.z));
    for (const p of [...points].reverse()) {
      for (const [dx, dz] of [[0.00001, 0], [0, 0.00001]]) {
        expect(Math.abs(worldHeight(p.x + dx!, p.z + dz!) - worldHeight(p.x - dx!, p.z - dz!))).toBeLessThan(0.001);
      }
    }
    expect(points.map(p => worldHeight(p.x, p.z))).toEqual(baseline);
  });
});
