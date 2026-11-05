import {
  Box3, BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createPropMaterial } from "../../../../src/features/world/props/materials";
import { createRootsScene } from "../../../../src/features/world/zones/roots";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const context = (overrides: Partial<ZoneSceneContext> = {}): ZoneSceneContext => ({
  seed: 102, heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false,
  ...overrides,
});
function create(ctx = context()): ZoneScene {
  const scene = createRootsScene(ctx);
  owned.push(scene);
  return scene;
}
function meshes(scene: ZoneScene): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  scene.group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}
function signature(scene: ZoneScene) {
  return {
    zone: scene.zoneId, interactable: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(),
      scale: mesh.scale.toArray(), color: mesh.material.color.toArray(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
        .map(([name, attribute]) => [name, Array.from(attribute.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups,
    })),
  };
}
afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

describe("The Roots procedural zone", () => {
  it("merges each pigment into one draw call within the triangle and radius budgets", () => {
    const scene = create(), parts = meshes(scene);
    const triangles = parts.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = parts.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(1000);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(parts.map(mesh => mesh.material)).size).toBe(parts.length);
    for (const mesh of parts) {
      expect(mesh.geometry.groups).toHaveLength(0);
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect(new Vector3().fromBufferAttribute(positions, i).length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
    }
    console.info(`roots: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("repeats geometry, pigments, colliders and interaction across interleaved builds", () => {
    const first = create();
    const alternate = create(context({ seed: 9371 }));
    expect(signature(first)).toEqual(signature(create()));
    expect(signature(first).meshes).not.toEqual(signature(alternate).meshes);
  });

  const environments = [
    { name: "flat ground", ctx: context() },
    { name: "a gentle hill", ctx: context({ heightAt: (x, z) => x * 0.035 + z * 0.02 }) },
    { name: "water on the right verge", ctx: context({ underWater: x => x > 2.6 }) },
    { name: "a water pocket inside a root footprint", ctx: context({
      underWater: (x, z) => x > 8 && x < 8.6 && z > 0.4 && z < 1.1,
    }) },
    { name: "a curved path occupying the right verge", ctx: context({
      onPath: (x, z) => Math.abs(x) <= PATH_CLEARANCE || (x > 3 && Math.abs(z) < 2),
    }) },
    { name: "a wet band requiring an offset along the path", ctx: context({
      underWater: (_x, z) => Math.abs(z) < 5,
    }) },
  ];
  for (const { name, ctx } of environments) {
    it(`keeps geometry and complete collider footprints clear on ${name}`, () => {
      const scene = create(ctx);
      for (const mesh of meshes(scene)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
          expect(ctx.onPath(x, z)).toBe(false);
          expect(ctx.underWater(x, z)).toBe(false);
          expect(y).toBeGreaterThanOrEqual(ctx.heightAt(x, z) - 1e-5);
          expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(ZONE_BUDGET.radius);
        }
      }
      expect(scene.colliders.length).toBeGreaterThan(8);
      for (const { center, size, yaw } of scene.colliders) {
        expect(yaw ?? 0).toBe(0);
        expect(Math.abs(center.x) - size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
        expect(size.toArray().every(value => value > 0)).toBe(true);
        // Sample box interiors as well as their corners, independently of mesh vertices.
        for (let ix = 0; ix <= 20; ix++) {
          for (let iz = 0; iz <= 20; iz++) {
            const x = center.x + (ix / 20 - 0.5) * size.x;
            const z = center.z + (iz / 20 - 0.5) * size.z;
            expect(ctx.onPath(x, z)).toBe(false);
            expect(ctx.underWater(x, z)).toBe(false);
          }
        }
      }
      const p = scene.interactable.position;
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeGreaterThanOrEqual(2);
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeLessThanOrEqual(6);
      expect(ctx.onPath(p.x, p.z)).toBe(false);
      expect(ctx.underWater(p.x, p.z)).toBe(false);
    });
  }

  it("mirrors or shifts the complete composition instead of dropping blocked roots", () => {
    const normal = create();
    const mirrored = create(context({ underWater: x => x > 2.6 }));
    const shifted = create(context({ underWater: (_x, z) => Math.abs(z) < 5 }));
    expect(mirrored.interactable.position.x).toBeLessThan(-PATH_CLEARANCE);
    expect(Math.abs(shifted.interactable.position.z)).toBeGreaterThan(5);
    expect(meshes(mirrored).map(mesh => mesh.geometry.getAttribute("position").count))
      .toEqual(meshes(normal).map(mesh => mesh.geometry.getAttribute("position").count));
  });

  it("has a broad, flat end-grain table and eight visible root tips on either verge", () => {
    for (const side of [1, -1]) {
      const ctx = context({ heightAt: (x, z) => x * 0.03 - z * 0.01,
        underWater: x => side * x < -2.6 });
      const scene = create(ctx);
      const cut = scene.group.getObjectByName("roots-cut") as PaintedMesh;
      const bounds = new Box3().setFromObject(cut), size = bounds.getSize(new Vector3());
      expect(size.x).toBeGreaterThan(2.5);
      expect(size.z).toBeGreaterThan(2.5);
      expect(size.y).toBeLessThan(1e-5);
      expect(bounds.min.y).toBeCloseTo(scene.interactable.position.y, 5);
      const p = scene.interactable.position;
      const hits = new Raycaster(new Vector3(p.x + 0.2, p.y + 2, p.z), new Vector3(0, -1, 0))
        .intersectObject(scene.group);
      expect(hits[0]?.object.name).toBe("roots-cut");
      const wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
      for (const [x, z] of [[-1.15, -3.3], [-1.05, 3.1], [1.2, 4.7], [4.4, 4],
        [6, 1.4], [5.7, -2.5], [3, -4.5], [0.2, -4.7]]) {
        // Aim just inside the tapered tip, away from its terminal triangle edge.
        const from = new Vector3(p.x + side * x! * 0.99, 5, p.z + z! * 0.99);
        expect(new Raycaster(from, new Vector3(0, -1, 0)).intersectObject(wood).length,
          `visible root tip at ${side * x!}, ${z}`).toBeGreaterThan(0);
      }
    }
  });

  it("grounds the stump foot and root undersides on the sampled hill", () => {
    const ctx = context({ heightAt: (x, z) => x * 0.04 + z * 0.015 });
    const scene = create(ctx), wood = scene.group.getObjectByName("roots-wood") as PaintedMesh;
    const positions = wood.geometry.getAttribute("position");
    const contacts: Vector3[] = [];
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i);
      if (Math.abs(p.y - ctx.heightAt(p.x, p.z)) < 1e-6) contacts.push(p);
    }
    expect(contacts.length).toBeGreaterThan(100);
    const bounds = new Box3().setFromPoints(contacts).getSize(new Vector3());
    expect(bounds.x).toBeGreaterThan(6);
    expect(bounds.z).toBeGreaterThan(9);
  });

  it("uses the requested labels and keeps the table within E range of the road edge", () => {
    const scene = create(), p = scene.interactable.position;
    expect(scene.zoneId).toBe("roots");
    expect(scene.interactable.label).toEqual({ en: "The root stump", vi: "Gốc rễ" });
    expect(p.distanceTo(new Vector3(PATH_CLEARANCE, 0, p.z))).toBeLessThanOrEqual(2.5);
  });

  it("uses only palette pigment recipes with neutral washes, matte ramps and no text or glow", () => {
    const wood = createPropMaterial("wood");
    const pigments: Record<string, Color> = {
      "roots-wood": wood.color.clone(),
      "roots-cut": new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.28),
      "roots-moss": new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.forestLight), 0.35),
      "roots-node": new Color(PALETTE.mist), "roots-vine": new Color(PALETTE.water),
    };
    wood.dispose();
    const scene = create();
    scene.group.traverse(node => expect(node.name).not.toMatch(/text|logo/i));
    for (const mesh of meshes(scene)) {
      const material = mesh.material;
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material.color.toArray()).toEqual(pigments[mesh.name]!.toArray());
      expect(material.emissive.getHex()).toBe(0);
      expect(material.vertexColors).toBe(true);
      expect(material.transparent).toBe(false);
      expect(material.map).toBeNull();
      expect(material.gradientMap).not.toBeNull();
      expect(material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const colors = mesh.geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.929);
        expect(colors.getX(i)).toBeLessThanOrEqual(0.981);
        expect(colors.getY(i)).toBe(colors.getX(i));
        expect(colors.getZ(i)).toBe(colors.getX(i));
      }
    }
  });

  it("has finite, nondegenerate triangles with matching flat normals", () => {
    for (const mesh of meshes(create())) {
      const positions = mesh.geometry.getAttribute("position"), normals = mesh.geometry.getAttribute("normal");
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        const face = b.sub(a).cross(c.sub(a));
        expect(face.length()).toBeGreaterThan(1e-8);
        face.normalize();
        expect(face.distanceTo(new Vector3().fromBufferAttribute(normals, i))).toBeLessThan(1e-5);
      }
    }
  });

  it("keeps every transform and geometry still with reduced motion", () => {
    const scene = create(), before = signature(scene);
    for (const dt of [0.016, 1, 10, 100]) scene.update?.(dt, true);
    expect(signature(scene)).toEqual(before);
    scene.update?.(10, false);
    expect(signature(scene)).toEqual(before);
  });

  it("disposes each owned geometry and material once while preserving siblings and the shared ramp", () => {
    const scene = create(), sibling = create();
    const resources = meshes(scene).flatMap(mesh => [mesh.geometry, mesh.material]);
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    const siblingSpies = meshes(sibling).flatMap(mesh => [mesh.geometry, mesh.material])
      .map(resource => vi.spyOn(resource, "dispose"));
    const rampSpy = vi.spyOn(meshes(scene)[0]!.material.gradientMap!, "dispose");
    scene.dispose();
    scene.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(scene.group.children).toHaveLength(0);
    expect(signature(sibling)).toEqual(signature(create()));
  });

  it("releases temporary geometry and reports an entirely blocked verge", () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => createRootsScene(context({ underWater: () => true }))).toThrow(RangeError);
    expect(dispose.mock.instances.length).toBeGreaterThan(20);
    expect(new Set(dispose.mock.instances).size).toBe(dispose.mock.instances.length);
    dispose.mockClear();
    expect(() => createRootsScene(context({ onPath: () => true }))).toThrow(RangeError);
    expect(dispose).toHaveBeenCalled();
  });
});
