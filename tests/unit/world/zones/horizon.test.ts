import { BufferGeometry, Color, Group, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createHorizonScene } from "../../../../src/features/world/zones/horizon";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const flat: ZoneSceneContext = {
  seed: 106,
  heightAt: () => 0,
  onPath: x => Math.abs(x) <= 2.6,
  underWater: () => false,
};
function create(context: ZoneSceneContext = flat): ZoneScene {
  const scene = createHorizonScene(context);
  owned.push(scene);
  return scene;
}
afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  vi.restoreAllMocks();
  disposeRampGradients();
});

function meshes(group: Group): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}
function transforms(group: Group) {
  const result: unknown[] = [];
  group.traverse(node => result.push([node.name, node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()]));
  return result;
}
function signature(scene: ZoneScene) {
  return {
    zoneId: scene.zoneId, transforms: transforms(scene.group),
    interactable: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene.group).map(mesh => ({
      name: mesh.name, color: mesh.material.color.toArray(), groups: mesh.geometry.groups,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, Array.from(attribute.array)])),
      index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
    })),
  };
}
function points(scene: ZoneScene): Vector3[] {
  scene.group.updateMatrixWorld(true);
  return meshes(scene.group).flatMap(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    return Array.from({ length: positions.count }, (_, index) =>
      new Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
  });
}
function assertClear(scene: ZoneScene, context: ZoneSceneContext) {
  // Sample vertices, edge midpoints and face interiors, including disconnected parts in a batch.
  scene.group.updateMatrixWorld(true);
  for (const mesh of meshes(scene.group)) {
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 3) {
      const triangle = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i + j).applyMatrix4(mesh.matrixWorld));
      const [a, b, c] = triangle as [Vector3, Vector3, Vector3];
      const samples = [...triangle, a.clone().lerp(b, 0.5), b.clone().lerp(c, 0.5), c.clone().lerp(a, 0.5),
        a.clone().add(b).add(c).divideScalar(3)];
      for (const p of samples) {
        expect(Math.abs(p.x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(context.onPath(p.x, p.z)).toBe(false);
        expect(context.underWater(p.x, p.z)).toBe(false);
        expect(p.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
        expect(p.y).toBeGreaterThanOrEqual(context.heightAt(p.x, p.z) - 0.00001);
      }
      expect(b.clone().sub(a).cross(c.clone().sub(a)).length()).toBeGreaterThan(1e-8);
    }
  }
  for (const box of scene.colliders) {
    expect(box.yaw ?? 0).toBe(0);
    expect(box.center.x - box.size.x / 2).toBeGreaterThan(PATH_CLEARANCE);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const x = box.center.x + box.size.x / 2 * i, z = box.center.z + box.size.z / 2 * j;
        expect(context.onPath(x, z)).toBe(false);
        expect(context.underWater(x, z)).toBe(false);
      }
    }
  }
}

