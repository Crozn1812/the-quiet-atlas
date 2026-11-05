import { createHash } from "node:crypto";
import { Box3, Color, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createOldTrailScene } from "../../../../src/features/world/zones/old-trail";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const context: ZoneSceneContext = {
  seed: 105,
  heightAt: () => 0,
  onPath: x => Math.abs(x) <= 2.6,
  underWater: () => false,
};
const scenes: ZoneScene[] = [];
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createOldTrailScene({ ...context, ...overrides });
  scenes.push(scene);
  return scene;
}
function meshes(scene: ZoneScene): Mesh[] {
  const result: Mesh[] = [];
  scene.group.traverse(object => { if (object instanceof Mesh) result.push(object); });
  return result;
}
function vertices(scene: ZoneScene): Vector3[] {
  scene.group.updateMatrixWorld(true);
  return meshes(scene).flatMap(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    return Array.from({ length: positions.count }, (_, i) =>
      new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  });
}
function transforms(scene: ZoneScene) {
  const result: number[][] = [];
  scene.group.traverse(object => result.push([...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]));
  return result;
}
function snapshot(scene: ZoneScene) {
  scene.group.updateMatrixWorld(true);
  return {
    geometry: meshes(scene).map(mesh => ({
      name: mesh.name,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups,
      matrix: mesh.matrixWorld.toArray(),
      color: (mesh.material as MeshToonMaterial).color.getHex(),
    })),
    colliders: scene.colliders,
    interactable: scene.interactable,
  };
}

afterEach(() => {
  scenes.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
});

