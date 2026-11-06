import { Box3, Color, Mesh, PerspectiveCamera, Raycaster, Vector3, type BufferGeometry, type MeshToonMaterial } from "three";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { waterLevelAt } from "../../../../src/features/world/terrain/height";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createQuietShoreScene } from "../../../../src/features/world/zones/quiet-shore";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

type PaintedMesh = Mesh<BufferGeometry, MeshToonMaterial>;
const owned: ZoneScene[] = [];
const flat: ZoneSceneContext = {
  heightAt: () => 0,
  onPath: x => Math.abs(x) <= PATH_CLEARANCE,
  underWater: x => x > 11,
  seed: 107,
};
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createQuietShoreScene({ ...flat, ...overrides });
  owned.push(scene);
  return scene;
}
function meshes(scene: ZoneScene): PaintedMesh[] {
  const result: PaintedMesh[] = [];
  scene.group.traverse(node => { if (node instanceof Mesh) result.push(node as PaintedMesh); });
  return result;
}
function vertices(scene: ZoneScene) {
  scene.group.updateMatrixWorld(true);
  return meshes(scene).flatMap(mesh => {
    const positions = mesh.geometry.getAttribute("position");
    return Array.from({ length: positions.count }, (_, i) => new Vector3()
      .fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  });
}
function propVertices(scene: ZoneScene, name: string, batch?: string) {
  const node = scene.group.getObjectByName(name)!;
  expect(node).toBeDefined();
  scene.group.updateMatrixWorld(true);
  const ranges = node.userData.batches as { mesh: string; start: number; count: number }[];
  return ranges.filter(range => !batch || range.mesh === `quiet-shore-${batch}`).flatMap(range => {
    const mesh = scene.group.getObjectByName(range.mesh) as PaintedMesh;
    const positions = mesh.geometry.getAttribute("position");
    expect(range.start % 3).toBe(0);
    expect(range.count % 3).toBe(0);
    expect(range.start + range.count).toBeLessThanOrEqual(positions.count);
    return Array.from({ length: range.count }, (_, i) => new Vector3()
      .fromBufferAttribute(positions, range.start + i).applyMatrix4(mesh.matrixWorld));
  });
}
function signature(scene: ZoneScene) {
  return {
    zoneId: scene.zoneId, interactable: scene.interactable, colliders: scene.colliders,
    meshes: meshes(scene).map(mesh => ({
      name: mesh.name, position: mesh.position.toArray(), rotation: mesh.quaternion.toArray(), scale: mesh.scale.toArray(),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes)
        .map(([key, value]) => [key, Array.from(value.array)])),
      indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
      groups: mesh.geometry.groups, color: mesh.material.color.toArray(),
    })),
  };
}

afterEach(() => {
  owned.splice(0).forEach(scene => scene.dispose());
  disposeRampGradients();
  vi.restoreAllMocks();
});

