import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PATH_BRIDGES, pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { riverPointAt, riverTangentAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { riverWidthAt, roadBaseHeight, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";

function renderedTerrain(x: number, z: number) {
  const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
  const tx = (x - gx) / 2, tz = (z - gz) / 2;
  const a = Math.fround(worldHeight(gx, gz)), b = Math.fround(worldHeight(gx + 2, gz));
  const c = Math.fround(worldHeight(gx, gz + 2)), d = Math.fround(worldHeight(gx + 2, gz + 2));
  return tx + tz <= 1
    ? { height: a + (b - a) * tx + (c - a) * tz, slope: Math.hypot(b - a, c - a) / 2 }
    : { height: d + (c - d) * (1 - tx) + (b - d) * (1 - tz), slope: Math.hypot(d - c, d - b) / 2 };
}

function atFord(x: number, z: number) {
  const path = nearestPath(x, z);
  return PATH_BRIDGES.some(bridge => Math.abs(path.t - bridge.t) * pathLength() < 18);
}

describe("hill stream banks", () => {
  it("raises dry grass 0.2–0.5 m above water within 3 m, with banks below 35 degrees", () => {
    let minRise = Infinity, maxRise = -Infinity, maxSlope = 0;
    let minRenderedRise = Infinity, maxRenderedRise = -Infinity, maxRenderedSlope = 0;
    for (let i = 0; i <= 350; i++) {
      const t = 0.4 + i / 1000;
      const centre = riverPointAt(t), tangent = riverTangentAt(t);
      for (const side of [-1, 1]) for (let step = 0; step <= 30; step++) {
        const distance = riverWidthAt(t) / 2 + step / 10;
        const x = centre.x - tangent.z * distance * side;
        const z = centre.z + tangent.x * distance * side;
        // Existing submerged fords are covered by B2 bridges. Their authored
        // path/approach heights are preserved by the separate baseline gate.
        if (atFord(x, z)) continue;
        const height = worldHeight(x, z);
        const rendered = renderedTerrain(x, z);
        if (step === 30) {
          minRise = Math.min(minRise, height - waterLevelAt(z));
          maxRise = Math.max(maxRise, height - waterLevelAt(z));
          minRenderedRise = Math.min(minRenderedRise, rendered.height - waterLevelAt(z));
          maxRenderedRise = Math.max(maxRenderedRise, rendered.height - waterLevelAt(z));
        }
        const epsilon = 0.01;
        const dx = (worldHeight(x + epsilon, z) - worldHeight(x - epsilon, z)) / (2 * epsilon);
        const dz = (worldHeight(x, z + epsilon) - worldHeight(x, z - epsilon)) / (2 * epsilon);
        maxSlope = Math.max(maxSlope, Math.hypot(dx, dz));
        maxRenderedSlope = Math.max(maxRenderedSlope, rendered.slope);
        if (step > 0) expect(height - waterLevelAt(z), `dry bank t=${t}, side=${side}, step=${step}`).toBeGreaterThanOrEqual(0);
      }
    }
    expect(minRise).toBeGreaterThanOrEqual(0.2);
    expect(maxRise).toBeLessThanOrEqual(0.5);
    expect(maxSlope).toBeLessThanOrEqual(Math.tan(35 * Math.PI / 180));
    expect(minRenderedRise).toBeGreaterThanOrEqual(0.2);
    expect(maxRenderedRise).toBeLessThanOrEqual(0.5);
    expect(maxRenderedSlope).toBeLessThanOrEqual(Math.tan(35 * Math.PI / 180));
    console.info(`B2-195 banks: rise=${minRise.toFixed(3)}–${maxRise.toFixed(3)} m; `
      + `slope=${(Math.atan(maxSlope) * 180 / Math.PI).toFixed(2)}°; `
      + `rendered rise=${minRenderedRise.toFixed(3)}–${maxRenderedRise.toFixed(3)} m; `
      + `rendered slope=${(Math.atan(maxRenderedSlope) * 180 / Math.PI).toFixed(2)}°`);
  });

  it("preserves forest banks, every half metre of walking strip/bridge approaches and dry zone foundations", () => {
    // Digests captured from the pre-B2-195 heightfield at micrometre precision:
    // stricter than the allowed 0.05 m movement, without bulky height arrays.
    const forest = createHash("sha256"), path = createHash("sha256"), zones = createHash("sha256");
    const record = (hash: ReturnType<typeof createHash>, x: number, z: number) => {
      const base = roadBaseHeight(x, z);
      // The coastal foundation may lower existing walking/zone ground by
      // at most 5 cm. Its uncut height must still match the original baseline.
      expect(Math.abs(worldHeight(x, z) - base)).toBeLessThanOrEqual(0.05 + 1e-12);
      hash.update(`${base.toFixed(6)};`);
    };
    for (let i = 0; i <= 350; i++) {
      const t = i / 1000, p = riverPointAt(t), f = riverTangentAt(t);
      for (let offset = -12; offset <= 12; offset += 0.5) record(forest, p.x - f.z * offset, p.z + f.x * offset);
    }
    const samples = Math.ceil(pathLength() / 0.5);
    for (let i = 0; i <= samples; i++) {
      const t = i / samples, p = pathPointAt(t);
      const f = pathPointAt(Math.min(1, t + 0.00001)).sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
      // Stay just inside the analytic 1.5 m boundary: nearestPath uses a
      // polyline, whose tiny projection error can blend the exact outer edge.
      for (const offset of [-1.49, 0, 1.49]) record(path, p.x - f.z * offset, p.z + f.x * offset);
      for (const side of [-1, 1]) {
        const inner = worldHeight(p.x - f.z * 1.49 * side, p.z + f.x * 1.49 * side);
        const edge = worldHeight(p.x - f.z * 1.5 * side, p.z + f.x * 1.5 * side);
        // This bound passes on both baseline and new terrain. Together with
        // the fixed interior, edge movement stays below 2 * 0.025 = 0.05 m.
        expect(Math.abs(edge - inner)).toBeLessThan(0.025);
      }
    }
    for (const zone of ZONES) for (let dx = -zone.radius; dx <= zone.radius; dx += 1) {
      for (let dz = -zone.radius; dz <= zone.radius; dz += 1) {
        const x = zone.position.x + dx, z = zone.position.z + dz;
        // Pads never dam the open river; its existing 14 m protection
        // boundary is also used by terrain-landmarks.test.ts.
        if (Math.hypot(dx, dz) <= zone.radius && nearestRiver(x, z).distance >= 14) record(zones, x, z);
      }
    }
    expect({ forest: forest.digest("hex"), path: path.digest("hex"), zones: zones.digest("hex") }).toEqual({
      forest: "ad0ed709f75f2a7fb8e7f6a121a68981856702af9585a614a5eb4bc23475dce8",
      path: "07a7fe1af33f072b32d24505fd93645b40c447a7fe3b0753047043b5ad901dcc",
      zones: "b6278fcdc31f2cc70a082b39dc0056e64ad14358fef8b4773bc8b39b50a0a82b",
    });
  });
});
