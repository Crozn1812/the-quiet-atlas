import { describe, expect, it } from "vitest";
import { createGrassField, grassFieldAllowed, grassFieldBlade } from "../../../src/features/world/foliage/grass-field";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { isGroundCoverExcluded } from "../../../src/features/world/foliage/scatter";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

describe("camera grass field", () => {
  it.each(["Low", "High"] as const)("keeps the legacy blade layer empty on %s", quality => {
    // High already uses HR-LIGHT curved grass; Low never renders this layer.
    const field = createGrassField(quality), point = pathPointAt(0.1);
    expect(field.radius).toBe(quality === "High" ? 18 : 0);
    expect(field.mesh.count).toBe(0);
    expect(field.update(point.x, point.z, 0, true)).toMatchObject({ sampled: 0, pending: 0 });
    expect(field.update(point.x + 10, point.z, 1)).toMatchObject({ sampled: 0, pending: 0 });
    expect(field.mesh.visible).toBe(false);
    field.dispose(); field.dispose();
  });
  it("keeps blade seeds deterministic", () => {
    expect(grassFieldBlade(-17, 50)).toEqual(grassFieldBlade(-17, 50));
    expect(grassFieldBlade(-17, 50).height).toBeGreaterThanOrEqual(0.15);
  });
  it("keeps road, path and water empty across the route", () => {
    let allowed = 0;
    for (let t = 0; t <= 1; t += 0.025) {
      const p = pathPointAt(t);
      expect(grassFieldAllowed(p.x, p.z)).toBe(false);
      for (let dx = -40; dx <= 40; dx += 4) for (let dz = -40; dz <= 40; dz += 4) {
        const x = p.x + dx, z = p.z + dz;
        if (!grassFieldAllowed(x, z)) continue;
        allowed++;
        expect(isGroundCoverExcluded(x, z)).toBe(false);
        expect(worldHeight(x, z)).toBeGreaterThan(waterLevelAt(z) + 0.15);
      }
    }
    expect(allowed).toBeGreaterThan(100);
    for (const zone of ZONES) expect(grassFieldAllowed(zone.position.x, zone.position.z)).toBe(false);
  });

});
