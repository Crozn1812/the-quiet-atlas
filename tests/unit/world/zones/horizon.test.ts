import { reportBudget } from "../report-budget";
import { BufferGeometry, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, MeshToonMaterial, Raycaster, Scene, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createRockGeometry } from "../../../../src/features/world/props/rocks";
import { createBenchGeometry, createPlankGeometry, createPostGeometry } from "../../../../src/features/world/props/wood";
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
        // R4 deliberately buries feet 4 cm, within the allowed 3–10 cm contact band.
        expect(p.y).toBeGreaterThanOrEqual(context.heightAt(p.x, p.z) - 0.10001);
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
  it("batches the complete overlook into 8 draws within the C dressing and 30 m budgets", () => {
    const scene = create(), drawn = meshes(scene.group);
    expect(scene.zoneId).toBe("horizon");
    expect(scene.group.position.toArray()).toEqual([0, 0, 0]);
    const triangles = drawn.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = drawn.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(500);
    reportBudget("tests/unit/world/zones/horizon.test.ts:100 triangles", triangles, ZONE_BUDGET.triangles);
    const base = drawn.filter(mesh => mesh.name !== "horizon-dressing");
    expect(base.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0)).toBe(1262);
    expect(drawCalls).toBe(8);
    reportBudget("tests/unit/world/zones/horizon.test.ts:104 drawCalls", drawCalls, ZONE_BUDGET.drawCalls);
    expect(new Set(drawn.map(mesh => mesh.material)).size).toBe(6);
    expect(scene.colliders).toHaveLength(5);
    for (const mesh of drawn) {
      expect(mesh.geometry.groups).toHaveLength(0);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    expect(Math.max(...points(scene).map(point => point.length()))).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    // This exact count makes the handoff measurable and catches accidental detail growth.
    // Kit bench/rail, twisted airfoils, rounded housings and grounded dressing replace R3 blocks.
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

  it("keeps kit variants under 1.5× R3 and preserves every collider", () => {
    for (const seed of [0, 1, 2, 106, 107, 2048, 0xffffffff]) {
      const scene = create({ ...flat, seed });
      const triangles = meshes(scene.group).filter(mesh => mesh.name !== "horizon-dressing")
        .reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
      reportBudget("tests/unit/world/zones/horizon.test.ts:134 triangles", triangles, 852 * 1.5);
      expect(meshes(scene.group)).toHaveLength(8);
      expect(scene.colliders.map(box => ({ center: box.center.toArray(), size: box.size.toArray() }))).toEqual([
        { center: [4.65, 0.75, 0], size: [1.05, 1.5, 0.75] },
        { center: [6.4, 0.3, -3], size: [0.75, 0.6, 2.2] },
        { center: [8.4, 0.56, 1], size: [0.3, 1.12, 4] },
        { center: [19.5, 3.725, 9.5], size: [0.62, 7.45, 0.62] },
        { center: [23, 3.4250000000000003, -7], size: [0.62, 6.8500000000000005, 0.62] },
      ]);
    }
  });

  it("keeps the sea-facing kit bench and its palette pigments, with buried dressing and a sketchbook", () => {
    const scene = create();
    const natural = scene.group.getObjectByName("horizon-natural") as PaintedMesh;
    const positions = natural.geometry.getAttribute("position"), colors = natural.geometry.getAttribute("color");
    const key = (x: number, y: number, z: number) => [x, y, z].map(value => value.toFixed(5)).join(",");
    const vertices = new Set(Array.from({ length: positions.count }, (_, i) => key(positions.getX(i), positions.getY(i), positions.getZ(i))));
    const pigments = new Set<string>();
    const kit = [createBenchGeometry(137), createRockGeometry("stone", 117), createRockGeometry("stone", 177),
      createRockGeometry("stone", 178), createRockGeometry("stone", 237), createRockGeometry("stone", 238),
      ...[207, 208, 209].map(seed => createPostGeometry(1.12, seed)),
      ...[217, 218].map(seed => createPlankGeometry(3.8, seed))];
    try {
      // The kit's +Z back becomes -X: its open front faces the sea at +X.
      const bench = kit[0]!.rotateY(-Math.PI / 2).translate(6.4, -0.04, -3);
      const feet = bench.getAttribute("position");
      for (let i = 0; i < feet.count; i++) {
        expect(vertices.has(key(feet.getX(i), feet.getY(i), feet.getZ(i)))).toBe(true);
      }
      const back = Array.from({ length: feet.count }, (_, i) => i).filter(i => feet.getY(i) > 0.55);
      expect(Math.max(...back.map(i => feet.getX(i)))).toBeLessThan(6.4);
      for (const geometry of kit) {
        const color = geometry.getAttribute("color");
        for (let i = 0; i < color.count; i++) pigments.add(key(color.getX(i), color.getY(i), color.getZ(i)));
      }
      for (const seed of [197, 198, 199]) {
        const color = new Color(PALETTE.grassDry).lerp(new Color(PALETTE.sand), seed % 7 / 18);
        pigments.add(key(color.r, color.g, color.b));
      }
      for (let i = 0; i < colors.count; i++) {
        expect(pigments.has(key(colors.getX(i), colors.getY(i), colors.getZ(i)))).toBe(true);
      }
    } finally { kit.forEach(geometry => geometry.dispose()); }
    // Both stones and all three tufts reach 4 cm into the terrain at their own feet.
    for (const [x, z] of [[6.61, -3.87], [6.61, -2.12], [6.08, -3.82], [6.08, -2.92], [6.08, -2.14]]) {
      const foot = Array.from({ length: positions.count }, (_, i) => i).filter(i =>
        Math.abs(positions.getX(i) - x!) < 0.12 && Math.abs(positions.getZ(i) - z!) < 0.12);
      expect(Math.min(...foot.map(i => positions.getY(i)))).toBeCloseTo(-0.04, 5);
    }
    const paper = scene.group.children.find(node => node.name === "horizon-white") as PaintedMesh;
    const book = paper.geometry.getAttribute("position");
    expect(book.getY(0)).toBeGreaterThan(0.43); // Above the sunk seat, below the back slats.
    expect(book.getY(0)).toBeLessThan(0.48);
  });

  it("gives each rotor three closed, slender airfoils with decreasing root-to-tip twist", () => {
    const scene = create();
    const rotor = scene.group.getObjectByName("horizon-rotor-0") as Group;
    const geometry = (rotor.children[0] as PaintedMesh).geometry;
    const positions = geometry.getAttribute("position");
    const blade = Array.from({ length: 60 }, (_, i) => new Vector3().fromBufferAttribute(positions, 72 + i));
    expect(positions.count / 3).toBe(24 + 3 * 20);
    const twist: number[] = [];
    for (const height of [0.13, 1.08, 2.11]) {
      const ring = blade.filter(p => Math.abs(p.y - height) < 0.00001);
      const edge = ring.reduce((a, b) => a.z > b.z ? a : b);
      twist.push(Math.atan2(-edge.x, edge.z - height * 0.055));
    }
    expect(twist[0]! - twist[2]!).toBeGreaterThan(0.25);
    expect(twist[0]).toBeGreaterThan(twist[1]!);
    expect(twist[1]).toBeGreaterThan(twist[2]!);
    for (let index = 0; index < 3; index++) {
      let volume = 0;
      for (let i = 0; i < 60; i++) {
        const actual = new Vector3().fromBufferAttribute(positions, 72 + index * 60 + i);
        expect(actual.distanceTo(blade[i]!.clone().applyAxisAngle(new Vector3(1, 0, 0), index * Math.PI * 2 / 3))).toBeLessThan(0.000001);
        if (i % 3 !== 0) continue;
        const b = new Vector3().fromBufferAttribute(positions, 73 + index * 60 + i);
        const c = new Vector3().fromBufferAttribute(positions, 74 + index * 60 + i);
        volume += actual.dot(b.cross(c)) / 6;
      }
      expect(volume).toBeGreaterThan(0); // Outward winding on the closed thin shell.
    }
    const white = (scene.group.children.find(node => node.name === "horizon-white") as PaintedMesh).geometry.getAttribute("position");
    const slope = create({ ...flat, heightAt: (x, z) => x * 0.015 + z * 0.01 });
    const sloped = (slope.group.children.find(node => node.name === "horizon-white") as PaintedMesh).geometry.getAttribute("position");
    // First nacelle follows the hub's ground anchor as one rigid, rounded housing.
    for (let i = 156; i < 300; i++) {
      expect(sloped.getX(i)).toBe(white.getX(i));
      expect(sloped.getZ(i)).toBe(white.getZ(i));
      expect(sloped.getY(i) - white.getY(i)).toBeCloseTo(19.5 * 0.015 + 9.5 * 0.01, 5);
    }
  });

  it("reports the High world census with only horizon replaced and the Node build median", async () => {
    const [{ createWorldScene, surfaceHeight }, { createMeshPhysics }, { createFarLandscape },
      { placeDressing }, { placeZoneScenes, zoneFoliageBounds }, { pathPointAt }] = await Promise.all([
      import("../../../../src/features/world/scene/compose"), import("../../../../src/features/world/scene/mesh-physics"),
      import("../../../../src/features/world/scene/far-landscape"), import("../../../../src/features/world/dressing"),
      import("../../../../src/features/world/zones"), import("../../../../src/features/world/layout/path"),
    ]);
    const samples: number[] = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now(), zone = createHorizonScene(flat);
      samples.push(performance.now() - start);
      zone.dispose();
    }
    const scene = new Scene(), cleanup: (() => void)[] = [];
    try {
      const zones = placeZoneScenes(surfaceHeight);
      cleanup.push(() => zones.forEach(zone => zone.dispose()));
      const dressing = placeDressing();
      cleanup.push(() => dressing.dispose());
      const far = createFarLandscape();
      cleanup.push(() => far.dispose());
      scene.add(...zones.map(zone => zone.group), ...dressing.groups, far.mesh);
      const composition = createWorldScene({ ...createMeshPhysics(), scene, quality: "High", zoneBounds: zoneFoliageBounds(zones),
        zoneBoxes: [...zones.flatMap(zone => zone.boxes), ...dressing.boxes, ...dressing.surfaces] });
      cleanup.push(() => composition.dispose());
      const horizon = zones.find(zone => zone.zoneId === "horizon")!;
      const added = meshes(horizon.group).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0) - 1262;
      for (const t of [0, 0.9]) {
        composition.update(pathPointAt(t), 0);
        let after = 0;
        scene.traverseVisible(node => {
          if (node instanceof Mesh) after += Math.min(node.geometry.drawRange.count,
            node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3 * (node instanceof InstancedMesh ? node.count : 1);
        });
        const before = after - added;
        reportBudget("tests/unit/world/zones/horizon.test.ts:264 after", after, before * 1.25);
        process.stdout.write(`GFX-Z-horizon High world t=${t}: ${before} -> ${after} triangles; horizon delta=${added}\n`);
      }
      // Report host timing; keep the correctness gate independent of other workers' CPU load.
      process.stdout.write(`GFX-Z-horizon Node construction median (25 builds): ${samples.sort((a, b) => a - b)[12]!.toFixed(3)} ms\n`);
    } finally { cleanup.reverse().forEach(dispose => dispose()); }
  }, 60_000);

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
        && Math.abs(p.y - slope.heightAt(p.x, p.z) + 0.04) < 0.00001);
      expect(feet.length).toBeGreaterThan(2);
      // Existing physics boxes retain their ground-level floor above the buried geometry.
      expect(box.center.y - box.size.y / 2).toBeLessThanOrEqual(Math.min(...feet.map(p => p.y)) + 0.10001);
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
    expect(lens.geometry.getAttribute("position").count / 3).toBe(12);
    // Two seaward lens faces, ahead of the pedestal; HTML owns the labels.
    expect(lens.geometry.boundingBox!.min.x).toBeGreaterThan(point.x);
  });

  it("preserves palette pigments with matte PBR housings and neutral multiplying washes", () => {
    const scene = create();
    const color = (base: keyof typeof PALETTE, mix: keyof typeof PALETTE, amount: number) =>
      new Color(PALETTE[base]).lerp(new Color(PALETTE[mix]), amount);
    const expected: Record<string, Color> = {
      natural: new Color().setRGB(1, 1, 1),
      paint: color("cloud", "rock", 0.22), white: new Color(PALETTE.paper),
      iron: color("rockDark", "ink", 0.32), lens: new Color(PALETTE.seaDeep),
    };
    for (const mesh of meshes(scene.group)) {
      expect(mesh.name).not.toMatch(/text|logo/i);
      if (mesh.name === "horizon-dressing") {
        expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
        expect((mesh.material as unknown as MeshStandardMaterial).roughness).toBeGreaterThanOrEqual(0.9);
        continue; // CC0 source pigments and photo cutout are covered by dressing tests.
      }
      if (mesh.name === "horizon-natural") expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
      else {
        expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
        const pbr = mesh.material as unknown as MeshStandardMaterial;
        expect(pbr.roughness).toBeGreaterThanOrEqual(0.48);
        expect(pbr.metalness).toBeLessThanOrEqual(0.18);
      }
      expect(mesh.material.color.getHex()).toBe(expected[mesh.name.slice("horizon-".length)]!.getHex());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.emissive.getHex()).toBe(0);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.map).toBeNull();
      if (mesh.name === "horizon-natural") expect(mesh.material.customProgramCacheKey()).toMatch(/\|painted-prop-readable-v2$/);
      const colors = mesh.geometry.getAttribute("color");
      expect(colors.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < colors.count; i++) {
        if (mesh.name === "horizon-natural") continue; // Kit pigments are checked separately below.
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
    const ramp = (scene.group.getObjectByName("horizon-natural") as PaintedMesh).material.gradientMap!;
    expect((sibling.group.getObjectByName("horizon-natural") as PaintedMesh).material.gradientMap).toBe(ramp);
    const shared = vi.spyOn(ramp, "dispose");
    scene.dispose();
    const before = transforms(scene.group);
    scene.dispose();
    scene.update!(10, false);
    expect(transforms(scene.group)).toEqual(before);
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(shared).not.toHaveBeenCalled();
    expect(signature(create())).toEqual(signature(sibling));
  });
});
