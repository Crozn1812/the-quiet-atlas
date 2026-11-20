import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFarLandscape, FAR_LANDSCAPE, GAMEPLAY_FAR } from "../../../src/features/world/scene/far-landscape";
import { farHeight, farNoise } from "../../../src/features/world/scene/far-relief";
import { surfaceHeight, worldHeight } from "../../../src/features/world/terrain/height";
import { TERRAIN_RADIUS } from "../../../src/features/world/terrain/tiles";
import { ZONES } from "../../../src/features/world/layout/zones";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import type { FarForestSite } from "../../../src/features/world/scene/far-forest";
const groundCount = (FAR_LANDSCAPE.cells + 1) ** 2;
describe("HR-FAR continuous landscape", () => {
  let shared: ReturnType<typeof createFarLandscape>;
  beforeAll(() => { shared = createFarLandscape(); }, 60000);
  afterAll(() => shared.dispose());
  it("keeps the connected 4 m grid without remote triangle fans and preserves the 16 m Low index", () => {
    const g = shared.mesh.geometry, p = g.getAttribute("position"), index = g.index!;
    expect(p.count).toBe(groundCount);
    expect(FAR_LANDSCAPE.size / FAR_LANDSCAPE.cells).toBeLessThanOrEqual(4);
    expect(g.drawRange.count / 3).toBe(FAR_LANDSCAPE.cells ** 2 * 2);
    expect(g.userData.lowTriangles).toBe(FAR_LANDSCAPE.cells ** 2 / 8);
    const stride = FAR_LANDSCAPE.cells + 1;
    let invalid = 0;
    for (let i = 0; i < g.drawRange.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (Math.max(...ids) - Math.min(...ids) > stride + 1) invalid++;
    }
    expect(invalid).toBe(0);
    expect(shared.mesh.castShadow || shared.mesh.receiveShadow).toBe(false);
    const hits: unknown[] = [];
    shared.mesh.raycast({} as never, hits as never); expect(hits).toHaveLength(0);
    console.log(`HR-FAR terrain triangles: 42872 -> High ${g.drawRange.count / 3} / Low ${g.userData.lowTriangles}; terrain draws: 1 -> 1`);
  });
  it("switches quality in memory without loading an atlas on Low", () => {
    const renderer = { domElement: { closest: () => ({ dataset: { worldQuality: "low" } }) } };
    shared.mesh.onBeforeRender(renderer as never, {} as never, {} as never, shared.mesh.geometry, shared.mesh.material, null as never);
    expect(shared.mesh.geometry.drawRange.count / 3).toBe(FAR_LANDSCAPE.cells ** 2 / 8);
    expect(shared.mesh.children[0]!.visible).toBe(false);
    // Both materials must occupy the same queue: Three chooses the queue
    // before onBeforeRender switches the material on a quality transition.
    expect(shared.mesh.material.transparent).toBe(true);
    expect(shared.mesh.material.depthWrite).toBe(false);
    renderer.domElement.closest = () => ({ dataset: { worldQuality: "high" } });
    shared.mesh.onBeforeRender(renderer as never, {} as never, {} as never, shared.mesh.geometry, shared.mesh.material, null as never);
    expect(shared.mesh.geometry.drawRange.count / 3).toBe(FAR_LANDSCAPE.cells ** 2 * 2);
    expect(shared.mesh.children[0]!.visible).toBe(true);
    expect(shared.mesh.material.transparent).toBe(true);
    expect(shared.mesh.material.depthWrite).toBe(true);
    expect(shared.mesh.renderOrder).toBeGreaterThan(0); // After the depth-writing sea.
    expect(shared.mesh.renderOrder).toBeLessThan(2); // Before foreground surf/rays.
  });
  it("uses the cheap draw and shader on software even when overall quality is High", () => {
    const far = createFarLandscape();
    const renderer = {
      domElement: { closest: () => ({ dataset: { worldQuality: "high" } }) },
      getContext: () => ({ RENDERER: 1, getExtension: () => null, getParameter: () => "ANGLE SwiftShader Device" }),
    };
    try {
      far.mesh.onBeforeRender(renderer as never, {} as never, {} as never, far.mesh.geometry, far.mesh.material, null as never);
      expect(far.mesh.geometry.drawRange.count / 3).toBe(32768);
      expect(far.mesh.material.type).toBe("MeshBasicMaterial");
      expect(far.mesh.children[0]!.visible).toBe(false);
    } finally { far.dispose(); }
  });
  it("returns smoothly from the corridor depression to the Old Trail shoulder without a diagonal wall", () => {
    const p = shared.mesh.geometry.getAttribute("position"), step = FAR_LANDSCAPE.size / FAR_LANDSCAPE.cells;
    const stride = FAR_LANDSCAPE.cells + 1;
    const height = (x: number, z: number) => p.getY(Math.round((x - FAR_LANDSCAPE.originX) / step) * stride
      + Math.round((z - FAR_LANDSCAPE.originZ) / step));
    // Exact shoulder behind the right-hand trees in the audit overview. The
    // former seating cutoff dropped 18.7 m between x=-76 and x=-72, z=-404.
    for (let x = -108; x <= -64; x += step) for (let z = -416; z <= -376; z += step) {
      for (const [dx, dz] of [[step, 0], [0, step]]) {
        expect(Math.abs(height(x + dx!, z + dz!) - height(x, z)) / step, `${x},${z}`).toBeLessThan(2);
      }
    }
  });
  it("bounds actual remote summit faces to at least 25 degrees from vertical", () => {
    const p = shared.mesh.geometry.getAttribute("position"), index = shared.mesh.geometry.index!;
    let steepest = 0, checked = 0;
    for (let i = 0; i < shared.mesh.geometry.drawRange.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if ([a, b, c].some(v => p.getX(v) + FAR_LANDSCAPE.originX > -192)) continue;
      const ux = p.getX(b) - p.getX(a), uy = p.getY(b) - p.getY(a), uz = p.getZ(b) - p.getZ(a);
      const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
      const rise = Math.hypot(uy * vz - uz * vy, ux * vy - uy * vx) / Math.abs(uz * vx - ux * vz);
      steepest = Math.max(steepest, rise); checked++;
    }
    expect(checked).toBeGreaterThan(10000);
    expect(steepest).toBeLessThanOrEqual(1 / Math.tan(25 * Math.PI / 180));
  });
  it("keeps every range and its connected foot inside the High far plane from all four review zones", () => {
    const bounds = shared.mesh.geometry.boundingBox!;
    for (const id of ["workshop", "old-trail", "horizon", "milestones"]) {
      const zone = ZONES.find(z => z.id === id)!;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const distance = Math.hypot(x + FAR_LANDSCAPE.originX - zone.position.x,
            y - FAR_LANDSCAPE.sink - zone.position.y - 24,
            z + FAR_LANDSCAPE.originZ - zone.position.z);
          expect(distance, `${id}: a clipped base can leave a detached summit`).toBeLessThan(GAMEPLAY_FAR.High);
        }
      }
    }
  });
  it.each(["workshop", "roots", "milestones"])("keeps every coarse ground face below the rendered %s corridor (FIX-PATCH)", id => {
    const far = shared;
    try {
      const zone = ZONES.find(zone => zone.id === id)!;
      const p = far.mesh.geometry.getAttribute("position"), index = far.mesh.geometry.index!;
      const step = FAR_LANDSCAPE.size / FAR_LANDSCAPE.cells;
      let checked = 0;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        if (ids.some(vertex => vertex >= groundCount)) continue;
        const vertices = ids.map(vertex => ({ x: p.getX(vertex) + FAR_LANDSCAPE.originX,
          y: p.getY(vertex) - FAR_LANDSCAPE.sink, z: p.getZ(vertex) + FAR_LANDSCAPE.originZ }));
        if (vertices.every(v => Math.hypot(v.x - zone.position.x, v.z - zone.position.z) > zone.radius + step * Math.SQRT2)) continue;
        for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12 - a; b++) {
          const weights = [a / 12, b / 12, 1 - (a + b) / 12];
          const x = vertices.reduce((sum, v, j) => sum + v.x * weights[j]!, 0);
          const z = vertices.reduce((sum, v, j) => sum + v.z * weights[j]!, 0);
          if (nearestPath(x, z).distance > TERRAIN_RADIUS) continue;
          const y = vertices.reduce((sum, v, j) => sum + v.y * weights[j]!, 0);
          expect(y, `${id}: ${x},${z}`).toBeLessThanOrEqual(surfaceHeight(x, z) - FAR_LANDSCAPE.sink + 0.0001);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
    } finally { /* Shared fixture disposed after all corridor checks. */ }
  });

  it("places varied HR hill groves outside entire path, interaction and turbine envelopes", () => {
    const sites = shared.mesh.geometry.userData.farForestSites as FarForestSite[];
    expect(sites.length).toBeGreaterThan(300);
    const horizon = ZONES.find(z => z.id === "horizon")!;
    const hills = sites.filter(s => Math.hypot(s.x - horizon.position.x, s.z - horizon.position.z) < 180);
    expect(hills.length).toBeGreaterThan(20);
    expect(new Set(hills.map(s => s.id)).size).toBe(3);
    expect(hills.some(s => s.height < 6)).toBe(true);
    for (const s of sites) {
      expect(nearestPath(s.x, s.z).distance).toBeGreaterThanOrEqual(48);
      expect(nearestPath(s.x, s.z).distance).toBeLessThanOrEqual(205);
      expect(s.height).toBeLessThanOrEqual(8);
      expect(nearestRiver(s.x, s.z).distance).toBeGreaterThanOrEqual(28);
      for (const zone of ZONES) expect(Math.hypot(s.x-zone.position.x,s.z-zone.position.z)).toBeGreaterThanOrEqual(zone.radius+18);
    }
    console.log("HR-FAR HR atlas sites:", sites.length, "Horizon groves:", hills.length);
  });
  it("seats mid crowns on the rendered terrain rather than floating over the FIX-PATCH depression", () => {
    const sites = shared.mesh.geometry.userData.farForestSites as FarForestSite[];
    const p = shared.mesh.geometry.getAttribute("position"), step = FAR_LANDSCAPE.size / FAR_LANDSCAPE.cells;
    const stride = FAR_LANDSCAPE.cells + 1;
    for (const site of sites) {
      const x = Math.floor((site.x - FAR_LANDSCAPE.originX) / step);
      const z = Math.floor((site.z - FAR_LANDSCAPE.originZ) / step);
      const a = x * stride + z;
      const corners = [p.getY(a), p.getY(a + 1), p.getY(a + stride), p.getY(a + stride + 1)];
      expect(site.y + 0.15).toBeGreaterThanOrEqual(Math.min(...corners) - 0.00001);
      expect(site.y + 0.15).toBeLessThanOrEqual(Math.max(...corners) + 0.00001);
    }
  });
  it("keeps the authored corridor and shoreline height, with bounded deterministic remote relief", () => {
    for (const zone of ZONES) expect(farHeight(zone.position.x, zone.position.z)).toBe(worldHeight(zone.position.x, zone.position.z));
    for (let x=-300; x<=300; x+=30) for (let z=-700; z<=100; z+=40) {
      expect(Math.abs(farHeight(x,z)-worldHeight(x,z))).toBeLessThan(320);
      expect(farHeight(x,z)).toBe(farHeight(x,z));
      expect(farNoise(x,z,38)).toBeGreaterThanOrEqual(0);
      expect(farNoise(x,z,38)).toBeLessThanOrEqual(1);
    }
    expect(GAMEPLAY_FAR.High).toBeGreaterThan(GAMEPLAY_FAR.Low);
  });
  it("matches deferred construction and releases partial and complete work once", () => {
    const far = createFarLandscape({ deferred: true });
    expect(far.mesh.visible).toBe(false);
    while (!far.build.next().done) { /* Drain construction independently. */ }
    for (const name of ["position","normal","color","farHorizon"]) expect(far.mesh.geometry.getAttribute(name).array).toEqual(shared.mesh.geometry.getAttribute(name).array);
    const dispose = vi.spyOn(far.mesh.geometry,"dispose");
    far.dispose(); far.dispose(); expect(dispose).toHaveBeenCalledOnce();
    for (const steps of [0,40,1800]) {
      const partial = createFarLandscape({ deferred:true });
      for (let i=0;i<steps;i++) partial.build.next();
      const release = vi.spyOn(partial.mesh.geometry,"dispose");
      partial.dispose(); partial.dispose(); expect(release).toHaveBeenCalledOnce();
      expect(partial.build.next().done).toBe(true);
    }
  },60000);
});
