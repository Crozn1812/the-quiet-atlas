import { expect, it, vi } from "vitest";
import { Color, InstancedMesh, Matrix4, Mesh, Vector3 } from "three";
import { createWaymarkLayout, createWaymarks } from "../../../src/features/world/waymarks";
import { PATH_CLEARANCE, ZONE_CLEARANCE } from "../../../src/features/world/foliage/scatter";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathLength } from "../../../src/features/world/layout/path";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { PALETTE } from "../../../src/features/world/art/palette";
import { placeDressing } from "../../../src/features/world/dressing";

it("places 2â€“4 dry, clear markers per blind span at 30â€“45 m route intervals", () => {
  const marks = createWaymarkLayout();
  for (const segment of [0, 1]) {
    const chain = marks.filter(mark => mark.segment === segment);
    expect(chain.length).toBeGreaterThanOrEqual(2); expect(chain.length).toBeLessThanOrEqual(4);
    chain.slice(1).forEach((mark, i) => {
      const distance = (mark.t - chain[i]!.t) * pathLength();
      expect(distance).toBeGreaterThanOrEqual(30); expect(distance).toBeLessThanOrEqual(45);
    });
  }
  marks.forEach(mark => {
    expect(mark.t).toBeGreaterThanOrEqual(mark.segment === 0 ? 0.356 : 0.5);
    // ADR 0017 retains 35 m gaps rather than the old normalized spans.
    expect(mark.t).toBeLessThanOrEqual(mark.segment === 0 ? 0.38 + 35 / pathLength() : 0.53 + 70 / pathLength());
    expect(nearestPath(mark.x, mark.z).distance - mark.width / 2).toBeGreaterThan(PATH_CLEARANCE);
    ZONES.forEach(zone => expect(Math.hypot(mark.x - zone.position.x, mark.z - zone.position.z))
      .toBeGreaterThan(zone.radius + ZONE_CLEARANCE + mark.width / 2));
    expect(mark.y).toBe(worldHeight(mark.x, mark.z));
    for (const dx of [-mark.width / 2, mark.width / 2]) for (const dz of [-mark.width / 2, mark.width / 2]) {
      expect(worldHeight(mark.x + dx, mark.z + dz)).toBeGreaterThan(waterLevelAt(mark.z + dz));
    }
    expect(mark.height).toBeGreaterThanOrEqual(mark.kind === "post" ? 1.2 : 0.8);
    expect(mark.height).toBeLessThanOrEqual(mark.kind === "post" ? 1.6 : 1.2);
  });
});

it("is deterministic, uses two instanced draws and at most 3000 triangles with palette pigments", () => {
  const start = performance.now(); const a = createWaymarks(); const elapsed = performance.now() - start;
  const b = createWaymarks();
  try {
    expect(a.layout).toEqual(b.layout);
    const meshes = a.group.children as InstancedMesh[];
    expect(meshes).toHaveLength(2);
    let triangles = 0;
    meshes.forEach((mesh, i) => {
      expect(mesh).toBeInstanceOf(InstancedMesh);
      triangles += mesh.geometry.getAttribute("position").count / 3 * mesh.count;
      expect(mesh.instanceMatrix.array).toEqual((b.group.children[i] as InstancedMesh).instanceMatrix.array);
      for (const name of ["position", "color"]) expect(mesh.geometry.getAttribute(name).array)
        .toEqual((b.group.children[i] as Mesh).geometry.getAttribute(name).array);
      expect(Array.isArray(mesh.material)).toBe(false);
      const colors = mesh.geometry.getAttribute("color");
      for (let j = 0; j < colors.count; j++) for (const value of [colors.getX(j), colors.getY(j), colors.getZ(j)]) {
        expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
      }
      // Geometry fits its collision box, including the small flower-coloured tie.
      for (let j = 0; j < mesh.count; j++) {
        const matrix = new Matrix4(); mesh.getMatrixAt(j, matrix);
        const mark = a.layout.filter(mark => mesh.name.endsWith(mark.kind))[j]!;
        const box = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        expect(box.min.x).toBeGreaterThanOrEqual(mark.x - mark.width / 2);
        expect(box.max.x).toBeLessThanOrEqual(mark.x + mark.width / 2);
        expect(box.min.y).toBeCloseTo(mark.y, 5); expect(box.max.y).toBeCloseTo(mark.y + mark.height, 5);
      }
    });
    const flower = new Color(PALETTE.flower).toArray();
    const colors = meshes[0]!.geometry.getAttribute("color");
    expect(Array.from({ length: colors.count }, (_, i) => [colors.getX(i), colors.getY(i), colors.getZ(i)])
      .some(rgb => rgb.every((v, i) => Math.abs(v - flower[i]!) < 1e-6))).toBe(true);
    expect(triangles).toBeLessThanOrEqual(3000);
    process.stdout.write(`B2-212: ${triangles} triangles, 2 draws; build ${elapsed.toFixed(2)} ms; variants ${meshes.map(m => m.geometry.getAttribute("position").count / 3).join("/")} triangles\n`);
  } finally { a.dispose(); b.dispose(); }
});

it("registers matching boxes in dressing and releases resources once", () => {
  const marks = createWaymarks(); const dressing = placeDressing();
  try {
    marks.colliders.forEach(collider => {
      const box = dressing.boxes.find(box => box.position.distanceTo(collider.center) < 1e-6);
      expect(box).toBeDefined();
      expect(new Vector3(box!.geometry.parameters.width, box!.geometry.parameters.height, box!.geometry.parameters.depth)).toEqual(collider.size);
    });
    expect(dressing.groups.some(group => group.getObjectByName("waymarks"))).toBe(true);
    const meshes = marks.group.children as InstancedMesh[];
    const releases = [...meshes.map(mesh => vi.spyOn(mesh.geometry, "dispose")), vi.spyOn(meshes[0]!.material as import("three").Material, "dispose")];
    marks.dispose(); marks.dispose(); releases.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  } finally { marks.dispose(); dressing.dispose(); }
});

it("keeps the High world snapshot increase below 25 percent", async () => {
  const { Scene } = await import("three");
  const { createWorldScene, surfaceHeight } = await import("../../../src/features/world/scene/compose");
  const { createMeshPhysics } = await import("../../../src/features/world/scene/mesh-physics");
  const { placeZoneScenes } = await import("../../../src/features/world/zones");
  const { createFarLandscape } = await import("../../../src/features/world/scene/far-landscape");
  const scene = new Scene();
  const dressing = placeDressing(); const zones = placeZoneScenes(surfaceHeight); const far = createFarLandscape();
  dressing.groups.forEach(group => scene.add(group)); zones.forEach(zone => scene.add(zone.group)); scene.add(far.mesh);
  const composed = createWorldScene({ ...createMeshPhysics(), scene, quality: "High" });
  try {
    let before = 0, added = 0;
    scene.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      const triangles = Math.min(object.geometry.drawRange.count, object.geometry.index?.count ?? object.geometry.getAttribute("position").count)
        / 3 * (object instanceof InstancedMesh ? object.count : 1);
      if (object.name.startsWith("waymark-")) added += triangles; else before += triangles;
    });
    expect(added).toBeGreaterThan(0); expect(added / before).toBeLessThanOrEqual(0.25);
    process.stdout.write(`B2-212 High spawn snapshot (composer, all zones, dressing, far landscape): ${before} -> ${before + added} triangles (+${(100 * added / before).toFixed(3)}%)\n`);
  } finally { composed.dispose(); dressing.dispose(); zones.forEach(zone => zone.dispose()); far.dispose(); }
}, 60_000);


