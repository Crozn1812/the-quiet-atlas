import { Color, MeshToonMaterial } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { SEA_FOAM_MAX_SLOPE, SEA_SHORE_SAMPLES } from "../../../src/features/world/water/material";
import { createSea } from "../../../src/features/world/water/sea";

/** Zones stay dry except the open river channel (not walkable ground; Lead B2-037 review). */
const inChannel = (x: number, z: number) => nearestRiver(x, z).distance < 14;
import { createTileMesh } from "../../../src/features/world/terrain/mesh";

describe("organic coast", () => {
  it("anchors sea foam to the terrain coastline, including the headland", () => {
    const sea = createSea("Balanced");
    try {
      const uniforms = sea.mesh.material.uniforms;
      const shore = uniforms.uShoreZ!.value as number[];
      const bounds = uniforms.uShoreBounds!.value;
      expect(shore).toHaveLength(SEA_SHORE_SAMPLES);
      expect(uniforms.uHasShore!.value).toBe(1);
      const near = sea.mesh.geometry.boundingBox!.max.z;
      for (let i = 0; i < shore.length; i++) {
        const x = bounds.x + i / (shore.length - 1) * bounds.y;
        const z = shore[i]!;
        if (z > near) {
          expect(worldHeight(x, near)).toBeLessThan(0);
        } else {
          expect(worldHeight(x, z - 0.001), `sea at x=${x}`).toBeLessThan(0);
          expect(worldHeight(x, z + 0.001), `land at x=${x}`).toBeGreaterThan(0);
        }
      }
      // Between samples the beach stays within half a metre, plus the linear-interpolation error of the local
      // shoreline slope over half a sample (6.25 m spacing): B2-152b's ridge toe and bay sides turn sharply.
      const spacing = bounds.y / (shore.length - 1);
      for (let x = -390; x <= 390; x += 20) {
        if (Math.abs(x) < 50) continue;
        const sample = (x - bounds.x) / bounds.y * (shore.length - 1);
        const index = Math.floor(sample);
        const z = shore[index]! + (shore[index + 1]! - shore[index]!) * (sample - index);
        const slopes = [index - 1, index, index + 1].filter(i => i >= 0 && i + 1 < shore.length)
          .map(i => Math.abs(shore[i + 1]! - shore[i]!) / spacing);
        // The shader fades foam where |slope| ≥ SEA_FOAM_MAX_SLOPE; only spans with a visible foam line are checked.
        if (Math.abs(shore[index + 1]! - shore[index]!) / spacing >= SEA_FOAM_MAX_SLOPE * 0.5) continue;
        const tolerance = 0.5 + Math.max(...slopes) * spacing / 2;
        // Open estuary samples (no crossing before the near edge) carry no foam line; skip spans that touch one.
        if (shore[index]! > near || shore[index + 1]! > near) continue;
        expect(worldHeight(x, z - tolerance), `sea between samples at x=${x}`).toBeLessThan(0);
        expect(worldHeight(x, z + tolerance), `land between samples at x=${x}`).toBeGreaterThan(0);
      }
    } finally { sea.dispose(); }
  });

  // B2-152b's bay reaches z ≈ −680: every point below sea level near the coast must sit under the sea plane.
  it("covers the whole curved bay with the sea surface (no dry seabed)", () => {
    const sea = createSea("Balanced");
    try {
      const box = sea.mesh.geometry.boundingBox!;
      for (let z = -880; z <= -500; z += 10) for (let x = -400; x <= 400; x += 10) {
        if (worldHeight(x, z) >= 0 || nearestRiver(x, z).distance < 14) continue;
        expect(x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z, `seabed at (${x}, ${z})`).toBe(true);
      }
    } finally { sea.dispose(); }
  });

  it("retains pre-landmark shoreline zero crossings, including the protected headland", () => {
    // B2-109 adds clearance above water without moving the existing coastline.
    for (const [x, baseline] of [
      [-30, -877.7984410158824], [-10, -853.156918200897], [0, -875.1729319540318],
      [10, -915.606637014309], [20, -910.1774243644904], [30, -869.0726099351887],
    ] as const) {
      expect(Math.abs(worldHeight(x, baseline))).toBeLessThan(1e-8);
      expect(worldHeight(x, baseline - 0.01)).toBeLessThan(0);
      expect(worldHeight(x, baseline + 0.01)).toBeGreaterThan(0);
    }
  });

  it("has at least 8 m shoreline variation across 40 zero crossings", () => {
    const shore = Array.from({ length: 40 }, (_, i) => {
      // B2-152b moves the ridge west and bay east. Probe the seeded beaches
      // outside both footprints; coast-shape covers the curved bay's transects.
      const x = i < 20 ? -650 + i * 20 : 430 + (i - 20) * 20;
      let sea = -1040;
      let land = sea;
      // Find the outermost crossing, including the protected Last Postcard headland.
      while (worldHeight(x, land) < 0 && land < -800) land += 0.5;
      expect(worldHeight(x, sea)).toBeLessThan(0);
      expect(worldHeight(x, land)).toBeGreaterThanOrEqual(0);
      sea = land - 0.5;
      for (let step = 0; step < 24; step++) {
        const middle = (sea + land) / 2;
        if (worldHeight(x, middle) < 0) sea = middle;
        else land = middle;
      }
      const z = (sea + land) / 2;
      expect(Math.abs(worldHeight(x, z))).toBeLessThan(1e-6);
      expect(worldHeight(x, z - 32), `x=${x}, shore z=${z}`).toBeLessThanOrEqual(-2.49);
      return z;
    });
    const mean = shore.reduce((sum, z) => sum + z, 0) / shore.length;
    const deviation = Math.sqrt(shore.reduce((sum, z) => sum + (z - mean) ** 2, 0) / shore.length);
    expect(deviation).toBeGreaterThanOrEqual(8);
  });

  it("keeps 2001 path samples and a half-metre grid throughout every zone dry", () => {
    for (let i = 0; i <= 2000; i++) {
      const point = pathPointAt(i / 2000);
      expect(worldHeight(point.x, point.z), `path t=${i / 2000}`).toBeGreaterThanOrEqual(0.4);
    }
    for (const zone of ZONES) {
      let minimum = Infinity;
      let clearance = Infinity;
      for (let x = -zone.radius; x <= zone.radius; x += 0.5) {
        for (let z = -zone.radius; z <= zone.radius; z += 0.5) {
          if (Math.hypot(x, z) > zone.radius || inChannel(zone.position.x + x, zone.position.z + z)) continue;
          const height = worldHeight(zone.position.x + x, zone.position.z + z);
          minimum = Math.min(minimum, height);
          clearance = Math.min(clearance, height - waterLevelAt(zone.position.z + z));
        }
      }
      // Include the circular boundary between grid intersections, too.
      for (let i = 0; i < 360; i++) {
        const angle = i * Math.PI / 180;
        const px = zone.position.x + zone.radius * Math.cos(angle);
        const pz = zone.position.z + zone.radius * Math.sin(angle);
        if (!inChannel(px, pz)) {
          const height = worldHeight(px, pz);
          minimum = Math.min(minimum, height);
          clearance = Math.min(clearance, height - waterLevelAt(pz));
        }
      }
      expect(minimum, zone.id).toBeGreaterThanOrEqual(0.4);
      // Subtraction can round an exact 0.4 m clearance down by one ULP.
      expect(clearance, zone.id).toBeGreaterThanOrEqual(0.4 - 1e-12);
    }
  });

  it("changes by at most 0.6 m over half a metre across the entire coastal strip", () => {
    let largest = { difference: 0, x: 0, z: 0 };
    const diagonal = 0.5 / Math.SQRT2;
    const offsets = [[0.5, 0], [0, -0.5], [diagonal, diagonal], [diagonal, -diagonal]] as const;
    for (let x = -400; x <= 400; x += 2) for (let z = -760; z >= -1040; z -= 0.5) {
      const height = worldHeight(x, z);
      for (const [dx, dz] of offsets) {
        const difference = Math.abs(height - worldHeight(x + dx, z + dz));
        if (difference > largest.difference) largest = { difference, x, z };
      }
    }
    expect(largest.difference, JSON.stringify(largest)).toBeLessThanOrEqual(0.6);
  }, 20000);

  it("has submerged seabed 120 m seaward from Last Postcard", () => {
    const zone = ZONES.find(zone => zone.id === "last-postcard")!;
    expect(worldHeight(zone.position.x, zone.position.z - 120)).toBeLessThan(-1);
  });

  it("colours 0.3 m vertices with palette sand, fades at 0.9–1.6 m, and leaves 5 m on the valley wash", () => {
    const material = new MeshToonMaterial();
    const mesh = createTileMesh({
      cells: 2, size: 4, origin: { x: 100, y: 0, z: -880 },
      heights: new Float32Array([0.3, 0.9, 1.25, 1.6, 5, 5, 5, 5, 5]),
    }, material);
    try {
      const colors = mesh.geometry.getAttribute("color");
      const sand = new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.22);
      const at = (index: number) => new Color().fromArray(colors.array, index * 3);
      expect(at(0).toArray()).not.toEqual([1, 1, 1]);
      expect(at(0).r).toBeCloseTo(sand.r, 6);
      expect(at(0).g).toBeCloseTo(sand.g, 6);
      expect(at(0).b).toBeCloseTo(sand.b, 6);
      expect(at(1)).toEqual(at(0));
      // Lead (B2-037 review): high ground keeps the near-white valley wash (>= 0.78), not sand.
      expect(at(4).b).toBeGreaterThan(sand.b + 0.1);
      expect(Math.min(at(4).r, at(4).g, at(4).b)).toBeGreaterThanOrEqual(0.78);
      expect(at(2).b).toBeGreaterThan(at(0).b);
      expect(at(2).b).toBeLessThan(at(3).b);
      expect(material.vertexColors).toBe(true);
    } finally { mesh.geometry.dispose(); material.dispose(); }
  });
});
