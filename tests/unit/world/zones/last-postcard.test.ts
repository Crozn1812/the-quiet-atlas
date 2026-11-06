import { Box3, Color, Group, Light, Mesh, MeshToonMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { PATH_WIDTH, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import * as rockKit from "../../../../src/features/world/props/rocks";
import * as woodKit from "../../../../src/features/world/props/wood";
import { placeZoneScenes } from "../../../../src/features/world/zones";
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

function meshVertices(mesh: PaintedMesh): Vector3[] {
  const positions = mesh.geometry.getAttribute("position");
  return Array.from({ length: positions.count }, (_, i) => new Vector3()
    .fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
}

function vertices(scene: ZoneScene): Vector3[] {
  scene.group.updateMatrixWorld(true);
  return meshes(scene.group).flatMap(meshVertices);
}

/** Recover each stone from the rendered pigment batch, including its transformed faces. */
function stoneParts(points: Vector3[]) {
  const parents = points.map((_, i) => i);
  function root(i: number): number {
    if (parents[i] !== i) parents[i] = root(parents[i]!);
    return parents[i]!;
  }
  const shared = new Map<string, number>();
  points.forEach((point, i) => {
    const face = i - i % 3;
    const key = point.toArray().map(value => value.toFixed(5)).join(",");
    const previous = shared.get(key);
    if (previous !== undefined) parents[root(face)] = root(previous);
    shared.set(key, face);
  });
  const parts = new Map<number, Vector3[]>();
  for (let i = 0; i < points.length; i += 3) {
    const id = root(i), part = parts.get(id) ?? [];
    part.push(...points.slice(i, i + 3));
    parts.set(id, part);
  }
  return [...parts.values()].map(part => ({
    bounds: new Box3().setFromPoints(part),
    faces: Array.from({ length: part.length / 3 }, (_, i) => {
      const a = part[i * 3]!, b = part[i * 3 + 1]!, c = part[i * 3 + 2]!;
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      return { a, normal: cross.normalize() };
    }),
  }));
}

/** A palette blend with the zone's 0.92–1 paper wash, in linear colour space. */
function paletteBlend(color: Color, a: Color, b = a): boolean {
  const start = new Vector3(a.r, a.g, a.b), delta = new Vector3(b.r - a.r, b.g - a.g, b.b - a.b);
  const point = new Vector3(color.r, color.g, color.b);
  if (delta.lengthSq() < 1e-12) {
    const wash = point.dot(start) / start.lengthSq();
    return wash >= 0.9199 && wash <= 1.0001 && point.distanceTo(start.multiplyScalar(wash)) < 1e-6;
  }
  const aa = start.lengthSq(), ab = start.dot(delta), bb = delta.lengthSq(), det = aa * bb - ab * ab;
  const wash = (point.dot(start) * bb - point.dot(delta) * ab) / det;
  const blend = (point.dot(delta) * aa - point.dot(start) * ab) / det;
  return wash >= 0.9199 && wash <= 1.0001 && blend >= -1e-6 && blend <= wash + 1e-6
    && point.distanceTo(start.multiplyScalar(wash).addScaledVector(delta, blend)) < 1e-6;
}

/** Include collider interiors so a shoreline/path cutting through a box cannot pass on corner checks alone. */
function expectSafe(scene: ZoneScene, context: ZoneSceneContext) {
  const boxes = scene.colliders.map(collider => new Box3().setFromCenterAndSize(collider.center, collider.size));
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  scene.group.updateMatrixWorld(true);
  const points = meshes(scene.group).flatMap(mesh => meshVertices(mesh).map(point => ({
    point, grassPigment: /forestLight|forestDeep/.test(mesh.name),
  })));
  for (const { point, grassPigment } of points) {
    expect(Math.abs(point.x)).toBeGreaterThan(PATH_CLEARANCE);
    expect(context.onPath(point.x, point.z)).toBe(false);
    expect(context.underWater(point.x, point.z)).toBe(false);
    expect(point.length()).toBeLessThanOrEqual(ZONE_BUDGET.radius);
    const covered = boxes.some(box => {
      const buried = box.clone().expandByScalar(1e-5);
      buried.min.y -= 0.06;
      return buried.containsPoint(point);
    });
    // Soft shore grass is walk-through; all furniture, rocks and fence remain boxed.
    if (!covered) {
      expect(grassPigment, `unboxed solid vertex ${point.toArray()}`).toBe(true);
      expect(point.y - context.heightAt(point.x, point.z)).toBeLessThanOrEqual(0.8);
    }
    expect(point.y).toBeGreaterThanOrEqual(context.heightAt(point.x, point.z) - 0.06001);
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
  expect(y).toBeCloseTo(boxes[0]!.max.y + 1.55 * 1.3, 6);
  // The mailbox itself must be the first visible surface from the path, including mirrored sites.
  const direction = new Vector3().subVectors(scene.interactable.position, player).normalize();
  const hit = new Raycaster(player, direction, 0, 2.5).intersectObject(scene.group, true)[0];
  expect(hit).toBeDefined();
  expect(boxes[1]!.clone().expandByScalar(1e-5).containsPoint(hit!.point)).toBe(true);
}

describe("last-postcard shore scene", () => {
  it("exports the contact zone with the mailbox's EN/VI labels", () => {
    const { scene } = create();
    expect(scene.zoneId).toBe("last-postcard");
    expect(scene.group).toBeInstanceOf(Group);
    expect(scene.group.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.interactable.position.x).toBeCloseTo(4.75, 6);
    expect(scene.interactable.position.y).toBeCloseTo(2.135, 6);
    expect(scene.interactable.position.z).toBe(-0.45);
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
    expect(triangles).toBeLessThanOrEqual(1670 * 1.5);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(meshes(scene.group).map(mesh => mesh.material)).size).toBe(drawCalls);
    console.info(`last-postcard: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("keeps the mailbox, rack and 3.2 m lamp on the original footprint with a buried stone footing", () => {
    const { scene } = create();
    const [platform, mailbox, rack, lamp] = scene.colliders;
    expect(platform!.size.toArray()).toEqual([2, 0.12, 3]);
    const deckTop = platform!.center.y + platform!.size.y / 2;
    const paper = meshes(scene.group).find(mesh => mesh.name.endsWith("paper"))!;
    const groundStones = meshVertices(paper).filter(point => point.y <= deckTop + 1e-5
      && Math.abs(point.x - platform!.center.x) <= 1.00001 && Math.abs(point.z - platform!.center.z) <= 1.50001);
    const deckBounds = new Box3().setFromPoints(groundStones);
    expect(deckBounds.getSize(new Vector3()).toArray()).toEqual([
      expect.closeTo(2, 5), expect.closeTo(0.17, 5), expect.closeTo(3, 5),
    ]);
    expect(deckBounds.min.y).toBeCloseTo(-0.05, 6);
    const allPoints = vertices(scene);
    expect(Math.max(...allPoints.map(point => point.y)) - deckTop).toBeCloseTo(3.2, 5);
    expect(lamp!.size.y).toBeCloseTo(3.2, 5);
    const dusk = meshes(scene.group).find(mesh => mesh.name.endsWith("dusk"))!;
    expect(dusk.geometry.boundingBox!.getSize(new Vector3()).z).toBeCloseTo(0.35, 6);
    const mailboxBounds = new Box3().setFromCenterAndSize(mailbox!.center, mailbox!.size);
    const barrel = new Box3().setFromPoints(meshVertices(paper).filter((point, i) => mailboxBounds.containsPoint(point)
      && paletteBlend(new Color().fromBufferAttribute(paper.geometry.getAttribute("color"), i).multiply(paper.material.color),
        new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.58))));
    expect(barrel.getSize(new Vector3()).z).toBeCloseTo(0.96 * 1.3, 5);
    expect(barrel.getSize(new Vector3()).y).toBeCloseTo(0.68 * 1.3, 5);
    for (const prop of [mailbox!, rack!, lamp!]) {
      expect(prop.center.y - prop.size.y / 2).toBeCloseTo(deckTop, 6);
    }
  });

  it("limits dark trim to small fittings and keeps the visible mailbox slot", () => {
    const { scene } = create();
    let totalArea = 0, inkArea = 0;
    for (const mesh of meshes(scene.group)) {
      // The hewn wood posts replace the old dark pillars; only fittings retain this pigment.
      const platform = scene.colliders[0]!;
      const points = meshVertices(mesh).filter(point =>
        Math.abs(point.x - platform.center.x) <= platform.size.x / 2 + 1e-5
        && Math.abs(point.z - platform.center.z) <= platform.size.z / 2 + 1e-5);
      for (let i = 0; i < points.length; i += 3) {
        const area = points[i + 1]!.clone().sub(points[i]!)
          .cross(points[i + 2]!.clone().sub(points[i]!)).length() / 2;
        totalArea += area;
        if (mesh.name.endsWith("ink")) inkArea += area;
      }
    }
    expect(inkArea / totalArea).toBeGreaterThanOrEqual(0.01);
    expect(inkArea / totalArea).toBeLessThanOrEqual(0.04);
    const slotHeight = 0.12 + 1.69 * 1.3;
    const origin = new Vector3(PATH_CLEARANCE, slotHeight, -0.45);
    scene.group.updateMatrixWorld(true);
    const hit = new Raycaster(origin, new Vector3(1, 0, 0), 0, 2.5).intersectObject(scene.group, true)[0];
    expect(hit?.object.name).toBe("last-postcard-ink");
    console.info(`last-postcard: ${(inkArea / totalArea * 100).toFixed(1)}% ink surface`);
  });

  it("adds exactly two visible 0.11 m flower accents on the path-facing postcards", () => {
    const { scene } = create();
    scene.group.updateMatrixWorld(true);
    const flower = meshes(scene.group).find(mesh => mesh.name.endsWith("flower"))!;
    const points = meshVertices(flower);
    const rack = scene.colliders[2]!;
    const rackBase = rack.center.y - rack.size.y / 2;
    const yaw = Math.PI * 4 / 3 + 0.12;
    const up = new Vector3(0, 1, 0);
    const postcardPoints = points.filter(point => point.y < 2);
    let counted = 0;
    for (const row of [0, 1]) {
      const y = rackBase + 1.06 + row * 0.49 + 0.065;
      const accent = postcardPoints.filter(point => Math.abs(point.y - y) < 0.06);
      counted += accent.length;
      expect(accent.length).toBeGreaterThan(0);
      const local = accent.map(point => point.clone().sub(new Vector3(rack.center.x, rackBase, rack.center.z))
        .applyAxisAngle(up, -yaw));
      const bounds = new Box3().setFromPoints(local);
      expect(bounds.getSize(new Vector3()).toArray()).toEqual([
        expect.closeTo(0.11, 5), expect.closeTo(0.11, 5), expect.closeTo(0.012, 5),
      ]);
      const centre = bounds.getCenter(new Vector3()).setZ(bounds.max.z).applyAxisAngle(up, yaw)
        .add(new Vector3(rack.center.x, rackBase, rack.center.z));
      const origin = new Vector3(PATH_CLEARANCE, centre.y, centre.z);
      const hit = new Raycaster(origin, new Vector3(1, 0, 0), 0, 2.5).intersectObject(scene.group, true)[0];
      expect(hit?.object).toBe(flower);
    }
    expect(counted).toBe(postcardPoints.length);
    // The existing tiny mailbox flag is the third and final flower-coloured accent.
    const flag = new Box3().setFromPoints(points.filter(point => point.y >= 2));
    expect(flag.getSize(new Vector3()).length()).toBeLessThan(0.2);
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

  it("uses the shared stone, boulder, hewn-post and plank kits within per-prop budgets", () => {
    const rocks = vi.spyOn(rockKit, "createRockGeometry");
    const posts = vi.spyOn(woodKit, "createPostGeometry");
    const planks = vi.spyOn(woodKit, "createPlankGeometry");
    const { scene } = create();
    expect(rocks.mock.calls.filter(([kind]) => kind === "stone")).toHaveLength(8);
    expect(rocks.mock.calls.filter(([kind]) => kind === "boulder")).toHaveLength(3);
    expect(posts.mock.calls).toHaveLength(9);
    expect(planks.mock.calls).toHaveLength(12);
    for (const spy of [rocks, posts, planks]) {
      for (const result of spy.mock.results) {
        expect(result.type).toBe("return");
        expect(result.value.getAttribute("position").count / 3).toBeLessThanOrEqual(400);
      }
    }
    const counts = scene.colliders.map(() => 0);
    for (const mesh of meshes(scene.group)) {
      const points = meshVertices(mesh);
      for (let i = 0; i < points.length; i += 3) {
        const center = points[i]!.clone().add(points[i + 1]!).add(points[i + 2]!).divideScalar(3);
        const owner = scene.colliders.findIndex(collider => {
          const box = new Box3().setFromCenterAndSize(collider.center, collider.size).expandByScalar(1e-5);
          box.min.y -= 0.06;
          return box.containsPoint(center);
        });
        if (owner >= 0) counts[owner]!++;
      }
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(2000);
    console.info(`last-postcard prop clusters: ${counts.join(", ")} triangles`);
  });

  it("retains broad coplanar fractures on every rendered stone and tipped boulders without level cylinder caps", () => {
    for (const seed of [0, 1, 2, 108, 9301, 0xffffffff]) {
      const { scene } = create({ seed });
      scene.group.updateMatrixWorld(true);
      const paper = meshes(scene.group).find(mesh => mesh.name.endsWith("paper"))!;
      const points = meshVertices(paper);
      for (const collider of [scene.colliders[0]!, ...scene.colliders.slice(5)]) {
        const box = new Box3().setFromCenterAndSize(collider.center, collider.size).expandByScalar(1e-5);
        box.min.y -= 0.06;
        const selected: Vector3[] = [];
        for (let i = 0; i < points.length; i += 3) {
          const triangle = points.slice(i, i + 3);
          if (triangle.every(point => box.containsPoint(point))) selected.push(...triangle);
        }
        const parts = stoneParts(selected), footing = collider === scene.colliders[0];
        expect(parts).toHaveLength(footing ? 8 : 1);
        for (const { faces } of parts) {
          // Same coplanarity threshold as the shared rock kit, after fitting and batching.
          const planar = faces.filter((face, i) => faces.some((other, j) => i !== j
            && face.normal.dot(other.normal) > 0.99999
            && Math.abs(face.normal.dot(other.a.clone().sub(face.a))) < 1e-6));
          expect(planar.length / faces.length).toBeGreaterThanOrEqual(0.3);
          if (!footing) expect(faces.some(face => Math.abs(face.normal.y) > 0.99999)).toBe(false);
        }
        if (footing) {
          const top = parts.filter(part => part.bounds.max.y > 0.1);
          expect(top).toHaveLength(4);
          for (const [i, part] of top.entries()) {
            expect(part.bounds.getSize(new Vector3()).y).toBeCloseTo(0.11, 6);
            for (const other of top.slice(i + 1)) expect(part.bounds.intersectsBox(other.bounds)).toBe(false);
          }
        }
      }
    }
  });

  it("preserves all eight original collider boxes and stays within 1.5x triangles across kit variants", () => {
    const expected = [
      [[5.1, 0.06, 0], [2, 0.12, 3]],
      [[4.75, 1.3875, -0.45], [1.28, 2.535, 1.4]],
      [[5.4, 1.09, 0.8], [1.3, 1.94, 1.3]],
      [[5.52, 1.72, -1.1], [1.16, 3.2, 0.4]],
      [[7.5, 0.45, 0.25], [0.28, 0.9, 3.4]],
      [[6.75, 0.325, -2.7], [1.44, 0.65, 1.1]],
      [[4.65, 0.24, 2.9], [1.1, 0.48, 0.9]],
      [[8.1, 0.275, 2.75], [1.2, 0.55, 0.96]],
    ];
    const counts: number[] = [];
    for (const seed of [0, 1, 2, 108, 9301, 9302, 0xffffffff]) {
      const { scene } = create({ seed });
      expect(scene.colliders.map(collider => [collider.center, collider.size]
        .map(vector => vector.toArray().map(value => Number(value.toFixed(6)))))).toEqual(expected);
      const count = meshes(scene.group).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
      expect(count).toBeLessThanOrEqual(1670 * 1.5);
      expect(meshes(scene.group)).toHaveLength(8);
      counts.push(count);
    }
    console.info(`last-postcard kit variants: ${Math.min(...counts)}–${Math.max(...counts)} triangles (before 1670)`);
  });

  const terrains: { name: string; context: Partial<ZoneSceneContext> }[] = [
    { name: "flat dry bank", context: {} },
    { name: "gentle slope", context: { heightAt: (x, z) => x * 0.04 - z * 0.02 } },
    { name: "sea cutting through the right footprint", context: { underWater: x => x > 4.9 } },
    { name: "sea on the left", context: { underWater: x => x < -4.9 } },
    { name: "wet outer edge away from all prop centres", context: { underWater: x => x > 6.1 } },
    { name: "curved path crossing the rack footprint", context: { onPath: (x, z) => Math.abs(x) <= 2.6 || (x > 4 && z > 1.5) } },
    { name: "wet banks requiring a shift along the path", context: { underWater: (_x, z) => Math.abs(z) < 3 } },
    { name: "water between the props under the shared platform", context: {
      underWater: (x, z) => x > 4.1 && x < 4.4 && z > 1.1 && z < 1.4,
    } },
    { name: "path bend between props under the shared platform", context: {
      onPath: (x, z) => Math.abs(x) <= PATH_CLEARANCE || (x > 4.1 && x < 4.4 && z > 1.1 && z < 1.4),
    } },
  ];
  for (const { name, context: overrides } of terrains) {
    it(`keeps geometry and full collider footprints dry, grounded and outside the path: ${name}`, () => {
      const { scene, context } = create(overrides);
      expectSafe(scene, context);
      for (let i = 0; i < 80; i++) scene.update?.(0.1, false);
      expectSafe(scene, context);
      // The lower course sinks into terrain; every furniture collider keeps its original level top.
      const points = vertices(scene);
      const platform = scene.colliders[0]!;
      const deckTop = platform.center.y + platform.size.y / 2;
      expect(points.filter(point => Math.abs(point.y - context.heightAt(point.x, point.z) + 0.05) < 1e-5).length)
        .toBeGreaterThanOrEqual(4);
      for (const collider of scene.colliders.slice(1, 4)) {
        expect(collider.center.y - collider.size.y / 2).toBeCloseTo(deckTop, 6);
        expect(Math.abs(collider.center.x - platform.center.x) + collider.size.x / 2)
          .toBeLessThanOrEqual(platform.size.x / 2 + 1e-5);
        expect(Math.abs(collider.center.z - platform.center.z) + collider.size.z / 2)
          .toBeLessThanOrEqual(platform.size.z / 2 + 1e-5);
      }
    });
  }

  it("frames the stone footing with three boulders, a low fence and dry grass at their feet", () => {
    const { scene, context } = create();
    expect(scene.colliders).toHaveLength(8);
    const [fence, ...rocks] = scene.colliders.slice(4);
    expect(fence!.size.toArray()).toEqual([0.28, 0.9, 3.4]);
    expect(rocks).toHaveLength(3);
    for (const rock of rocks) {
      expect(rock.size.y).toBeLessThanOrEqual(0.65);
      expect(rock.center.y - rock.size.y / 2).toBe(0);
    }
    const grass = meshes(scene.group).filter(mesh => /forestLight|forestDeep/.test(mesh.name))
      .flatMap(meshVertices).filter(point => point.y <= 0.8);
    expect(grass).toHaveLength((3 * 7 + 3 * 3 + 3) * 18);
    expect(grass.some(point => Math.abs(point.y - context.heightAt(point.x, point.z) + 0.04) < 1e-5)).toBe(true);
    for (const rock of rocks) {
      const points = vertices(scene).filter(point => Math.abs(point.x - rock.center.x) < rock.size.x / 2
        && Math.abs(point.z - rock.center.z) < rock.size.z / 2);
      expect(Math.min(...points.map(point => point.y))).toBeCloseTo(-0.04, 6);
    }
    expectSafe(scene, context);
  });

  it("builds through placeZoneScenes on the actual composed terrain with dry grounded shore details", () => {
    const zones = placeZoneScenes(surfaceHeight);
    try {
      const scene = zones.find(zone => zone.zoneId === "last-postcard")!;
      expect(scene).toBeDefined();
      expect(scene.colliders).toHaveLength(8);
      expect(meshes(scene.group)).toHaveLength(8);
      const heights = new Map<string, number>();
      const groundAt = (point: Vector3) => {
        const key = `${point.x},${point.z}`;
        let ground = heights.get(key);
        if (ground === undefined) {
          ground = surfaceHeight(point.x, point.z);
          heights.set(key, ground);
          expect(ground).toBeGreaterThan(waterLevelAt(point.z));
          expect(nearestPath(point.x, point.z).distance).toBeGreaterThan(PATH_WIDTH / 2);
        }
        return ground;
      };
      for (const point of vertices(scene)) {
        expect(point.y).toBeGreaterThanOrEqual(groundAt(point) - 0.0601);
      }
      const grass = meshes(scene.group).filter(mesh => /forestLight|forestDeep/.test(mesh.name))
        .flatMap(meshVertices).filter(point => point.y - groundAt(point) <= 0.8);
      expect(grass).toHaveLength((3 * 7 + 3 * 3 + 3) * 18);
      console.info(`last-postcard real terrain: interaction ${scene.target.position.toArray().join(", ")}`);
    } finally {
      zones.forEach(zone => zone.dispose());
    }
  });

  it("keeps the High world's triangle increase below 25% with the zone included", async () => {
    const { InstancedMesh, Scene } = await import("three");
    const { createWorldScene } = await import("../../../../src/features/world/scene/compose");
    const { createMeshPhysics } = await import("../../../../src/features/world/scene/mesh-physics");
    const { pathPointAt } = await import("../../../../src/features/world/layout/path");
    const { zoneFoliageBounds } = await import("../../../../src/features/world/zones");
    const { placeDressing } = await import("../../../../src/features/world/dressing");
    const { createFarLandscape } = await import("../../../../src/features/world/scene/far-landscape");
    const scene = new Scene(), zones = placeZoneScenes(surfaceHeight);
    const dressing = placeDressing(), far = createFarLandscape();
    scene.add(...zones.map(zone => zone.group), ...dressing.groups, far.mesh);
    const composed = createWorldScene({ ...createMeshPhysics(), scene, quality: "High", zoneBounds: zoneFoliageBounds(zones) });
    try {
      composed.update(pathPointAt(0.9), 0);
      let after = 0;
      scene.traverseVisible(object => {
        if (object instanceof Mesh) after += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3
          * (object instanceof InstancedMesh ? object.count : 1);
      });
      const currentZone = meshes(zones.find(zone => zone.zoneId === "last-postcard")!.group)
        .reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
      const before = after - currentZone + 1670;
      expect(after).toBeLessThanOrEqual(before * 1.25);
      console.info(`last-postcard High world t=0.9: ${before} -> ${after} triangles; zone 1670 -> ${currentZone}`);
    } finally {
      composed.dispose();
      dressing.dispose();
      far.dispose();
      zones.forEach(zone => zone.dispose());
    }
  }, 60_000);

  it("rejects an entirely flooded or obstructed bank before allocating GPU resources", () => {
    const materialDispose = vi.spyOn(MeshToonMaterial.prototype, "dispose");
    expect(() => createLastPostcardScene({ ...flat, underWater: () => true })).toThrow(RangeError);
    expect(() => createLastPostcardScene({ ...flat, onPath: () => true })).toThrow(RangeError);
    expect(() => createLastPostcardScene({ ...flat, heightAt: () => Number.NaN })).toThrow(RangeError);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it("preserves kit pigments, fades the metal with paper/rock, and reserves plain paper for cards", () => {
    const { scene } = create();
    const recipes: Record<string, Color> = Object.fromEntries(Object.entries(PALETTE).map(([key, value]) => [key, new Color(value)]));
    recipes.wood = new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.62);
    recipes.paper = new Color(PALETTE.cloud);
    recipes.ink = new Color(PALETTE.rockDark);
    recipes.forestDeep = new Color(PALETTE.grass).lerp(new Color(PALETTE.rockDark), 0.35);
    recipes.forestLight = new Color(PALETTE.grass);
    recipes.water = new Color(PALETTE.seaShallow);
    const metal = new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.58);
    const edge = new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.78);
    const stoneColors = [new Color(PALETTE.rockDark), new Color(PALETTE.rock),
      new Color(PALETTE.rockDark).lerp(new Color(PALETTE.rock), 0.72),
      new Color(PALETTE.rock).lerp(new Color(PALETTE.sand), 0.16)];
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
      const positions = mesh.geometry.getAttribute("position");
      const shades = new Set<number>();
      for (let i = 0; i < colors.count; i++) {
        shades.add(colors.getX(i));
        const rendered = new Color().fromBufferAttribute(colors, i).multiply(mesh.material.color);
        if (surface === "paper") {
          const paper = paletteBlend(rendered, new Color(PALETTE.paper));
          const paintedMetal = [metal, edge].some(color => paletteBlend(rendered, color));
          const stone = stoneColors.some(color => paletteBlend(rendered, color));
          expect(paper || paintedMetal || stone).toBe(true);
          const point = new Vector3().fromBufferAttribute(positions, i);
          const colliders = paper ? [scene.colliders[2]!] : paintedMetal ? [scene.colliders[1]!]
            : [scene.colliders[0]!, ...scene.colliders.slice(5)];
          expect(colliders.some(collider => {
            const box = new Box3().setFromCenterAndSize(collider.center, collider.size).expandByScalar(1e-5);
            box.min.y -= 0.06;
            return box.containsPoint(point);
          })).toBe(true);
          continue;
        }
        if (surface === "wood") {
          expect(paletteBlend(rendered,
            new Color(PALETTE.rock).lerp(new Color(PALETTE.dusk), 0.08),
            new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), 0.08))).toBe(true);
        } else {
          expect(paletteBlend(rendered, recipes[surface]!)
            || (/forestLight|forestDeep/.test(surface) && paletteBlend(rendered, new Color(PALETTE.grassDry)))).toBe(true);
        }
      }
      expect(shades.size).toBeGreaterThan(3);
    }
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
