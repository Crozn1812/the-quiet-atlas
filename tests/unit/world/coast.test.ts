import { Color, MeshToonMaterial } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";

/** Zones stay dry except the open river channel (not walkable ground; Lead B2-037 review). */
const inChannel = (x: number, z: number) => nearestRiver(x, z).distance < 14;
import { createTileMesh } from "../../../src/features/world/terrain/mesh";

describe("organic coast", () => {
  it("has at least 8 m shoreline variation across 40 zero crossings", () => {
    const shore = Array.from({ length: 40 }, (_, i) => {
      const x = -390 + i * 20;
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
      // Away from the estuary and dry zone, the beach reaches its shelf in 32 m.
      if (Math.abs(x) >= 50) expect(worldHeight(x, z - 32), `x=${x}, shore z=${z}`).toBeLessThanOrEqual(-2.49);
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
      for (let x = -zone.radius; x <= zone.radius; x += 0.5) {
        for (let z = -zone.radius; z <= zone.radius; z += 0.5) {
          if (Math.hypot(x, z) > zone.radius || inChannel(zone.position.x + x, zone.position.z + z)) continue;
          minimum = Math.min(minimum, worldHeight(zone.position.x + x, zone.position.z + z));
        }
      }
      // Include the circular boundary between grid intersections, too.
      for (let i = 0; i < 360; i++) {
        const angle = i * Math.PI / 180;
        const px = zone.position.x + zone.radius * Math.cos(angle);
        const pz = zone.position.z + zone.radius * Math.sin(angle);
        if (!inChannel(px, pz)) minimum = Math.min(minimum, worldHeight(px, pz));
      }
      expect(minimum, zone.id).toBeGreaterThanOrEqual(0.4);
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