describe("horizon: a quiet sea-facing overlook", () => {
  it("batches the complete scene into 8 draw calls within the triangle and 30 m budgets", () => {
    const scene = create(), drawn = meshes(scene.group);
    expect(scene.zoneId).toBe("horizon");
    expect(scene.group.position.toArray()).toEqual([0, 0, 0]);
    const triangles = drawn.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = drawn.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(500);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBe(8);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(drawn.map(mesh => mesh.material)).size).toBe(6);
    expect(scene.colliders).toHaveLength(5);
    for (const mesh of drawn) {
      expect(mesh.geometry.groups).toHaveLength(0);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    expect(Math.max(...points(scene).map(point => point.length()))).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    // This exact count makes the handoff measurable and catches accidental detail growth.
    expect(triangles).toBe(852);
    console.info(`horizon: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("repeats geometry, pigments, placement, colliders and animation for a given seed", () => {
    const first = create();
    create({ ...flat, seed: 2048 });
    const second = create();
    expect(signature(first)).toEqual(signature(second));
    expect(signature(create({ ...flat, seed: 107 }))).not.toEqual(signature(first));
    first.update!(17, false);
    second.update!(17, false);
    expect(signature(first)).toEqual(signature(second));
  });

  it("keeps all geometry and colliders clear of the path on flat ground", () => {
    assertClear(create(), flat);
  });

  it("grounds feet on a slope, including all three rail posts and bench supports", () => {
    const slope: ZoneSceneContext = { ...flat, heightAt: (x, z) => x * 0.015 + z * 0.01 };
    const scene = create(slope);
    assertClear(scene, slope);
    const vertices = points(scene);
    // Every collider represents a grounded object, not a floating merged-batch centre.
    for (const box of scene.colliders) {
      const feet = vertices.filter(p => Math.abs(p.x - box.center.x) <= box.size.x / 2 + 0.001
        && Math.abs(p.z - box.center.z) <= box.size.z / 2 + 0.001
        && Math.abs(p.y - slope.heightAt(p.x, p.z)) < 0.00001);
      expect(feet.length).toBeGreaterThan(2);
      expect(box.center.y - box.size.y / 2).toBeLessThanOrEqual(Math.min(...feet.map(p => p.y)) + 0.00001);
    }
    expect(scene.interactable.position.y).toBeCloseTo(slope.heightAt(4.65, 0) + 1.25, 6);
  });

  it("uses deterministic dry fallback sites when water blocks the initial viewer and turbine", () => {
    const coast: ZoneSceneContext = {
      ...flat,
      underWater: (x, z) => (x < 5.5 && Math.abs(z) < 0.7) || (x > 16 && z > 7 && z < 11),
    };
    const scene = create(coast);
    expect(scene.interactable.position.z).toBe(2);
    expect(scene.group.getObjectByName("horizon-rotor-0")!.position.z).toBe(4);
    assertClear(scene, coast);
    expect(signature(create(coast))).toEqual(signature(scene));
  });

  it("also respects onPath beyond the straight corridor and rejects impossible sites before allocation", () => {
    const bulge: ZoneSceneContext = { ...flat, onPath: (x, z) => Math.abs(x) <= 2.6 || (x < 5.5 && Math.abs(z) < 0.7) };
    const scene = create(bulge);
    expect(scene.interactable.position.z).toBe(2);
    assertClear(scene, bulge);
    const disposal = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => createHorizonScene({ ...flat, underWater: () => true })).toThrow(RangeError);
    expect(() => createHorizonScene({ ...flat, onPath: () => true })).toThrow(RangeError);
    expect(disposal).not.toHaveBeenCalled();
  });

  it("places the labelled binocular viewer 2–6 m from the corridor and within E reach", () => {
    const scene = create(), point = scene.interactable.position;
    expect(point.toArray()).toEqual([4.65, 1.25, 0]);
    const edgeDistance = Math.abs(point.x) - PATH_CLEARANCE;
    expect(edgeDistance).toBeGreaterThanOrEqual(2);
    expect(edgeDistance).toBeLessThanOrEqual(6);
    expect(point.distanceTo(new Vector3(PATH_CLEARANCE, 0, point.z))).toBeLessThanOrEqual(2.5);
    expect(scene.interactable.label).toEqual({ vi: "Ống nhòm nhìn ra biển", en: "Sea-facing viewer" });
    const lens = scene.group.getObjectByName("horizon-lens") as PaintedMesh;
    expect(lens.geometry.getAttribute("position").count / 3).toBe(16);
    // Two seaward lens faces, ahead of the pedestal; HTML owns the labels.
    expect(lens.geometry.boundingBox!.min.x).toBeGreaterThan(point.x);
  });

  it("uses only palette mixtures, matte toon materials and neutral multiplying washes", () => {
    const scene = create();
    const color = (base: keyof typeof PALETTE, mix: keyof typeof PALETTE, amount: number) =>
      new Color(PALETTE[base]).lerp(new Color(PALETTE[mix]), amount);
    const expected: Record<string, Color> = {
      stone: color("rock", "rockDark", 0.14), wood: color("dusk", "rockDark", 0.62),
      paint: color("cloud", "rock", 0.22), white: new Color(PALETTE.laneWhite),
      iron: color("rockDark", "ink", 0.32), lens: new Color(PALETTE.seaDeep),
    };
    for (const mesh of meshes(scene.group)) {
      expect(mesh.name).not.toMatch(/text|logo/i);
      expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      expect(mesh.material.color.getHex()).toBe(expected[mesh.name.slice("horizon-".length)]!.getHex());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.emissive.getHex()).toBe(0);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.map).toBeNull();
      expect(mesh.material.customProgramCacheKey()).toBe("painted-toon-ramp-v1");
      const colors = mesh.geometry.getAttribute("color");
      expect(colors.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < colors.count; i++) {
        expect(colors.getX(i)).toBeGreaterThanOrEqual(0.9349);
        expect(colors.getX(i)).toBeLessThanOrEqual(0.9851);
        expect(colors.getX(i)).toBe(colors.getY(i));
        expect(colors.getX(i)).toBe(colors.getZ(i));
      }
      for (const attribute of Object.values(mesh.geometry.attributes)) expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
  });

  it("keeps the gap between the viewer tubes clickable using its existing collider", () => {
    const scene = create();
    for (const mirrored of [false, true]) {
      scene.group.position.set(12, 3, -20);
      scene.group.rotation.y = 0.7;
      scene.group.scale.x = mirrored ? -1 : 1;
      scene.group.updateMatrixWorld(true);
      const target = scene.group.localToWorld(scene.interactable.position.clone());
      const eye = scene.group.localToWorld(new Vector3(2.6, 1.25, 0));
      const direction = target.clone().sub(eye).normalize();
      const ray = new Raycaster(eye, direction, 0, 2.5);
      expect(ray.intersectObject(scene.group, true)[0]?.object.name).toBe("horizon-iron");
      ray.far = 0.1;
      expect(ray.intersectObject(scene.group, true)).toHaveLength(0);
      ray.far = 2.5;
      ray.ray.origin.y += 2;
      expect(ray.intersectObject(scene.group, true)).toHaveLength(0);
    }
  });

  it("has two distant, slowly turning three-blade turbines and freezes every transform for reduced motion", () => {
    const scene = create();
    const rotors = scene.group.children.filter(child => child.name.startsWith("horizon-rotor-"));
    expect(rotors).toHaveLength(2);
    for (const rotor of rotors) {
      expect(Math.hypot(rotor.position.x, rotor.position.z)).toBeGreaterThanOrEqual(20);
      expect(Math.hypot(rotor.position.x, rotor.position.z)).toBeLessThanOrEqual(30);
      expect(rotor.children).toHaveLength(1);
    }
    const before = transforms(scene.group), angles = rotors.map(rotor => rotor.rotation.x);
    scene.update!(1000, true);
    expect(transforms(scene.group)).toEqual(before);
    scene.update!(1, false);
    rotors.forEach((rotor, i) => {
      expect(rotor.rotation.x - angles[i]!).toBeGreaterThan(0);
      expect(rotor.rotation.x - angles[i]!).toBeLessThan(0.1);
    });
    const paused = transforms(scene.group);
    scene.update!(1000, true);
    for (const dt of [0, -1, NaN, Infinity]) scene.update!(dt, false);
    expect(transforms(scene.group)).toEqual(paused);
    // The entire swept area remains clear, not just the starting blade orientation.
    for (let step = 0; step < 8; step++) {
      scene.update!(8, false);
      assertClear(scene, flat);
    }
  });

  it("disposes each owned geometry/material once, preserving sibling scenes and the shared ramp", () => {
    const scene = create(), sibling = create();
    const resources = new Set(meshes(scene.group).flatMap(mesh => [mesh.geometry, mesh.material]));
    const spies = Array.from(resources, resource => vi.spyOn(resource, "dispose"));
    const siblingSpies = Array.from(new Set(meshes(sibling.group).flatMap(mesh => [mesh.geometry, mesh.material])), resource => vi.spyOn(resource, "dispose"));
    const ramp = meshes(scene.group)[0]!.material.gradientMap!;
    expect(meshes(sibling.group)[0]!.material.gradientMap).toBe(ramp);
    const shared = vi.spyOn(ramp, "dispose");
    const before = transforms(scene.group);
    scene.dispose();
    scene.dispose();
    scene.update!(10, false);
    expect(transforms(scene.group)).toEqual(before);
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(shared).not.toHaveBeenCalled();
    expect(signature(create())).toEqual(signature(sibling));
  });
});
