import { Box3, Color, Mesh, MeshToonMaterial, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paletteColor, WORLD_DIRECTION } from "../../../../src/features/world/art/direction";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createFirstLightScene } from "../../../../src/features/world/zones/first-light";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

const scenes: ZoneScene[] = [];
const context = (overrides: Partial<ZoneSceneContext> = {}): ZoneSceneContext => ({
  seed: 101, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false,
  ...overrides,
});
const create = (ctx = context()) => {
  const scene = createFirstLightScene(ctx);
  scenes.push(scene);
  return scene;
};
const meshes = (scene: ZoneScene) => scene.group.children as Mesh<BufferGeometry, MeshToonMaterial>[];
const triangles = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
const tint = (base: "mist" | "dusk", amount: number) => paletteColor({
  base, mix: "paper", amount, saturation: 1, brightness: 1,
});

afterEach(() => {
  scenes.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
});

function checkPlacement(scene: ZoneScene, ctx: ZoneSceneContext) {
  for (const mesh of meshes(scene)) {
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      expect([x, y, z].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      expect(Math.hypot(x, z)).toBeGreaterThan(3);
      expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
      expect(ctx.onPath(x, z)).toBe(false);
      expect(ctx.underWater(x, z)).toBe(false);
      expect(y).toBeGreaterThanOrEqual(ctx.heightAt(x, z) - 1e-5);
    }
    // Triangle interiors also stay clear: vertices alone would miss a face bridging the path.
    for (let i = 0; i < positions.count; i += 3) {
      const xs = [0, 1, 2].map(offset => positions.getX(i + offset));
      expect(xs.every(x => x > PATH_CLEARANCE) || xs.every(x => x < -PATH_CLEARANCE)).toBe(true);
      for (let u = 0; u <= 4; u++) {
        for (let v = 0; v <= 4 - u; v++) {
          const weights = [u / 4, v / 4, 1 - (u + v) / 4];
          const x = weights.reduce((sum, weight, offset) => sum + weight * positions.getX(i + offset), 0);
          const z = weights.reduce((sum, weight, offset) => sum + weight * positions.getZ(i + offset), 0);
          expect(ctx.onPath(x, z)).toBe(false);
          expect(ctx.underWater(x, z)).toBe(false);
        }
      }
    }
  }
  for (const collider of scene.colliders) {
    const { center, size } = collider;
    expect(collider.yaw ?? 0).toBe(0);
    expect(size.toArray().every(value => value > 0 && Number.isFinite(value))).toBe(true);
    expect(Math.abs(center.x) - size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
    for (let ix = 0; ix <= 10; ix++) {
      for (let iz = 0; iz <= 10; iz++) {
        const x = center.x + size.x * (ix / 10 - 0.5);
        const z = center.z + size.z * (iz / 10 - 0.5);
        expect(ctx.onPath(x, z)).toBe(false);
        expect(ctx.underWater(x, z)).toBe(false);
      }
    }
  }
}

describe("First Light pine clearing", () => {
  it.each([0, 1, 2, 101, 0xffffffff])("seed %i: merges by material within triangle, draw-call and radius budgets", seed => {
    const scene = create(context({ seed }));
    expect(scene.zoneId).toBe("first-light");
    const objects = meshes(scene);
    const count = objects.reduce((sum, mesh) => sum + triangles(mesh.geometry), 0);
    expect(count).toBeGreaterThan(1000);
    expect(count).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(objects).toHaveLength(5);
    expect(objects.length).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(objects.map(mesh => mesh.material)).size).toBe(objects.length);
    for (const mesh of objects) {
      expect(mesh).toBeInstanceOf(Mesh);
      expect(mesh.geometry.groups).toHaveLength(0);
      expect(mesh.children).toHaveLength(0);
      expect(mesh.name).not.toMatch(/text|logo/i);
      const bounds = mesh.geometry.boundingBox!;
      const furthestCorner = new Vector3(
        Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
        Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
        Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
      );
      expect(furthestCorner.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      for (let i = 0; i < positions.count; i += 3) {
        a.fromBufferAttribute(positions, i);
        b.fromBufferAttribute(positions, i + 1);
        c.fromBufferAttribute(positions, i + 2);
        expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-9);
      }
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
    }
    // Full path/water sampling is independent of seed; other cases exercise it on changed terrain.
    if (seed === 101) checkPlacement(scene, context());
  });

  it("repeats geometry, neutral washes, collider boxes and interaction exactly for the same seed", () => {
    const first = create(), second = create(), different = create(context({ seed: 102 }));
    expect(first.interactable).toEqual(second.interactable);
    expect(first.colliders).toEqual(second.colliders);
    meshes(first).forEach((mesh, index) => {
      const repeated = meshes(second)[index]!;
      expect(mesh.name).toBe(repeated.name);
      expect(mesh.material.color.getHex()).toBe(repeated.material.color.getHex());
      expect(mesh.geometry.groups).toEqual(repeated.geometry.groups);
      for (const name of Object.keys(mesh.geometry.attributes)) {
        expect(Array.from(mesh.geometry.getAttribute(name).array))
          .toEqual(Array.from(repeated.geometry.getAttribute(name).array));
      }
      expect(mesh.geometry.boundingBox).toEqual(repeated.geometry.boundingBox);
    });
    const green = (scene: ZoneScene) => meshes(scene).find(mesh => mesh.name.endsWith("green"))!.geometry;
    expect(Array.from(green(first).getAttribute("position").array))
      .not.toEqual(Array.from(green(different).getAttribute("position").array));
  });

  it("grounds feet and all geometry on a gentle terrain slope", () => {
    const flat = create();
    const heightAt = (x: number, z: number) => 0.045 * x - 0.025 * z;
    const ctx = context({ heightAt });
    const slope = create(ctx);
    meshes(slope).forEach((mesh, index) => {
      const positions = mesh.geometry.getAttribute("position");
      const original = meshes(flat)[index]!.geometry.getAttribute("position");
      expect(positions.count).toBe(original.count);
      for (let i = 0; i < positions.count; i++) {
        expect(positions.getY(i) - original.getY(i))
          .toBeCloseTo(heightAt(positions.getX(i), positions.getZ(i)), 5);
      }
    });
    expect(slope.interactable.position.y).toBeCloseTo(heightAt(4.8, 3.8) + 1.1);
    checkPlacement(slope, ctx);
    // Every hard assembly touches ground somewhere, even when its broad canopy shares a box.
    for (const collider of flat.colliders) expect(collider.center.y - collider.size.y / 2).toBeCloseTo(0, 5);
  });

  it("rejects wet footprints, including water through the interior rather than just at a centre", () => {
    const ctx = context({ underWater: (x, z) => x < -6 || (x > 4.47 && x < 4.66 && z > 3.4 && z < 4.2) });
    expect(ctx.underWater(4.8, 3.8)).toBe(false);
    const scene = create(ctx);
    expect(scene.interactable.position.x).toBe(-4.8);
    checkPlacement(scene, ctx);
    expect(scene.colliders.length).toBeLessThan(create().colliders.length);
  });

  it("respects curved/widened path predicates and tries another reachable greeting site", () => {
    const ctx = context({ onPath: (x, z) => Math.abs(x) <= PATH_CLEARANCE || (x > 4 && z > 2 && z < 5) });
    const scene = create(ctx);
    expect(scene.interactable.position.x).toBe(-4.8);
    checkPlacement(scene, ctx);
  });

  it("does not invent a location when all reachable greeting sites are flooded", () => {
    expect(() => create(context({ underWater: () => true }))).toThrow(RangeError);
    expect(() => create(context({ onPath: () => true }))).toThrow(RangeError);
  });

  it("offers the bilingual greeting 2–6 m outside the corridor, reachable with E from its edge", () => {
    for (const ctx of [context(), context({ underWater: x => x > 0 })]) {
      const scene = create(ctx);
      const position = scene.interactable.position;
      const offset = Math.abs(position.x) - PATH_CLEARANCE;
      expect(offset).toBeGreaterThanOrEqual(2);
      expect(offset).toBeLessThanOrEqual(6);
      const player = new Vector3(Math.sign(position.x) * PATH_CLEARANCE,
        ctx.heightAt(Math.sign(position.x) * PATH_CLEARANCE, position.z), position.z);
      expect(player.distanceTo(position)).toBeLessThanOrEqual(2.5);
      expect(ctx.onPath(position.x, position.z)).toBe(false);
      expect(ctx.underWater(position.x, position.z)).toBe(false);
      expect(scene.interactable.label).toEqual({ vi: "Lời chào đầu", en: "A first hello" });
      const box = scene.colliders[0]!;
      expect(new Box3().setFromCenterAndSize(box.center, box.size).containsPoint(position)).toBe(true);
    }
  });

  it("uses palette recipes, matte ramps, neutral vertex multiplication and faint dawn veils", () => {
    const scene = create();
    const colors: Record<string, number> = {
      wood: new Color(PALETTE.ink).lerp(new Color(PALETTE.dusk), 0.38)
        .lerp(new Color(PALETTE.paper), 0.12).getHex(),
      paper: new Color(PALETTE.paper).getHex(),
      green: paletteColor(WORLD_DIRECTION.foliage.crown),
      stone: tint("mist", 0.25), sun: tint("dusk", 0.8),
    };
    for (const mesh of meshes(scene)) {
      const surface = mesh.name.replace("first-light-", "");
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      expect(mesh.material.color.getHex()).toBe(colors[surface]);
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.gradientMap).toBeTruthy();
      expect(mesh.material).not.toHaveProperty("metalness");
      const washes = mesh.geometry.getAttribute("color");
      expect(washes.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < washes.count; i++) {
        expect(washes.getX(i)).toBeGreaterThanOrEqual(0.899);
        expect(washes.getX(i)).toBeLessThanOrEqual(0.981);
        expect(washes.getY(i)).toBe(washes.getX(i));
        expect(washes.getZ(i)).toBe(washes.getX(i));
      }
      if (surface === "sun") {
        expect(triangles(mesh.geometry)).toBe(4);
        expect(mesh.material.transparent).toBe(true);
        expect(mesh.material.opacity).toBeLessThanOrEqual(0.08);
        expect(mesh.material.depthWrite).toBe(false);
        expect(mesh.material.forceSinglePass).toBe(true);
      }
    }
  });

  it("keeps transforms and geometry still for reduced motion and ambient updates", () => {
    const scene = create();
    const snapshot = () => [scene.group, ...scene.group.children].map(object => ({
      position: object.position.toArray(), rotation: object.quaternion.toArray(), scale: object.scale.toArray(),
    }));
    const before = snapshot();
    const positions = meshes(scene).map(mesh => Array.from(mesh.geometry.getAttribute("position").array));
    for (const dt of [0, 1 / 60, 1, 60]) {
      scene.update!(dt, true);
      scene.update!(dt, false);
    }
    expect(snapshot()).toEqual(before);
    expect(meshes(scene).map(mesh => Array.from(mesh.geometry.getAttribute("position").array))).toEqual(positions);
  });

  it("releases all owned geometries/materials once while retaining the shared world ramp", () => {
    const first = create(), sibling = create();
    const ramp = meshes(first)[0]!.material.gradientMap!;
    const rampDisposed = vi.fn();
    ramp.addEventListener("dispose", rampDisposed);
    const resources = meshes(first).flatMap(mesh => [mesh.geometry, mesh.material]);
    const disposed = resources.map(resource => {
      const listener = vi.fn();
      resource.addEventListener("dispose", listener);
      return listener;
    });
    const siblingDisposed = vi.fn();
    meshes(sibling).forEach(mesh => {
      mesh.geometry.addEventListener("dispose", siblingDisposed);
      mesh.material.addEventListener("dispose", siblingDisposed);
    });
    first.dispose();
    first.dispose();
    disposed.forEach(listener => expect(listener).toHaveBeenCalledTimes(1));
    expect(first.group.children).toHaveLength(0);
    expect(siblingDisposed).not.toHaveBeenCalled();
    expect(rampDisposed).not.toHaveBeenCalled();
    expect(meshes(sibling)[0]!.material.gradientMap).toBe(ramp);
  });
});
