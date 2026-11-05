import { Box3, BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
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
function named(scene: ZoneScene, surface: string) {
  return meshes(scene).find(mesh => mesh.name === `milestones-${surface}`)!;
}
function points(mesh: Mesh, start = 0, count = mesh.geometry.getAttribute("position").count - start) {
  const vertices = mesh.geometry.getAttribute("position");
  return Array.from({ length: count }, (_, i) => new Vector3().fromBufferAttribute(vertices, start + i));
}
function moundAt(scene: ZoneScene, x: number, z: number) {
  scene.group.updateMatrixWorld(true);
  return new Raycaster(new Vector3(x, 20, z), new Vector3(0, -1, 0))
    .intersectObject(named(scene, "mound"))[0]?.point.y ?? 0;
}
function rockPoints(scene: ZoneScene, index: number) {
  const surface = index < 7 ? "weathered" : "future";
  return [
    ...points(named(scene, "ink"), index * 48, 48),
    ...points(named(scene, surface), (index < 7 ? index : index - 7) * 84, 84),
  ];
}
function unique(points: Vector3[]) {
  return [...new Map(points.map(point => [point.toArray().map(n => n.toFixed(5)).join(","), point])).values()];
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
    expect(drawCalls).toBe(6);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    if (seed === 104) expect(triangles).toBe(1466);
  });

  it("repeats all geometry, materials, colliders and target for the same seed", () => {
    const first = create(), second = create();
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(create({ seed: 105 }))).not.toEqual(snapshot(first));
  });

  it.each([0, 1, 104, 65535])("seed %i: has six rough leaning rocks, a broad 2 m target and two detached low slots", seed => {
    const scene = create({ seed });
    expect(scene.zoneId).toBe("milestones");
    expect(scene.colliders).toHaveLength(10);
    const stones = scene.colliders.slice(0, 9);
    const middle = stones[0]!;
    expect(scene.interactable.position).toEqual(middle.center);
    for (const [index, stone] of stones.entries()) {
      const vertices = unique(rockPoints(scene, index));
      const local = vertices.map(point => new Vector3(point.x, point.y - moundAt(scene, point.x, point.z), point.z));
      const height = Math.max(...local.map(point => point.y));
      if (index === 0) expect(height).toBeCloseTo(2, 5);
      else if (index < 7) {
        expect(height).toBeGreaterThanOrEqual(0.9);
        expect(height).toBeLessThanOrEqual(1.6);
        expect(stone.center.x).toBeGreaterThan(middle.center.x);
        expect(stone.size.z).toBeLessThan(middle.size.z * 0.75);
      }
      if (index < 7) {
        const base = local.filter(point => Math.abs(point.y) < 1e-5);
        const shoulder = local.filter(point => Math.abs(point.y - height * 0.72) < 1e-5);
        expect(base).toHaveLength(6);
        expect(shoulder).toHaveLength(6);
        const mean = (ring: Vector3[]) => ring.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(ring.length);
        const axis = mean(shoulder).sub(mean(base));
        const degrees = Math.atan2(Math.hypot(axis.x, axis.z), axis.y) * 180 / Math.PI;
        expect(degrees).toBeGreaterThanOrEqual(3 - 1e-4);
        expect(degrees).toBeLessThanOrEqual(8 + 1e-4);
        // A fractured summit has several different heights rather than a rounded headstone profile.
        expect(new Set(local.filter(point => point.y > height * 0.8).map(point => point.y.toFixed(3))).size).toBeGreaterThan(3);
      } else {
        expect(stone.size.y).toBeLessThan(0.6);
        expect(Math.abs(stone.center.z)).toBeGreaterThan(6.5);
        const topY = Math.max(...vertices.map(point => point.y));
        const top = vertices.filter(point => Math.abs(point.y - topY) < 1e-5);
        expect(top).toHaveLength(6);
        expect(Math.max(...top.map(point => point.y)) - Math.min(...top.map(point => point.y))).toBeLessThan(1e-5);
        for (const companion of stones.slice(0, 7)) expect(stone.center.distanceTo(companion.center)).toBeGreaterThan(2);
      }
    }
    const orderedZ = stones.slice(1, 7).map(stone => stone.center.z).sort((a, b) => a - b);
    const gaps = orderedZ.slice(1).map((z, i) => z - orderedZ[i]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.8);
    expect(named(scene, "future").material.color.r).toBeGreaterThan(named(scene, "weathered").material.color.r);
  });

  it.each([false, true])("has a soft 0.8 m mound outside the corridor and a clear view from the road (mirrored: %s)", wet => {
    const scene = create({ underWater: x => wet && x > 0 });
    const mound = named(scene, "mound"), vertices = points(mound);
    expect(Math.max(...vertices.map(point => point.y))).toBeCloseTo(0.8, 5);
    for (let i = 0; i < vertices.length; i += 3) {
      const [a, b, c] = vertices.slice(i, i + 3) as [Vector3, Vector3, Vector3];
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      expect(normal.y).toBeGreaterThan(0);
      expect(Math.hypot(normal.x, normal.z) / normal.y).toBeLessThan(0.3);
    }
    for (const point of vertices) {
      if (Math.abs(point.x - 3 * (wet ? -1 : 1)) < 1e-5 || Math.abs(point.z) === 9) expect(point.y).toBeCloseTo(0, 5);
    }
    for (let i = 0; i < 9; i++) {
      const grounded = rockPoints(scene, i).filter(point => Math.abs(point.y - moundAt(scene, point.x, point.z)) < 1e-5);
      expect(unique(grounded)).toHaveLength(6);
    }
    const pine = points(named(scene, "needles"));
    const outerRockEdge = Math.max(...scene.colliders.slice(0, 9).map(box => Math.abs(box.center.x) + box.size.x / 2));
    expect(Math.min(...pine.map(point => Math.abs(point.x)))).toBeGreaterThan(outerRockEdge);
    const target = scene.interactable.position;
    // Rays from several eye positions across the road must hit the target before any other mesh.
    scene.group.updateMatrixWorld(true);
    for (const dz of [-1.5, 0, 1.5]) {
      const eye = new Vector3(Math.sign(target.x) * PATH_CLEARANCE, 1.5, target.z + dz);
      const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
      const hit = ray.intersectObjects(scene.group.children)[0];
      expect(hit?.object.name).toBe("milestones-weathered");
      expect(hit!.point.distanceTo(target)).toBeLessThan(1.2);
    }
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

  it("drapes the mound, rocks and trunk over a slope without submerged base vertices", () => {
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
      if (["milestones-mound", "milestones-ink"].includes(mesh.name)) expect(feet).toBeGreaterThan(0);
    }
  });

  it("keeps the labelled middle stone 2–6 m from the corridor and within E range at its edge", () => {
    for (const seed of [0, 1, 104, 65535]) {
      for (const wet of [false, true]) {
        const scene = create({ seed, underWater: x => wet && x > 0 });
        const point = scene.interactable.position;
        const fromEdge = Math.abs(point.x) - PATH_CLEARANCE;
        expect(fromEdge).toBeGreaterThanOrEqual(2);
        expect(fromEdge).toBeLessThanOrEqual(6);
        const standingAtEdge = new Vector3(Math.sign(point.x) * PATH_CLEARANCE, 0, point.z);
        expect(standingAtEdge.distanceTo(point)).toBeLessThanOrEqual(2.5);
        expect(scene.interactable.label).toEqual({ vi: "Cụm đá dấu mốc", en: "Milestone rocks" });
      }
    }
  });

  it("uses only palette recipes, neutral vertex pigment and soft matte ramp materials", () => {
    const scene = create();
    const expected = [
      new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35).getHex(),
      new Color(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.88).getHex(),
      new Color(PALETTE.ink).lerp(new Color(PALETTE.forestDeep), 0.3).getHex(),
      paletteColor(WORLD_DIRECTION.foliage.crown),
      new Color(PALETTE.forestLight).lerp(new Color(PALETTE.paper), 0.35).getHex(),
      new Color(PALETTE.flower).getHex(),
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

  it("anchors silhouettes with ink feet and trunk, with only two 0.13 m flower accents", () => {
    const scene = create();
    expect(named(scene, "ink").geometry.getAttribute("position").count / 3).toBe(9 * 16 + 42);
    const flowers = named(scene, "flower");
    expect(flowers.material.color.getHex()).toBe(new Color(PALETTE.flower).getHex());
    expect(points(flowers)).toHaveLength(2 * 60);
    for (let i = 0; i < 2; i++) {
      const bounds = new Box3().setFromPoints(points(flowers, i * 60, 60));
      const size = bounds.getSize(new Vector3());
      expect(size.x).toBeGreaterThanOrEqual(0.1);
      expect(size.x).toBeLessThanOrEqual(0.15);
      expect(size.z).toBeGreaterThanOrEqual(0.1);
      expect(size.z).toBeLessThanOrEqual(0.15);
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
