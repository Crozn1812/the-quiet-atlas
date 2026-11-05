import { Box3, Color, Group, Light, Mesh, MeshToonMaterial, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createLastPostcardScene } from "../../../../src/features/world/zones/last-postcard";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const flat: ZoneSceneContext = {
  seed: 108,
  heightAt: () => 0,
  onPath: x => Math.abs(x) <= 2.6,
  underWater: () => false,
};
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const context = { ...flat, ...overrides };
  const scene = createLastPostcardScene(context);
  owned.push(scene);
  return { scene, context };
}
afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

function meshes(group: Group): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}

function transforms(group: Group) {
  const result: unknown[] = [];
  group.traverse(node => result.push({
    name: node.name, position: node.position.toArray(), rotation: node.quaternion.toArray(), scale: node.scale.toArray(),
  }));
  return result;
}

function signature(scene: ZoneScene) {
  return {
    zone: scene.zoneId, transforms: transforms(scene.group),
    interaction: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene.group).map(mesh => ({
      name: mesh.name, color: mesh.material.color.toArray(),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
        .map(([key, value]) => [key, Array.from(value.array)])),
      groups: mesh.geometry.groups, bounds: mesh.geometry.boundingBox, sphere: mesh.geometry.boundingSphere,
    })),
  };
}

function vertices(scene: ZoneScene): Vector3[] {
  scene.group.updateMatrixWorld(true);
  return meshes(scene.group).flatMap(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    return Array.from({ length: positions.count }, (_, i) => new Vector3()
      .fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  });
}

/** Include collider interiors so a shoreline/path cutting through a box cannot pass on corner checks alone. */
function expectSafe(scene: ZoneScene, context: ZoneSceneContext) {
  const boxes = scene.colliders.map(collider => new Box3().setFromCenterAndSize(collider.center, collider.size));
  expect(boxes).toHaveLength(3);
  for (const point of vertices(scene)) {
    expect(Math.abs(point.x)).toBeGreaterThan(PATH_CLEARANCE);
    expect(context.onPath(point.x, point.z)).toBe(false);
    expect(context.underWater(point.x, point.z)).toBe(false);
    expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    expect(boxes.some(box => box.clone().expandByScalar(1e-5).containsPoint(point))).toBe(true);
    expect(point.y).toBeGreaterThanOrEqual(context.heightAt(point.x, point.z) - 1e-5);
  }
  for (const collider of scene.colliders) {
    expect(collider.yaw ?? 0).toBe(0);
    expect(collider.size.toArray().every(value => value > 0 && Number.isFinite(value))).toBe(true);
    const box = new Box3().setFromCenterAndSize(collider.center, collider.size);
    for (let ix = 0; ix <= 12; ix++) {
      for (let iz = 0; iz <= 12; iz++) {
        const x = box.min.x + (box.max.x - box.min.x) * ix / 12;
        const z = box.min.z + (box.max.z - box.min.z) * iz / 12;
        expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(context.onPath(x, z)).toBe(false);
        expect(context.underWater(x, z)).toBe(false);
      }
    }
  }
  const { x, y, z } = scene.interactable.position;
  const distanceFromCorridor = Math.abs(x) - PATH_CLEARANCE;
  expect(distanceFromCorridor).toBeGreaterThanOrEqual(2);
  expect(distanceFromCorridor).toBeLessThanOrEqual(6);
  expect(context.underWater(x, z)).toBe(false);
  // A player at the nearby path edge can reach the mailbox centre within E's 2.5 m range.
  const player = new Vector3(Math.sign(x) * PATH_CLEARANCE, context.heightAt(Math.sign(x) * PATH_CLEARANCE, z) + 1.55, z);
  expect(player.distanceTo(scene.interactable.position)).toBeLessThanOrEqual(2.5);
  expect(y).toBeCloseTo(context.heightAt(x, z) + 1.55, 6);
}