describe("old-trail scene", () => {
  it("exports the zone contract, a lantern marker with localized labels, and paired markers every 4 m", () => {
    const scene = create();
    expect(scene.zoneId).toBe("old-trail");
    expect(scene.group.name).toBe("old-trail");
    expect(scene.interactable.position.toArray()).toEqual([4.8, 1.25, 0]);
    expect(scene.interactable.label).toEqual({ vi: "Cột mốc đường cũ", en: "Old trail marker" });
    const markers = scene.colliders.filter(box => box.size.z < 0.45 && box.size.y > 0.8);
    expect(markers).toHaveLength(10);
    for (const side of [-1, 1]) {
      expect(markers.filter(box => Math.sign(box.center.x) === side).map(box => box.center.z).sort((a, b) => a - b))
        .toEqual([-8, -4, 0, 4, 8].map(z => expect.closeTo(z, 5)));
    }
    expect(scene.group.getObjectByName("storm-lantern-pivot")).toBeDefined();
    expect(scene.colliders.some(box => box.size.z > 3)).toBe(true);
  });

  it("stays within the real merged triangle/draw-call/radius budgets, including while swaying", () => {
    const scene = create();
    const all = meshes(scene);
    const triangles = all.reduce((total, mesh) => total + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = all.reduce((total, mesh) => total + (Array.isArray(mesh.material) ? mesh.geometry.groups.length : 1), 0);
    expect(triangles).toBe(3108);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBe(7);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    for (let i = 0; i < 20; i++) {
      scene.update?.(0.5, false);
      for (const point of vertices(scene)) expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    }
    expect(all.every(mesh => mesh.geometry.groups.length === 0)).toBe(true);
  });

  it("keeps all ten markers plain and capped, and enlarges the broken gate uniformly by 1.5", () => {
    const scene = create();
    const markers = scene.colliders.filter(box => box.size.z < 0.45 && box.size.y > 0.8);
    expect(markers).toHaveLength(10);
    for (const marker of markers) {
      // Includes the cap and seeded lean: a horizontal arm would exceed this width.
      expect(marker.size.x).toBeLessThan(0.42);
      expect(marker.size.z).toBeCloseTo(0.31, 5);
    }
    const gate = scene.colliders.find(box => box.size.z > 5)!;
    expect(gate).toBeDefined();
    expect(gate.size.z).toBeCloseTo((3.2 + 0.23) * 1.5, 5);
    expect(gate.size.y).toBeCloseTo(1.12 * 1.5, 5);
    expect(gate.center.x).toBeLessThan(-6);
  });

  it("adds exactly one outward-leaning jade pine with a grounded ink trunk at the edge", () => {
    const scene = create();
    const crowns = meshes(scene).filter(mesh => mesh.name === "leaning-pine-jade-crown");
    expect(crowns).toHaveLength(1);
    const bounds = new Box3().setFromObject(crowns[0]!);
    expect(bounds.max.x).toBeLessThan(-7);
    expect(bounds.max.y).toBeGreaterThan(5);
    const positions = crowns[0]!.geometry.getAttribute("position");
    const band = (top: boolean) => Array.from({ length: positions.count }, (_, i) => new Vector3().fromBufferAttribute(positions, i))
      .filter(point => top ? point.y > bounds.max.y - 0.5 : point.y < bounds.min.y + 0.5);
    const meanX = (points: Vector3[]) => points.reduce((sum, point) => sum + point.x, 0) / points.length;
    expect(meanX(band(true))).toBeLessThan(meanX(band(false)) - 0.3);
    const trunk = scene.group.getObjectByName("ink-marker-feet-and-pine-trunk") as Mesh;
    const feet = trunk.geometry.getAttribute("position");
    expect(Array.from({ length: feet.count }, (_, i) => new Vector3().fromBufferAttribute(feet, i))
      .some(point => point.x < -9 && point.y === 0)).toBe(true);
    expect(new Box3().setFromObject(create({ underWater: x => x < -7 }).group.getObjectByName("leaning-pine-jade-crown")!)
      .min.x).toBeGreaterThan(7);
    expect(create({ underWater: x => Math.abs(x) > 7 }).group.getObjectByName("leaning-pine-jade-crown")).toBeUndefined();
  });

  it("keeps the dark marker feet, trunk and lantern frame restrained and one 0.12 m flower accent", () => {
    const scene = create();
    const all = meshes(scene);
    const area = (mesh: Mesh) => {
      const positions = mesh.geometry.getAttribute("position");
      let sum = 0;
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        sum += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      return sum;
    };
    const inkArea = all.filter(mesh => ["ink-marker-feet-and-pine-trunk", "storm-lantern-frame"].includes(mesh.name))
      .reduce((sum, mesh) => sum + area(mesh), 0);
    const coverage = inkArea / all.reduce((sum, mesh) => sum + area(mesh), 0);
    expect(coverage).toBeGreaterThan(0.06);
    expect(coverage).toBeLessThan(0.18);
    const accents = all.filter(mesh => (mesh.material as MeshToonMaterial).color.getHex() === new Color(PALETTE.flower).getHex());
    expect(accents).toHaveLength(1);
    expect(accents[0]!.parent?.name).toBe("storm-lantern-pivot");
    expect(accents[0]!.geometry.boundingSphere!.radius * 2).toBeCloseTo(0.12, 5);
  });

  it.each([false, true])("keeps the interactable visible from the path edge, mirrored site: %s", (mirrored) => {
    const scene = create({ underWater: x => mirrored && x > 3 });
    scene.group.updateMatrixWorld(true);
    const target = scene.interactable.position.clone();
    const player = new Vector3(Math.sign(target.x) * PATH_CLEARANCE, target.y, target.z);
    const ray = new Raycaster(player, target.clone().sub(player).normalize(), 0, player.distanceTo(target));
    const hit = ray.intersectObjects(meshes(scene), false)[0];
    expect(hit?.object.name).toBe("weathered-trail-timber");
    expect(hit!.point.distanceTo(target)).toBeLessThan(0.2);
  });

  it("repeats all geometry, colors, placement, colliders and motion for the same seed", () => {
    const first = create(), second = create();
    expect(snapshot(first)).toEqual(snapshot(second));
    first.update?.(1.5, false);
    second.update?.(1.5, false);
    expect(transforms(first)).toEqual(transforms(second));
    expect(snapshot(create({ seed: 106 }))).not.toEqual(snapshot(create()));
  });

  it.each([
    { name: "flat", overrides: {} },
    { name: "sloping", overrides: { heightAt: (x: number, z: number) => x * 0.035 + z * 0.02 } },
    { name: "water at the preferred marker", overrides: { underWater: (x: number, z: number) => x > 4 && Math.abs(z) < 1 } },
    { name: "water at footprint edge", overrides: { underWater: (x: number, z: number) => x > 5.3 && Math.abs(z) < 1 } },
    { name: "path bend", overrides: { onPath: (x: number, z: number) => Math.abs(x) <= 2.6 || (x > 4 && z > -1 && z < 1) } },
    { name: "water at enlarged gate edge", overrides: { underWater: (x: number, z: number) => x < -6 && z > 4 } },
    { name: "water at preferred pine", overrides: { underWater: (x: number) => x < -7 } },
  ])("keeps every triangle and collider clear of corridor/water on $name terrain", ({ overrides }) => {
    const ctx = { ...context, ...overrides };
    const scene = create(overrides);
    for (let frame = 0; frame < 4; frame++) {
      scene.update?.(2, false);
      const points = vertices(scene);
      for (let i = 0; i < points.length; i += 3) {
        const a = points[i]!, b = points[i + 1]!, c = points[i + 2]!;
        for (const point of [a, b, c, a.clone().add(b).add(c).divideScalar(3)]) {
          expect(Math.abs(point.x)).toBeGreaterThan(PATH_CLEARANCE);
          expect(ctx.onPath(point.x, point.z)).toBe(false);
          expect(ctx.underWater(point.x, point.z)).toBe(false);
          expect(point.y).toBeGreaterThanOrEqual(ctx.heightAt(point.x, point.z) - 1e-6);
        }
        // All three vertices remain on the same side: no triangle spans the corridor.
        expect(Math.sign(a.x)).toBe(Math.sign(b.x));
        expect(Math.sign(a.x)).toBe(Math.sign(c.x));
      }
    }
    for (const collider of scene.colliders) {
      expect(collider.yaw ?? 0).toBe(0);
      expect(collider.size.toArray().every(value => value > 0)).toBe(true);
      expect(Math.abs(collider.center.x) - collider.size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
      for (let ix = 0; ix <= 8; ix++) {
        for (let iz = 0; iz <= 16; iz++) {
          const x = collider.center.x + (ix / 8 - 0.5) * collider.size.x;
          const z = collider.center.z + (iz / 16 - 0.5) * collider.size.z;
          expect(ctx.onPath(x, z)).toBe(false);
          expect(ctx.underWater(x, z)).toBe(false);
        }
      }
    }
    const target = scene.interactable.position;
    expect(Math.abs(target.x) - PATH_CLEARANCE).toBeGreaterThanOrEqual(2);
    expect(Math.abs(target.x) - PATH_CLEARANCE).toBeLessThanOrEqual(6);
    expect(ctx.onPath(target.x, target.z)).toBe(false);
    expect(ctx.underWater(target.x, target.z)).toBe(false);
  });

  it("grounds each timber foot with heightAt and keeps the marker reachable from the corridor edge", () => {
    const heightAt = (x: number, z: number) => x * 0.04 + z * 0.025;
    const scene = create({ heightAt });
    const feet = vertices(scene).filter(point => Math.abs(point.y - heightAt(point.x, point.z)) < 1e-6);
    expect(feet.length).toBeGreaterThan(100);
    for (const x of [-4.8, 4.8]) {
      for (const z of [-8, -4, 0, 4, 8]) {
        expect(feet.some(point => Math.hypot(point.x - x, point.z - z) < 0.2)).toBe(true);
      }
    }
    const target = scene.interactable.position;
    expect(target.y).toBe(heightAt(target.x, target.z) + 1.25);
    const player = new Vector3(PATH_CLEARANCE, heightAt(PATH_CLEARANCE, target.z) + 1.25, target.z);
    expect(target.distanceTo(player)).toBeLessThan(2.5);
  });

  it("uses only palette-derived matte materials, neutral vertex washes, and no text/logo meshes", () => {
    const expectedColors = [
      new Color(PALETTE.rockDark).lerp(new Color(PALETTE.forestDeep), 0.45).getHex(),
      new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.6).getHex(),
      new Color(PALETTE.forestLight).lerp(new Color(PALETTE.forestDeep), 0.15).getHex(),
      new Color(PALETTE.rockDark).lerp(new Color(PALETTE.forestDeep), 0.45).getHex(),
      new Color(PALETTE.rockDark).lerp(new Color(PALETTE.indigo), 0.3).getHex(),
      new Color(PALETTE.sunGold).lerp(new Color(PALETTE.dusk), 0.25).getHex(),
      new Color(PALETTE.flower).getHex(),
    ];
    const all = meshes(create());
    expect(all.map(mesh => (mesh.material as MeshToonMaterial).color.getHex())).toEqual(expectedColors);
    for (const mesh of all) {
      expect(mesh.name).not.toMatch(/text|logo/i);
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      const material = mesh.material as MeshToonMaterial;
      const paper = new Vector3(...new Color(PALETTE.paper).toArray());
      expect(new Vector3(...material.color.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(false);
      expect(material.gradientMap).toBeTruthy();
      expect(material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const colors = mesh.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.88 - 1e-6);
        expect(colors.getX(i)).toBeLessThanOrEqual(0.98 + 1e-6);
        expect(colors.getX(i)).toBe(colors.getY(i));
        expect(colors.getX(i)).toBe(colors.getZ(i));
        const pigment = material.color.clone().multiplyScalar(colors.getX(i));
        expect(new Vector3(...pigment.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
      }
    }
  });

  it("adds only 120 soft moss/fern triangles beside the tall marker", () => {
    const scene = create();
    const moss = scene.group.getObjectByName("moss-washes") as Mesh;
    const positions = moss.geometry.getAttribute("position");
    // Ten original marker patches and three gate patches each contain 20 triangles.
    const extra = positions.count / 3 - 13 * 20;
    expect(extra).toBe(120);
    expect(extra).toBeLessThanOrEqual(300);
    for (let i = 13 * 20 * 3; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i);
      expect(Math.hypot(p.x - scene.interactable.position.x, p.z - scene.interactable.position.z)).toBeLessThan(0.8);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(0.4 + 1e-6);
    }
    console.info(`Old Trail budget: 3108 triangles, ${meshes(scene).length} draw calls`);
  });

  it("has finite vertices, nondegenerate faces and outward flat normals", () => {
    for (const mesh of meshes(create())) {
      const positions = mesh.geometry.getAttribute("position"), normals = mesh.geometry.getAttribute("normal");
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        const normal = b.sub(a).cross(c.sub(a));
        expect(normal.length()).toBeGreaterThan(1e-8);
        expect(normal.normalize().dot(new Vector3().fromBufferAttribute(normals, i))).toBeGreaterThan(0.99999);
      }
    }
  });

  it("moves only the lantern slowly, freezes all transforms for reduced motion, and ignores invalid dt", () => {
    const scene = create(), still = transforms(scene);
    scene.update?.(100, true);
    expect(transforms(scene)).toEqual(still);
    scene.update?.(1, false);
    expect(transforms(scene)).not.toEqual(still);
    const frozen = transforms(scene);
    scene.update?.(30, true);
    scene.update?.(Number.NaN, false);
    scene.update?.(Infinity, false);
    scene.update?.(-1, false);
    expect(transforms(scene)).toEqual(frozen);
    for (const mesh of meshes(scene)) expect(mesh.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    const pivot = scene.group.getObjectByName("storm-lantern-pivot")!;
    const before = pivot.rotation.z;
    scene.update?.(1 / 60, false);
    expect(Math.abs(pivot.rotation.z)).toBeLessThanOrEqual(0.035);
    expect(Math.abs(pivot.rotation.z - before)).toBeLessThanOrEqual(0.035 * 0.65 / 60);
  });

  it("disposes every owned geometry/material once, detaches the group, and preserves the shared ramp", () => {
    const scene = create(), sibling = create();
    const parent = sibling.group;
    parent.add(scene.group);
    const all = meshes(scene);
    const geometrySpies = all.map(mesh => vi.spyOn(mesh.geometry, "dispose"));
    const materialSpies = all.map(mesh => vi.spyOn(mesh.material as MeshToonMaterial, "dispose"));
    const rampSpy = vi.spyOn((all[0]!.material as MeshToonMaterial).gradientMap!, "dispose");
    scene.dispose();
    scene.dispose();
    scene.update?.(1, false);
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(rampSpy).not.toHaveBeenCalled();
    expect(scene.group.children).toHaveLength(0);
    expect(scene.group.parent).toBeNull();
    expect(meshes(sibling)).toHaveLength(7);
  });

  it("rejects an entirely submerged or blocked site instead of placing a hard object unsafely", () => {
    expect(() => create({ underWater: () => true })).toThrow(RangeError);
    expect(() => create({ onPath: () => true })).toThrow(RangeError);
  });

  it("preserves all original triangles, transforms, colliders and interaction", () => {
    const scene = create();
    scene.group.updateMatrixWorld(true);
    const triangles: string[] = [];
    for (const mesh of meshes(scene)) {
      const positions = mesh.geometry.getAttribute("position");
      // Only the new soft detail triangles are excluded from the pre-ticket fingerprint.
      const added = mesh.name === "moss-washes" ? 120 * 3 : 0;
      for (let i = 0; i < positions.count - added; i += 3) {
        triangles.push([0, 1, 2].flatMap(offset => new Vector3().fromBufferAttribute(positions, i + offset)
          .applyMatrix4(mesh.matrixWorld).toArray().map(value => value.toFixed(5))).join(","));
      }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      triangles: triangles.sort(), colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex");
    // Re-baselined after B2-175 changed the shared pine crown (zone geometry otherwise untouched by B2-176).
    expect(fingerprint).toBe("9047f2fe3615c37710fc709b59af64e4bb144979600053fd5dc3c168080ca2cf");
  });

});
