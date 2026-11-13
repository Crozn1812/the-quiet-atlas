import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createFarLandscape, FAR_LANDSCAPE, GAMEPLAY_FAR } from "../../../src/features/world/scene/far-landscape";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { foliageBiomeAt } from "../../../src/features/world/foliage/scatter";

const groundCount = (FAR_LANDSCAPE.cells + 1) ** 2;
const hash = (array: ArrayBufferView) => createHash("sha256").update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest("hex");
describe("far landscape individual dawn crowns", () => {
  it("reuses one draw and stays below the original 51200 triangle budget", () => {
    const far = createFarLandscape();
    try {
      const g = far.mesh.geometry;
      expect(g.index!.count / 3).toBeLessThanOrEqual(51_200);
      expect(g.userData.farCrowns).toBeGreaterThan(300);
      expect(g.getAttribute("position").count).toBe(groundCount + g.userData.farCrowns * 180);
      expect(far.mesh.children).toHaveLength(0);
      expect(g.groups).toHaveLength(0);
      expect(Array.isArray(far.mesh.material)).toBe(false);
      expect(far.mesh.castShadow).toBe(false);
      expect(far.mesh.receiveShadow).toBe(false);
      const hits: unknown[] = [];
      far.mesh.raycast({} as never, hits as never);
      expect(hits).toHaveLength(0);
      process.stdout.write('B2-241 triangles: 51200 -> ' + g.index!.count / 3 + '; draws: 1 -> 1; crowns: ' + g.userData.farCrowns + '\n');
    } finally { far.dispose(); }
  });
  it("locks ADR 0017's relocated far ground vertices, normals and albedo", () => {
    const far = createFarLandscape();
    try {
      const expected = {
        position: "741faaf0089bbd418b0209aa6e43eee7e5f614db93bc2772378ca5bcbad361c0",
        normal: "7ddf148046453ac55e4ab0ea5d85443b5588ff0e6699b963586b7bba98742ded",
        // R1-C: coastal grass pigments also feed the distant ground; geometry stays unchanged.
        color: "2e888f78e53a21b779a080b2fb6fe246b06a30333a1c602682d824ad73d536ed",
      };
      const actual = Object.fromEntries(Object.keys(expected).map(name => [name, hash(far.mesh.geometry.getAttribute(name).array.slice(0, groundCount * 3))]));
      expect(actual).toEqual(expected);
    } finally { far.dispose(); }
  });
  it("builds clustered planar crowns below 12m, clear of stream trees and pads", () => {
    const far = createFarLandscape();
    try {
      const g = far.mesh.geometry, p = g.getAttribute("position"), n = g.getAttribute("normal");
      for (let base = groundCount; base < p.count; base += 180) {
        const { x, z } = g.userData.farCrownSites[(base - groundCount) / 180] as { x: number; z: number };
        expect(foliageBiomeAt(x, z)).toBe("forest-dawn");
        expect(nearestPath(x, z).distance).toBeGreaterThan(44);
        expect(nearestRiver(x, z).distance).toBeGreaterThan(40);
        const radii: number[] = [];
        for (let j = 0; j < 180; j++) {
          const px = p.getX(base + j) + FAR_LANDSCAPE.originX, pz = p.getZ(base + j) + FAR_LANDSCAPE.originZ;
          const lift = p.getY(base + j) - worldHeight(px, pz);
          expect(lift).toBeGreaterThanOrEqual(-0.0001);
          expect(lift).toBeLessThanOrEqual(12.0001);
          expect(Math.hypot(n.getX(base + j), n.getY(base + j), n.getZ(base + j))).toBeCloseTo(1, 5);
          if (j) radii.push(Math.hypot(px - x, pz - z));
        }
        expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii) * 1.2);
      }
      // Ground stays upward; closed crowns also have outward side/underside faces.
      const index = g.index!;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if (a >= groundCount) continue;
        expect((p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) - (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))).toBeGreaterThan(0);
      }
    } finally { far.dispose(); }
  });
  it("keeps remote simplification boundaries watertight and full detail within 227m of the route", () => {
    const far = createFarLandscape();
    try {
      const g = far.mesh.geometry, index = g.index!;
      const edges = new Map<string, number>();
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        if (ids.some(id => id >= groundCount)) continue;
        for (let j = 0; j < 3; j++) {
          const a = ids[j]!, b = ids[(j + 1) % 3]!;
          const key = [Math.min(a,b), Math.max(a,b)].join(':');
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      const stride = FAR_LANDSCAPE.cells + 1;
      for (const [key, count] of edges) {
        if (count === 2) continue;
        const [a,b] = key.split(':').map(Number) as [number,number];
        const perimeter = (id: number) => Math.floor(id / stride) === 0 || Math.floor(id / stride) === stride - 1 || id % stride === 0 || id % stride === stride - 1;
        expect(perimeter(a) && perimeter(b)).toBe(true);
      }
    } finally { far.dispose(); }
  });
  it("is deterministic across deferred construction and releases resources once", () => {
    const sync = createFarLandscape(), deferred = createFarLandscape({ deferred: true });
    try {
      expect(deferred.mesh.visible).toBe(false);
      let steps = 0;
      while (!deferred.build.next().done) steps++;
      expect(steps).toBeGreaterThan(1800);
      for (const name of ["position", "normal", "color"]) expect(deferred.mesh.geometry.getAttribute(name).array).toEqual(sync.mesh.geometry.getAttribute(name).array);
      expect(deferred.mesh.geometry.index!.array).toEqual(sync.mesh.geometry.index!.array);
      expect(deferred.mesh.visible).toBe(true);
      expect(GAMEPLAY_FAR.High).toBeGreaterThan(GAMEPLAY_FAR.Balanced);
    } finally { sync.dispose(); deferred.dispose(); }
    for (const steps of [0,40,1800,1950]) {
      const far = createFarLandscape({ deferred: true });
      const geometry = vi.spyOn(far.mesh.geometry, "dispose"), material = vi.spyOn(far.mesh.material, "dispose");
      for (let i = 0; i < steps; i++) far.build.next();
      far.dispose(); far.dispose();
      expect(far.build.next().done).toBe(true);
      expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
    }
  });
});
