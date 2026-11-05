import { describe, expect, it } from "vitest";
import { Color } from "three";
import { hex } from "../../../src/features/world/art/palette";
import { createFarLandscape, FAR_LANDSCAPE, GAMEPLAY_FAR } from "../../../src/features/world/scene/far-landscape";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { worldHeight } from "../../../src/features/world/terrain/height";

// Lead batch 25: the long view (sea horizon, B2-173 peak) is one cheap shadowless mesh under the detail terrain.
describe("far landscape", () => {
  const far = createFarLandscape();
  it("covers the whole route and the coast in one shadowless, non-raycast draw", () => {
    const { originX, originZ, size } = FAR_LANDSCAPE;
    for (let i = 0; i <= 50; i++) {
      const p = pathPointAt(i / 50);
      expect(p.x).toBeGreaterThan(originX + 300);
      expect(p.x).toBeLessThan(originX + size - 300);
      expect(p.z).toBeGreaterThan(originZ + 300);
      expect(p.z).toBeLessThan(originZ + size - 300);
    }
    expect(far.mesh.castShadow).toBe(false);
    expect(far.mesh.receiveShadow).toBe(false);
    expect(far.mesh.geometry.index!.count / 3).toBeLessThanOrEqual(52_000);
    const hits: unknown[] = [];
    far.mesh.raycast({} as never, hits as never);
    expect(hits).toHaveLength(0);
  });
  it("sits below the streamed detail terrain everywhere", () => {
    const positions = far.mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 997) {
      const x = far.mesh.position.x + positions.getX(i);
      const z = far.mesh.position.z + positions.getZ(i);
      expect(far.mesh.position.y + positions.getY(i)).toBeCloseTo(worldHeight(x, z) - FAR_LANDSCAPE.sink, 4);
    }
  });
  it("paints forested slopes with canopy green rather than lawn", () => {
    const colors = far.mesh.geometry.getAttribute("color");
    const { cells, size, originX, originZ } = FAR_LANDSCAPE;
    const stride = cells + 1;
    const p = pathPointAt(0.15);
    const x = Math.round((p.x + 60 - originX) / (size / cells)), z = Math.round((p.z - originZ) / (size / cells));
    const sample = new Color().fromBufferAttribute(colors, z + x * stride);
    const deep = new Color(hex("forestDeep")), grass = new Color(hex("grass"));
    const distance = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(distance(sample, deep)).toBeLessThan(distance(sample, grass));
  });
  it("reaches further on higher quality", () => {
    expect(GAMEPLAY_FAR.Low).toBeLessThan(GAMEPLAY_FAR.Balanced);
    expect(GAMEPLAY_FAR.Balanced).toBeLessThan(GAMEPLAY_FAR.High);
    expect(GAMEPLAY_FAR.Low).toBeGreaterThanOrEqual(100);
    far.dispose();
    far.dispose();
  });
});
