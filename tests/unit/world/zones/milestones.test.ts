import { BufferGeometry, Color, Mesh, MeshToonMaterial, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paletteColor, WORLD_DIRECTION } from "../../../../src/features/world/art/direction";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createMilestonesScene } from "../../../../src/features/world/zones/milestones";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

const scenes: ZoneScene[] = [];
const context = (overrides: Partial<ZoneSceneContext> = {}): ZoneSceneContext => ({
  seed: 104, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false,
  ...overrides,
});
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createMilestonesScene(context(overrides));
  scenes.push(scene);
  return scene;
}
function meshes(scene: ZoneScene) {
  const result: Mesh<BufferGeometry, MeshToonMaterial>[] = [];
  scene.group.traverse(object => {
    if (object instanceof Mesh) result.push(object as Mesh<BufferGeometry, MeshToonMaterial>);
  });
  return result;
}
function snapshot(scene: ZoneScene) {
  scene.group.updateMatrixWorld(true);
  return {
    colliders: scene.colliders,
    interactable: scene.interactable,
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, matrix: mesh.matrixWorld.toArray(), color: mesh.material.color.getHex(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups,
    })),
  };
}
afterEach(() => {
  scenes.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

describe("The Milestones hillside", () => {
  it.each([0, 1, 104, 65535])("seed %i: fits triangle, draw-call and full 3D radius budgets", seed => {
    const scene = create({ seed });
    let triangles = 0, drawCalls = 0;
    for (const mesh of meshes(scene)) {
      const geometry = mesh.geometry;
      triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      drawCalls += Math.max(1, geometry.groups.length);
      const vertices = geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const point = new Vector3().fromBufferAttribute(vertices, i);
        expect(point.toArray().every(Number.isFinite)).toBe(true);
        expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
    }
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBe(4);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    if (seed === 104) expect(triangles).toBe(570);
  });

  it("repeats all geometry, materials, colliders and target for the same seed", () => {
    const first = create(), second = create();
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(create({ seed: 105 }))).not.toEqual(snapshot(first));
  });

  it("has seven low stones in an arc, a larger middle stone, two fresh end slots and one pine", () => {
    const scene = create();
    expect(scene.zoneId).toBe("milestones");
    expect(scene.colliders).toHaveLength(8);
    const stones = scene.colliders.slice(0, 7);
    const middle = stones[3]!;
    expect(scene.interactable.position).toEqual(middle.center);
    for (const [index, stone] of stones.entries()) {
      expect(stone.size.y).toBeLessThan(1.5);
      expect(stone.center.z).toBeCloseTo((index - 3) * 1.85, 1);
      if (index !== 3) {
        expect(stone.center.x).toBeGreaterThan(middle.center.x);
        expect(stone.size.y).toBeLessThan(middle.size.y);
        expect(stone.size.z).toBeLessThan(middle.size.z);
      }
    }
    const byName = Object.fromEntries(meshes(scene).map(mesh => [mesh.name, mesh]));
    // Each slab is 44 triangles: five weathered, exactly two fresh and completely uninscribed.
    expect(byName["milestones-weathered"]!.geometry.getAttribute("position").count / 3).toBe(5 * 44);
    const future = byName["milestones-future"]!;
    expect(future.geometry.getAttribute("position").count / 3).toBe(2 * 44);
    const vertices = future.geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) expect(Math.abs(vertices.getZ(i))).toBeGreaterThan(4.7);
    expect(future.material.color.r).toBeGreaterThan(byName["milestones-weathered"]!.material.color.r);
    expect(byName["milestones-bark"]!.geometry.getAttribute("position").count / 3).toBe(42);
    expect(byName["milestones-needles"]).toBeDefined();
  });

  it.each([false, true])("keeps every visible vertex and collider clear of paths and water (wet bank: %s)", wet => {
    const ctx = context({ underWater: x => wet && x > 0 });
    const scene = create(ctx);
    for (const mesh of meshes(scene)) {
      const vertices = mesh.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), z = vertices.getZ(i);
        expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(ctx.onPath(x, z)).toBe(false);
        expect(ctx.underWater(x, z)).toBe(false);
      }
    }
    for (const box of scene.colliders) {
      expect(box.yaw ?? 0).toBe(0);
      expect(Math.abs(box.center.x) - box.size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
      expect(box.size.toArray().every(value => value > 0)).toBe(true);
      for (let ix = 0; ix <= 10; ix++) {
        for (let iz = 0; iz <= 10; iz++) {
          const x = box.center.x + box.size.x * (ix / 10 - 0.5);
          const z = box.center.z + box.size.z * (iz / 10 - 0.5);
          expect(ctx.onPath(x, z)).toBe(false);
          expect(ctx.underWater(x, z)).toBe(false);
        }
      }
    }
    if (wet) expect(scene.interactable.position.x).toBeLessThan(0);
  });

  it("honours an extra path branch and tests water inside footprints, away from centres", () => {
    const branch = create({ onPath: (x, z) => Math.abs(x) <= 2.6 || (x > 4 && Math.abs(z) < 1) });
    expect(branch.interactable.position.x).toBeLessThan(0);
    const puddle = create({ underWater: (x, z) => x > 4.48 && x < 4.53 && Math.abs(z) < 0.9 });
    expect(puddle.interactable.position.x).toBeLessThan(0);
    const floodedCentre = create({ underWater: (_x, z) => Math.abs(z) < 6.5 });
    expect(floodedCentre.interactable.position.z).toBeCloseTo(-16, 1);
  });

  it("grounds slab and trunk feet on a slope without submerged or floating base vertices", () => {
    const heightAt = (x: number, z: number) => 0.04 * x + 0.025 * z;
    const flat = create(), slope = create({ heightAt });
    const flatMeshes = meshes(flat), slopeMeshes = meshes(slope);
    for (const [index, mesh] of flatMeshes.entries()) {
      const a = mesh.geometry.getAttribute("position");
      const b = slopeMeshes[index]!.geometry.getAttribute("position");
      let feet = 0;
      for (let i = 0; i < a.count; i++) {
        const x = b.getX(i), z = b.getZ(i);
        expect(b.getY(i)).toBeCloseTo(a.getY(i) + heightAt(x, z), 5);
        expect(b.getY(i)).toBeGreaterThanOrEqual(heightAt(x, z) - 1e-6);
        if (Math.abs(a.getY(i)) < 1e-6) {
          expect(b.getY(i)).toBeCloseTo(heightAt(x, z), 5);
          feet++;
        }
      }
      if (mesh.name !== "milestones-needles") expect(feet).toBeGreaterThan(0);
    }
  });

  it("keeps the labelled middle stone 2–6 m from the corridor and within E range at its edge", () => {
    for (const scene of [create(), create({ underWater: x => x > 0 })]) {
      const point = scene.interactable.position;
      const fromEdge = Math.abs(point.x) - PATH_CLEARANCE;
      expect(fromEdge).toBeGreaterThanOrEqual(2);
      expect(fromEdge).toBeLessThanOrEqual(6);
      const standingAtEdge = new Vector3(Math.sign(point.x) * PATH_CLEARANCE, 0, point.z);
      expect(standingAtEdge.distanceTo(point)).toBeLessThanOrEqual(2.5);
      expect(scene.interactable.label).toEqual({ vi: "Những bia mốc", en: "Milestone stones" });
    }
  });

  it("uses only palette recipes, neutral vertex pigment and soft matte ramp materials", () => {
    const scene = create();
    const expected = [
      new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35).getHex(),
      new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.88).getHex(),
      paletteColor(WORLD_DIRECTION.foliage.trunk), paletteColor(WORLD_DIRECTION.foliage.crown),
    ];
    for (const mesh of meshes(scene)) {
      expect(mesh.name).not.toMatch(/text|logo/i);
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      expect(expected).toContain(mesh.material.color.getHex());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.gradientMap).not.toBeNull();
      expect(mesh.material).not.toHaveProperty("metalness");
      expect(mesh.material).not.toHaveProperty("specular");
      const colors = mesh.geometry.getAttribute("color");
      expect(colors.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.82);
        expect(colors.getX(i)).toBeLessThanOrEqual(1);
        expect(colors.getX(i)).toBe(colors.getY(i));
        expect(colors.getX(i)).toBe(colors.getZ(i));
      }
    }
  });

  it("leaves transforms and geometry still during updates, including reduced motion", () => {
    const scene = create();
    const before = snapshot(scene);
    for (const reducedMotion of [true, false, true]) {
      for (let i = 0; i < 60; i++) scene.update?.(1 / 30, reducedMotion);
      expect(snapshot(scene)).toEqual(before);
    }
  });

  it("disposes every owned merged geometry and material once, keeping shared ramps and siblings alive", () => {
    const scene = create(), sibling = create();
    const objects = meshes(scene);
    const geometrySpies = objects.map(mesh => vi.spyOn(mesh.geometry, "dispose"));
    const materialSpies = objects.map(mesh => vi.spyOn(mesh.material, "dispose"));
    const rampSpy = vi.spyOn(objects[0]!.material.gradientMap!, "dispose");
    const siblingSpies = meshes(sibling).map(mesh => vi.spyOn(mesh.geometry, "dispose"));
    scene.dispose();
    scene.dispose();
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(scene.group.children).toHaveLength(0);
  });

  it("releases construction geometries when no dry hillside can hold the complete scene", () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => create({ underWater: () => true })).toThrow(RangeError);
    expect(dispose.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(() => create({ onPath: () => true })).toThrow(RangeError);
  });
});