describe("quiet-shore procedural place", () => {
  it("reports the static scene budget and interaction contract", () => {
    const scene = create();
    const counts = meshes(scene).map(mesh => [mesh.name, mesh.geometry.getAttribute("position").count / 3]);
    const contract = createHash("sha256").update(JSON.stringify({
      colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex");
    expect(contract).toBe("cb368a918f4c02fee28e8c7cf5bedf934567b9c369ca6b734b7dbdb067787d18");
    const props = scene.group.children.filter(node => node.userData.batches).map(node => [node.name, propVertices(scene, node.name).length / 3]);
    process.stdout.write(`B2-207: ${JSON.stringify(counts)}; props=${JSON.stringify(props)}; contract unchanged\n`);
  });
  it("keeps every prop cluster and seed variant within the round-four budgets", () => {
    for (const seed of [0, 1, 2, 107, 108, 177, 2026, 0xffffffff]) {
      const scene = create({ seed });
      const triangles = meshes(scene).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
      expect(triangles).toBeLessThanOrEqual(3693 * 1.5);
      expect(meshes(scene).length).toBeLessThanOrEqual(8);
      for (const node of scene.group.children.filter(node => node.userData.batches)) {
        expect(propVertices(scene, node.name).length / 3).toBeLessThanOrEqual(node.name.startsWith("fence-") ? 600 : 2000);
      }
    }
  });
  it("places the complete zone collection on the rendered terrain", () => {
    const placed = placeZoneScenes(surfaceHeight);
    try {
      const shore = placed.find(zone => zone.zoneId === "quiet-shore")!;
      expect(shore).toBeDefined();
      expect(shore.group.getObjectByName("quiet-shore-cream")).toBeDefined();
      expect(propVertices(shore, "piano").length).toBeGreaterThan(0);
      expect(propVertices(shore, "dog").length).toBeGreaterThan(0);
      const anchor = shore.group.position;
      const forward = new Vector3(shore.layout.lookDirection.x, 0, shore.layout.lookDirection.z).normalize();
      const right = new Vector3(forward.z, 0, -forward.x);
      const side = Math.sign(right.dot(shore.target.position.clone().sub(anchor)));
      // Reproduce the two tour cameras, and reserve a visible sea window beside the porch.
      for (const view of ["approach", "wide"]) {
        const eye = anchor.clone().addScaledVector(forward, view === "wide" ? -26 : -11)
          .addScaledVector(right, -side * (view === "wide" ? 10 : 3));
        eye.y = surfaceHeight(eye.x, eye.z) + (view === "wide" ? 9 : 3.4);
        const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 320);
        camera.position.copy(eye);
        camera.lookAt(view === "wide" ? anchor.clone().setY(anchor.y + 2)
          : shore.target.position.clone().setY(shore.target.position.y + 0.5));
        camera.updateMatrixWorld(true);
        const sea = new Vector3(-30, 0, -940);
        expect(surfaceHeight(sea.x, sea.z)).toBeLessThan(waterLevelAt(sea.z));
        const screen = sea.clone().project(camera);
        expect(Math.abs(screen.x)).toBeLessThan(0.9);
        expect(Math.abs(screen.y)).toBeLessThan(0.9);
        expect(screen.z).toBeGreaterThan(-1);
        expect(screen.z).toBeLessThan(1);
        const ray = new Raycaster(eye, sea.clone().sub(eye).normalize(), 0, eye.distanceTo(sea));
        expect(ray.intersectObjects(meshes(shore))).toHaveLength(0);
        for (let t = 0.02; t < 1; t += 0.02) {
          const p = eye.clone().lerp(sea, t);
          expect(surfaceHeight(p.x, p.z), `${view} sea sightline at ${p.toArray()}`).toBeLessThan(p.y);
        }
      }
      // Batches repeat vertices at flat-shaded seams; query each footprint only once.
      const terrain = new Map<string, number>();
      for (const p of new Map(vertices(shore).map(p => [p.toArray().join(","), p])).values()) {
        const key = `${p.x},${p.z}`;
        let ground = terrain.get(key);
        if (ground === undefined) { ground = surfaceHeight(p.x, p.z); terrain.set(key, ground); }
        expect(p.y, `buried vertex ${p.toArray()}`).toBeGreaterThanOrEqual(ground - 0.101);
        expect(ground).toBeGreaterThan(waterLevelAt(p.z));
      }
      console.info(`quiet-shore real target: ${shore.interactable.position.toArray()}; world: ${shore.target.position.toArray()}`);
    } finally {
      placed.forEach(zone => zone.dispose());
    }
  }, 30_000); // This integration case builds all eight scenes on the real terrain.
  it("merges every pigment into one draw call and stays within all zone budgets", () => {
    const scene = create();
    const batches = meshes(scene);
    const triangles = batches.reduce((sum, mesh) => sum
      + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
    const drawCalls = batches.reduce((sum, mesh) => sum + Math.max(1, mesh.geometry.groups.length), 0);
    expect(triangles).toBeGreaterThan(500);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(triangles).toBeLessThanOrEqual(3693 * 1.5); // Pre-r4 seed 107: 3693 triangles.
    expect(drawCalls).toBe(7);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(batches.map(mesh => mesh.material)).size).toBe(batches.length);
    for (const point of vertices(scene)) expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    for (const mesh of batches) {
      expect(mesh.geometry.groups).toEqual([]);
      expect(mesh.geometry.boundingBox).not.toBeNull();
      expect(mesh.geometry.boundingSphere).not.toBeNull();
    }
    console.info(`quiet-shore: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("repeats geometry, pigments, transforms and placement with an isolated seed", () => {
    const first = signature(create());
    create({ seed: 23 });
    expect(signature(create())).toEqual(first);
    expect(signature(create({ seed: 108 }))).not.toEqual(first);
  });

  it("parks one cream step-through beside the porch within its 600-triangle allowance", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const side = Math.sign(scene.interactable.position.x);
      const envelope = new Box3(new Vector3(side > 0 ? 4.7 : -6, -0.03, 4.67),
        new Vector3(side > 0 ? 6 : -4.7, 1.25, 7.03));
      const bike: Vector3[] = [];
      for (const mesh of meshes(scene)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i += 3) {
          const triangle = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(positions, i + j));
          if (triangle.every(p => envelope.containsPoint(p))) bike.push(...triangle);
        }
      }
      const triangles = bike.length / 3;
      expect(triangles).toBe(508);
      expect(triangles).toBeLessThanOrEqual(600);
      const cream = scene.group.getObjectByName("quiet-shore-cream") as PaintedMesh;
      const creamPositions = cream.geometry.getAttribute("position");
      // Cream now also paints the piano keys; keep the bike check within its own envelope.
      const bikeCream = Array.from({ length: creamPositions.count }, (_, i) =>
        new Vector3().fromBufferAttribute(creamPositions, i)).filter(p => envelope.containsPoint(p));
      expect(bikeCream.length).toBeGreaterThan(0);
      const keys = new Box3().setFromPoints(propVertices(scene, "piano", "cream")).expandByScalar(0.0001);
      for (let i = 0; i < creamPositions.count; i++) {
        const p = new Vector3().fromBufferAttribute(creamPositions, i);
        expect(envelope.containsPoint(p) || keys.containsPoint(p)).toBe(true);
      }
      const box = new Box3().setFromPoints(bike);
      expect(box.getSize(new Vector3()).z).toBeGreaterThan(1.8);
      expect(box.getSize(new Vector3()).y).toBeGreaterThan(1);
      for (const z of [5.19, 6.51]) {
        const tyre = bike.filter(p => Math.abs(p.z - z) < 0.12 && p.y < 0.1);
        expect(tyre.length).toBeGreaterThan(0);
        expect(Math.min(...tyre.map(p => p.y))).toBeLessThan(0.02);
      }
      const collider = scene.colliders.find(box => Math.abs(box.center.z - 5.85) < 0.001)!;
      expect(collider).toBeDefined();
      const collision = new Box3().setFromCenterAndSize(collider.center, collider.size);
      expect(collision.expandByScalar(0.0001).containsBox(box)).toBe(true);
      console.info(`quiet-shore parked bike: ${triangles} triangles`);
    }
  });

  for (const [name, overrides] of [
    ["flat shore", {}],
    ["sloping shore", { heightAt: (x: number, z: number) => x * 0.035 + z * 0.02 }],
    ["opposite dry bank", { underWater: (x: number) => x > 3 }],
    ["curved walking path", { onPath: (x: number, z: number) => Math.abs(x) <= 2.6 || (x > 3 && Math.abs(z) < 2.4) }],
    ["wet porch interior", { underWater: (x: number, z: number) => x > 11 || (x > 5.6 && x < 6.2 && Math.abs(z) < 0.3) }],
  ] as const) {
    it(`${name}: keeps full geometry, triangle interiors and colliders off the path and water`, () => {
      const context = { ...flat, ...overrides };
      const scene = create(overrides);
      const points = vertices(scene);
      // Non-indexed batches preserve triples; a centroid check also catches spanning rails/roof faces.
      const samples = [...points];
      for (let i = 0; i < points.length; i += 3) {
        samples.push(points[i]!.clone().add(points[i + 1]!).add(points[i + 2]!).divideScalar(3));
      }
      for (const p of samples) {
        expect(Math.abs(p.x)).toBeGreaterThan(PATH_CLEARANCE);
        expect(context.onPath(p.x, p.z)).toBe(false);
        expect(context.underWater(p.x, p.z)).toBe(false);
        expect(p.y).toBeGreaterThanOrEqual(context.heightAt(p.x, p.z) - 0.101);
        expect(p.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
      }
      expect(scene.colliders.length).toBeGreaterThan(4);
      for (const box of scene.colliders) {
        expect(box.yaw ?? 0).toBe(0);
        expect(box.size.toArray().every(size => size > 0)).toBe(true);
        for (let u = -1; u <= 1; u += 0.25) {
          for (let v = -1; v <= 1; v += 0.25) {
            const x = box.center.x + box.size.x / 2 * u, z = box.center.z + box.size.z / 2 * v;
            expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE);
            expect(context.onPath(x, z)).toBe(false);
            expect(context.underWater(x, z)).toBe(false);
          }
        }
      }
    });
  }

  it("grounds all four porch feet at heightAt on either bank", () => {
    for (const side of [1, -1]) {
      const heightAt = (x: number, z: number) => 0.035 * x + 0.02 * z;
      const scene = create({ heightAt, underWater: x => side * x < 3 });
      const wood = scene.group.getObjectByName("quiet-shore-wood") as PaintedMesh;
      const positions = wood.geometry.getAttribute("position");
      for (const x of [-1.24, 1.24]) {
        for (const z of [-1.42, 1.42]) {
          const px = side * (6 + x), pz = 9 + side * z;
          const foot = new Box3();
          for (let i = 0; i < positions.count; i++) {
            const p = new Vector3().fromBufferAttribute(positions, i);
            if (Math.abs(p.x - px) < 0.14 && Math.abs(p.z - pz) < 0.14) foot.expandByPoint(p);
          }
          expect(foot.isEmpty()).toBe(false);
          expect(Math.abs(foot.min.y - (heightAt(px, pz) - 0.04))).toBeLessThan(0.008);
          expect(foot.max.y - foot.min.y).toBeGreaterThan(2.4);
        }
      }
    }
  });

  it("keeps the piano target two metres from the corridor and within E reach at its edge", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const p = scene.interactable.position;
      const distance = Math.abs(p.x) - PATH_CLEARANCE;
      expect(distance).toBeGreaterThanOrEqual(2);
      expect(distance).toBeLessThanOrEqual(6);
      expect(p.distanceTo(new Vector3(Math.sign(p.x) * PATH_CLEARANCE, 1.6, p.z))).toBeLessThanOrEqual(2.5);
      expect(underWater(p.x, p.z)).toBe(false);
      expect(scene.zoneId).toBe("quiet-shore");
      expect(scene.interactable.label).toEqual({ vi: "Piano trên hiên hướng biển", en: "Piano on the seaside porch" });
    }
    expect(create().interactable.position.toArray()).toEqual([4.79, 1.05, 9.35]);
  });

  it("has an open straight roof, hanging guitar, radio and a compact wooden porch bench", () => {
    const scene = create();
    const roof = new Box3().setFromObject(scene.group.getObjectByName("quiet-shore-roof")!);
    const body = scene.group.getObjectByName("quiet-shore-guitar") as PaintedMesh;
    const ink = scene.group.getObjectByName("quiet-shore-ink") as PaintedMesh;
    expect(roof.min.y).toBeGreaterThan(2.5);
    expect(roof.getSize(new Vector3()).y).toBeLessThan(0.4);
    const bodyBounds = new Box3();
    const guitarPositions = body.geometry.getAttribute("position");
    for (let i = 0; i < guitarPositions.count; i++) {
      const p = new Vector3().fromBufferAttribute(guitarPositions, i);
      if (p.x > 4.5 && p.x < 4.9 && p.z > 7.8 && p.z < 8.3) bodyBounds.expandByPoint(p);
    }
    expect(bodyBounds.min.y).toBeGreaterThan(0.8);
    expect(bodyBounds.max.y).toBeGreaterThan(1.7);
    expect(bodyBounds.getSize(new Vector3()).y).toBeLessThan(1);
    const radio = new Box3();
    const inkPositions = ink.geometry.getAttribute("position");
    for (let i = 0; i < inkPositions.count; i++) {
      const p = new Vector3().fromBufferAttribute(inkPositions, i);
      if (p.z > 7.1) radio.expandByPoint(p);
    }
    expect(radio.min.x).toBeLessThan(4.1);
    expect(radio.min.y).toBeGreaterThan(0.25);
    expect(scene.group.getObjectByName("quiet-shore-leaf")).toBeDefined();
    const bench = new Box3().setFromPoints(propVertices(scene, "porch-bench"));
    expect(bench.min.y).toBeCloseTo(0.23);
    expect(bench.getSize(new Vector3()).z).toBeGreaterThan(1.5);
    expect(bench.getSize(new Vector3()).y).toBeGreaterThan(0.85);
    const stool = new Box3().setFromPoints(propVertices(scene, "piano-stool"));
    expect(stool.min.y).toBeCloseTo(0.25);
    expect(stool.getSize(new Vector3()).y).toBeGreaterThan(0.4);
    scene.group.traverse(node => expect(node.name).not.toMatch(/text|logo/i));
  });

  it("makes an upright piano with an open lid and light/dark keys the main instrument on either bank", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const piano = new Box3().setFromPoints(propVertices(scene, "piano"));
      const size = piano.getSize(new Vector3());
      expect(size.y).toBeGreaterThan(1.4);
      expect(size.z).toBeGreaterThan(1.25);
      expect(size.x).toBeLessThan(0.7);
      expect(piano.min.y).toBeCloseTo(0.25);
      const collider = scene.colliders.find(box => Math.abs(box.size.y - 1.46) < 0.001)!;
      expect(new Box3().setFromCenterAndSize(collider.center, collider.size)
        .expandByScalar(0.0001).containsBox(piano)).toBe(true);
      const keys = new Box3().setFromPoints(propVertices(scene, "piano", "cream"));
      expect(keys.getSize(new Vector3()).z).toBeGreaterThan(1);
      expect(keys.getSize(new Vector3()).y).toBeLessThan(0.04);
      const darkKeys = propVertices(scene, "piano", "ink").filter(p => p.y > keys.max.y && p.y < 1.08);
      expect(darkKeys.length).toBeGreaterThan(0);
      const lid = propVertices(scene, "piano", "piano").filter(p => p.y > 1.48);
      const lidBounds = new Box3().setFromPoints(lid);
      expect(lidBounds.getSize(new Vector3()).y).toBeGreaterThan(0.18);
      expect(lidBounds.getSize(new Vector3()).z).toBeGreaterThan(1.25);
    }
  });

  it("curls one softly modelled adult dog on the step beside the unchanged radio", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const points = propVertices(scene, "dog");
      const triangles = points.length / 3;
      const dog = new Box3().setFromPoints(points);
      expect(triangles).toBeGreaterThan(100);
      expect(triangles).toBeLessThanOrEqual(400);
      expect(dog.min.y).toBeCloseTo(0.15);
      expect(dog.getSize(new Vector3()).y).toBeLessThan(0.35);
      expect(dog.getSize(new Vector3()).z).toBeGreaterThan(0.6);
      expect(dog.getSize(new Vector3()).x).toBeGreaterThan(0.4);
      expect(propVertices(scene, "dog", "ink")).toHaveLength(0);
      expect(scene.group.children.filter(node => node.name === "dog")).toHaveLength(1);
      const collider = scene.colliders.find(box => Math.abs(box.size.x - 0.56) < 0.001)!;
      expect(new Box3().setFromCenterAndSize(collider.center, collider.size)
        .expandByScalar(0.0001).containsBox(dog)).toBe(true);
      console.info(`quiet-shore sleeping dog: ${triangles} triangles`);
    }
  });

  it("keeps the kit's eight tiny orange flowers visible on the shore-facing fence", () => {
    const flowerColor = new Color(PALETTE.flower);
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      scene.group.updateMatrixWorld(true);
      const wood = scene.group.getObjectByName("quiet-shore-wood") as PaintedMesh;
      const colors = wood.geometry.getAttribute("color"), positions = wood.geometry.getAttribute("position");
      const petals: Vector3[] = [];
      for (let i = 0; i < colors.count; i += 3) {
        const color = new Color().fromBufferAttribute(colors, i).multiply(wood.material.color);
        if (color.toArray().every((value, channel) => Math.abs(value - flowerColor.toArray()[channel]!) < 1e-6)) {
          for (let j = 0; j < 3; j++) petals.push(new Vector3().fromBufferAttribute(positions, i + j));
        }
      }
      expect(petals.length / 24).toBe(8);
      let visible = 0;
      for (let start = 0; start < petals.length; start += 24) {
        const box = new Box3().setFromPoints(petals.slice(start, start + 24));
        const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
        expect(size.y).toBeGreaterThan(0.04);
        expect(size.y).toBeLessThan(0.07);
        expect(size.z).toBeLessThan(0.15);
        const eye = new Vector3(Math.sign(center.x) * PATH_CLEARANCE, 1.6, center.z);
        const hit = new Raycaster(eye, center.clone().sub(eye).normalize()).intersectObjects(meshes(scene))[0];
        if (hit && hit.point.distanceTo(center) < 0.08) visible++;
      }
      expect(visible).toBeGreaterThanOrEqual(4);
    }
  });

  it("preserves the whole radio at 1.5 scale on the step and keeps the piano target visible", () => {
    for (const underWater of [flat.underWater, (x: number) => x > 3]) {
      const scene = create({ underWater });
      const side = Math.sign(scene.interactable.position.x);
      const box = scene.colliders.find(box => Math.abs(box.center.x - side * 4.24) < 0.001
        && box.size.y > 0.8)!;
      expect(box).toBeDefined();
      expect(box.size.x).toBeCloseTo(0.39 * 1.5);
      expect(box.size.y).toBeCloseTo(0.61 * 1.5);
      expect(box.size.z).toBeCloseTo(0.7 * 1.5);
      const radio = new Box3();
      const envelope = new Box3().setFromCenterAndSize(box.center, box.size).expandByScalar(0.00001);
      for (const p of vertices(scene)) {
        if (envelope.containsPoint(p)) radio.expandByPoint(p);
      }
      expect(radio.min.y).toBeCloseTo(0.15);
      expect(radio.max.y - 0.15).toBeCloseTo(0.61 * 1.5);
      expect(radio.getSize(new Vector3()).x).toBeCloseTo((0.145 + 0.175 + 0.035 / 2) * 1.5);
      expect(radio.getSize(new Vector3()).z).toBeCloseTo(0.68 * 1.5);
      expect(box.center.y - box.size.y / 2).toBeCloseTo(0.15);
      const target = scene.interactable.position;
      const eye = new Vector3(side * PATH_CLEARANCE, 1.6, target.z);
      const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
      const hit = ray.intersectObjects(meshes(scene))[0]!;
      const piano = new Box3().setFromPoints(propVertices(scene, "piano"));
      expect(piano.expandByScalar(0.0001).containsPoint(hit.point)).toBe(true);
      expect(hit.point.distanceTo(target)).toBeLessThan(0.25);
    }
  });

  it("paints the actual roof underside ink while weathering its white top", () => {
    const scene = create();
    scene.group.updateMatrixWorld(true);
    const below = new Raycaster(new Vector3(6, 2, 9.2325), new Vector3(0, 1, 0));
    const above = new Raycaster(new Vector3(6, 4, 9.2325), new Vector3(0, -1, 0));
    expect(below.intersectObjects(meshes(scene))[0]?.object.name).toBe("quiet-shore-ink");
    expect(above.intersectObjects(meshes(scene))[0]?.object.name).toBe("quiet-shore-roof");
  });

  it("uses palette-only pigments without tinting kit colours twice, and matte ramp materials", () => {
    const scene = create();
    const colors: Record<string, Color> = {
      wood: new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.62),
      roof: new Color(PALETTE.cloud).lerp(new Color(PALETTE.rock), 0.32),
      leaf: new Color(PALETTE.grass),
      piano: new Color(PALETTE.rockDark).lerp(new Color(PALETTE.ink), 0.45),
      guitar: new Color(PALETTE.dusk).lerp(new Color(PALETTE.sand), 0.45),
      ink: new Color(PALETTE.ink),
      flower: new Color(PALETTE.flower),
      cream: new Color(PALETTE.cloud),
    };
    const woodEnds = [PALETTE.rock, PALETTE.rockDark].map(color => new Color(color).lerp(new Color(PALETTE.dusk), 0.08));
    const pairs = [
      woodEnds,
      woodEnds.map(color => color.clone().lerp(new Color(PALETTE.cloud), 0.32)),
      woodEnds.map(color => color.clone().lerp(new Color(PALETTE.rockDark), 0.72)),
      [new Color(PALETTE.forestDeep), new Color(PALETTE.forestLight)],
      [new Color(PALETTE.forestDeep), new Color(PALETTE.grass)],
      [new Color(PALETTE.sand), new Color(PALETTE.rockDark)],
      [new Color(PALETTE.flower), new Color(PALETTE.flower)],
    ];
    const onPaletteSegment = (color: Color) => pairs.some(pair => {
      const a = new Vector3(...pair[0]!.toArray()), b = new Vector3(...pair[1]!.toArray());
      const p = new Vector3(...color.toArray()), direction = b.clone().sub(a);
      const t = direction.lengthSq() ? Math.max(0, Math.min(1, p.clone().sub(a).dot(direction) / direction.lengthSq())) : 0;
      return p.distanceTo(a.addScaledVector(direction, t)) < 1e-6;
    });
    for (const mesh of meshes(scene)) {
      const key = mesh.name.replace("quiet-shore-", "");
      expect(mesh.material.color.toArray()).toEqual(colors[key]!.toArray());
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.emissive.getHex()).toBe(0);
      expect(mesh.material.map).toBeNull();
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.customProgramCacheKey()).toMatch(/\|painted-prop-readable-v2$/);
      const wash = mesh.geometry.getAttribute("color");
      expect(wash.count).toBe(mesh.geometry.getAttribute("position").count);
      for (let i = 0; i < wash.count; i++) {
        const neutral = wash.getX(i) >= 0.914 && wash.getX(i) <= 1
          && wash.getY(i) === wash.getX(i) && wash.getZ(i) === wash.getX(i);
        const effective = new Color().fromBufferAttribute(wash, i).multiply(mesh.material.color);
        expect(neutral || onPaletteSegment(effective), `${mesh.name}: ${effective.toArray()}`).toBe(true);
        expect(effective.toArray().every(value => value >= 0 && value <= 1)).toBe(true);
      }
      for (const attribute of ["position", "normal", "color"]) {
        expect(Array.from(mesh.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps ink near ten percent and orange below one percent of actual surface area", () => {
    let total = 0, accent = 0, ink = 0;
    for (const mesh of meshes(create())) {
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(positions, i);
        const b = new Vector3().fromBufferAttribute(positions, i + 1);
        const c = new Vector3().fromBufferAttribute(positions, i + 2);
        const area = b.sub(a).cross(c.sub(a)).length() / 2;
        expect(area).toBeGreaterThan(1e-10);
        total += area;
        const color = new Color().fromBufferAttribute(mesh.geometry.getAttribute("color"), i).multiply(mesh.material.color);
        if (color.toArray().every((value, channel) => Math.abs(value - new Color(PALETTE.flower).toArray()[channel]!) < 1e-6)) accent += area;
        if (mesh.material.color.equals(new Color(PALETTE.ink))) ink += area;
      }
    }
    expect(accent).toBeGreaterThan(0);
    expect(accent / total).toBeLessThan(0.01);
    expect(ink / total).toBeGreaterThan(0.08);
    expect(ink / total).toBeLessThan(0.16);
  });

  it("leaves all transforms and geometry unchanged with reducedMotion, including after normal updates", () => {
    const scene = create();
    const before = signature(scene);
    scene.update?.(1 / 60, false);
    scene.update?.(60, true);
    scene.update?.(1 / 30, true);
    expect(signature(scene)).toEqual(before);
  });

  it("skips wet fence/grass footprints and refuses a shore with no dry porch site", () => {
    const scene = create({ underWater: x => x > 8.3 });
    expect(scene.interactable.position.x).toBeGreaterThan(0);
    for (const p of vertices(scene)) expect(p.x).toBeLessThanOrEqual(8.3);
    expect(scene.group.getObjectByName("quiet-shore-flower")).toBeUndefined();
    expect(() => create({ underWater: () => true })).toThrow(/dry porch footprint/);
    expect(() => create({ onPath: () => true })).toThrow(/dry porch footprint/);
  });

  it("disposes every owned geometry/material once while preserving siblings and shared ramps", () => {
    const scene = create(), sibling = create();
    const resources = meshes(scene).flatMap(mesh => [mesh.geometry, mesh.material]);
    const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
    const siblingSpies = meshes(sibling).flatMap(mesh => [mesh.geometry, mesh.material])
      .map(resource => vi.spyOn(resource, "dispose"));
    const ramp = meshes(scene)[0]!.material.gradientMap!;
    const rampSpy = vi.spyOn(ramp, "dispose");
    scene.dispose();
    scene.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    siblingSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(rampSpy).not.toHaveBeenCalled();
    expect(signature(create())).toEqual(signature(sibling));
  });
});