describe("last-postcard shore scene", () => {
  it("exports the contact zone with the mailbox's EN/VI labels", () => {
    const { scene } = create();
    expect(scene.zoneId).toBe("last-postcard");
    expect(scene.group).toBeInstanceOf(Group);
    expect(scene.group.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.interactable.position.toArray()).toEqual([4.75, 1.55, 0]);
    expect(scene.interactable.label).toEqual({ en: "The last mailbox", vi: "Hộp thư cuối đường" });
  });

  it("merges by material within the triangle/draw-call budgets, with finite nondegenerate faces", () => {
    const { scene } = create();
    let triangles = 0, drawCalls = 0;
    for (const mesh of meshes(scene.group)) {
      const geometry = mesh.geometry, positions = geometry.getAttribute("position");
      const count = geometry.index?.count ?? positions.count;
      triangles += count / 3;
      drawCalls += Math.max(1, geometry.groups.length);
      expect(Array.isArray(mesh.material)).toBe(false);
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      for (const name of ["position", "normal", "color"]) {
        const attribute = geometry.getAttribute(name);
        expect(attribute.count).toBe(positions.count);
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      for (let i = 0; i < count; i += 3) {
        const points = [0, 1, 2].map(offset => new Vector3()
          .fromBufferAttribute(positions, geometry.index?.getX(i + offset) ?? i + offset));
        expect(points[1]!.sub(points[0]!).cross(points[2]!.sub(points[0]!)).length()).toBeGreaterThan(1e-9);
      }
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(meshes(scene.group).map(mesh => mesh.material)).size).toBe(drawCalls);
    console.info(`last-postcard: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("is deterministic across interleaved builds, including fallback placement and seed washes", () => {
    const context = { seed: 9301, underWater: (x: number) => x > 4.9 };
    const first = create(context).scene;
    create({ seed: 99 });
    const second = create(context).scene;
    expect(signature(second)).toEqual(signature(first));
    const changedSeed = create({ ...context, seed: 9302 }).scene;
    expect(changedSeed.interactable).toEqual(first.interactable);
    expect(meshes(changedSeed.group)[0]!.geometry.getAttribute("color").array)
      .not.toEqual(meshes(first.group)[0]!.geometry.getAttribute("color").array);
  });

  const terrains: { name: string; context: Partial<ZoneSceneContext> }[] = [
    { name: "flat dry bank", context: {} },
    { name: "gentle slope", context: { heightAt: (x, z) => x * 0.04 - z * 0.02 } },
    { name: "sea cutting through the right footprint", context: { underWater: x => x > 4.9 } },
    { name: "sea on the left", context: { underWater: x => x < -4.9 } },
    { name: "wet outer edge away from all prop centres", context: { underWater: x => x > 6.1 } },
    { name: "curved path crossing the rack footprint", context: { onPath: (x, z) => Math.abs(x) <= 2.6 || (x > 4 && z > 1.5) } },
    { name: "wet banks requiring a shift along the path", context: { underWater: (_x, z) => Math.abs(z) < 3 } },
  ];
  for (const { name, context: overrides } of terrains) {
    it(`keeps geometry and full collider footprints dry, grounded and outside the path: ${name}`, () => {
      const { scene, context } = create(overrides);
      expectSafe(scene, context);
      for (let i = 0; i < 80; i++) scene.update?.(0.1, false);
      expectSafe(scene, context);
      // Each support has actual terrain-contact vertices, even on sloping terrain.
      const points = vertices(scene);
      for (const collider of scene.colliders) {
        expect(points.some(point => Math.hypot(point.x - collider.center.x, point.z - collider.center.z) < 0.65
          && Math.abs(point.y - context.heightAt(point.x, point.z)) < 1e-5)).toBe(true);
      }
    });
  }

  it("rejects an entirely flooded or obstructed bank before allocating GPU resources", () => {
    const materialDispose = vi.spyOn(MeshToonMaterial.prototype, "dispose");
    expect(() => createLastPostcardScene({ ...flat, underWater: () => true })).toThrow(RangeError);
    expect(() => createLastPostcardScene({ ...flat, onPath: () => true })).toThrow(RangeError);
    expect(() => createLastPostcardScene({ ...flat, heightAt: () => Number.NaN })).toThrow(RangeError);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it("uses only palette pigments, neutral multiplicative washes, and a painted dusk lantern", () => {
    const { scene } = create();
    const wood = new Color(PALETTE.ink).lerp(new Color(PALETTE.dusk), 0.38).lerp(new Color(PALETTE.paper), 0.12);
    const recipes: Record<string, Color> = Object.fromEntries(Object.entries(PALETTE).map(([key, value]) => [key, new Color(value)]));
    recipes.wood = new Color(wood.getHex());
    recipes.ink = new Color(PALETTE.ink).lerp(new Color(PALETTE.paper), 0.12);
    scene.group.traverse(node => {
      expect(node).not.toBeInstanceOf(Light);
      expect(node.name).not.toMatch(/text|logo/i);
    });
    for (const mesh of meshes(scene.group)) {
      const surface = mesh.name.replace("last-postcard-", "");
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      expect(mesh.material.color.toArray()).toEqual(recipes[surface]!.toArray());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.emissive.getHex()).toBe(0);
      expect(mesh.material.map).toBeNull();
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const colors = mesh.geometry.getAttribute("color");
      const shades = new Set<number>();
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.9199);
        expect(colors.getX(i)).toBeLessThanOrEqual(1.0001);
        expect(colors.getY(i)).toBe(colors.getX(i));
        expect(colors.getZ(i)).toBe(colors.getX(i));
        shades.add(colors.getX(i));
      }
      expect(shades.size).toBeGreaterThan(3);
    }
    const accent = meshes(scene.group).find(mesh => mesh.name.endsWith("vermilion"))!;
    const box = accent.geometry.boundingBox!;
    expect(box.getSize(new Vector3()).length()).toBeLessThan(0.2);
    for (const pigment of ["forestDeep", "forestLight", "water"]) {
      expect(meshes(scene.group).some(mesh => mesh.name.endsWith(pigment))).toBe(true);
    }
  });

  it("keeps reduced-motion transforms unchanged, even after motion has already started", () => {
    const { scene } = create();
    const initial = transforms(scene.group);
    scene.update?.(10, true);
    expect(transforms(scene.group)).toEqual(initial);
    for (let i = 0; i < 100; i++) scene.update?.(0.1, false);
    expect(transforms(scene.group)).not.toEqual(initial);
    const before = transforms(scene.group);
    for (let i = 0; i < 100; i++) scene.update?.(0.1, true);
    expect(transforms(scene.group)).toEqual(before);
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) scene.update?.(dt, false);
    expect(transforms(scene.group)).toEqual(before);
    const lantern = scene.group.getObjectByName("shore-lantern")!;
    expect(Math.abs(lantern.rotation.z)).toBeLessThanOrEqual(0.018);
    expect(Math.abs(lantern.rotation.x)).toBeLessThanOrEqual(0.012);
    expect(scene.group.children.filter(node => node instanceof Group)).toEqual([lantern]);
  });

  it("disposes owned geometries/materials once while preserving siblings and the cached ramp", () => {
    const { scene } = create(), sibling = create().scene;
    const parent = new Group();
    parent.add(scene.group);
    const resources = meshes(scene.group).flatMap(mesh => [mesh.geometry, mesh.material]);
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    const siblingResources = meshes(sibling.group).flatMap(mesh => [mesh.geometry, mesh.material]);
    const siblingSpies = siblingResources.map(resource => vi.spyOn(resource, "dispose"));
    for (const resource of siblingResources) expect(resources).not.toContain(resource);
    const ramp = meshes(scene.group)[0]!.material.gradientMap!;
    const rampSpy = vi.spyOn(ramp, "dispose");
    const before = transforms(scene.group);
    scene.dispose();
    scene.dispose();
    scene.update?.(1, false);
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(scene.group.parent).toBeNull();
    expect(transforms(scene.group)).toEqual(before);
    sibling.dispose();
    disposeRampGradients();
    expect(rampSpy).toHaveBeenCalledTimes(1);
  });
});
