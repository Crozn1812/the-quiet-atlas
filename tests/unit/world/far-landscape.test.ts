import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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

// B2-179 buffer regression, refreshed for B2-195's hill banks and road bed. The
// shared heightfield changes positions, derived normals and paint, not topology.
it("constructs in small steps and matches the B2-195 mesh baseline byte for byte", () => {
  const far = createFarLandscape({ deferred: true });
  try {
    expect(far.mesh.visible).toBe(false);
    expect(far.mesh.geometry.getAttribute("position")).toBeUndefined();
    let steps = 0, maximum = 0;
    while (true) {
      const start = performance.now();
      const result = far.build.next();
      maximum = Math.max(maximum, performance.now() - start);
      steps++;
      if (result.done) break;
    }
    expect(steps).toBeGreaterThan(FAR_LANDSCAPE.cells * 2);
    expect(far.mesh.visible).toBe(true);
    const expected = {
      position: "b360eaef8fc90cb92404ee7d87a9ea60bc56570a14fd57935844e987655d3283",
      normal: "a284ce607abb36a94fa60f3ec16c0e9c40949ccf2c60749816832eacde521c9a",
      // B2-224 lifts dry forest moss; the far terrain shares createTileMesh paint.
      // Positions, normals and topology retain their B2-195 byte baselines.
      color: "321615285a6cdfb97cdcaa239878add7e3418b88aa0cd49c43ee950f06169f73",
      index: "f8d3e9572983f5b8556b2d8443699588de4a2d7171eca969f2a7821330d7f54d",
    };
    const actual = Object.fromEntries(Object.keys(expected).map(name => {
      const array = name === "index" ? far.mesh.geometry.index!.array : far.mesh.geometry.getAttribute(name).array;
      return [name, createHash("sha256").update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest("hex")];
    }));
    expect(actual).toEqual(expected);
    console.log(`B2-179 far landscape: ${steps} steps, max ${maximum.toFixed(2)}ms (Node)`);
  } finally { far.dispose(); }
});

it("releases resources once and cannot resume after cancellation at any build phase", () => {
  for (const steps of [0, 40, 300, 1800, 1924]) {
    const far = createFarLandscape({ deferred: true });
    const geometry = vi.spyOn(far.mesh.geometry, "dispose");
    const material = vi.spyOn(far.mesh.material, "dispose");
    for (let i = 0; i < steps; i++) far.build.next();
    far.dispose(); far.dispose();
    expect(far.build.next().done).toBe(true);
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(far.mesh.parent).toBeNull();
  }
});
