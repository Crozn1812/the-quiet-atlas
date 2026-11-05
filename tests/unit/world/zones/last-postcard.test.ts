import { Box3, Color, Group, Light, Mesh, MeshToonMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { PATH_WIDTH, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
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
    const covered = boxes.some(box => box.clone().expandByScalar(1e-5).containsPoint(point));
    // Soft shore grass is walk-through; all furniture, rocks and fence remain boxed.
    if (!covered) {
      expect(grassPigment, `unboxed solid vertex ${point.toArray()}`).toBe(true);
      expect(point.y - context.heightAt(point.x, point.z)).toBeLessThanOrEqual(0.8);
    }
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
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    expect(new Set(meshes(scene.group).map(mesh => mesh.material)).size).toBe(drawCalls);
    console.info(`last-postcard: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("groups the enlarged mailbox, rack and 3.2 m lamp on one 3 by 2 m timber platform", () => {
    const { scene } = create();
    const [platform, mailbox, rack, lamp] = scene.colliders;
    expect(platform!.size.toArray()).toEqual([2, 0.12, 3]);
    const deckTop = platform!.center.y + platform!.size.y / 2;
    const wood = meshes(scene.group).find(mesh => mesh.name.endsWith("wood"))!;
    const platformBounds = new Box3().setFromCenterAndSize(platform!.center, platform!.size).expandByScalar(1e-5);
    const groundBoards = meshVertices(wood).filter(point => platformBounds.containsPoint(point));
    const deckBounds = new Box3().setFromPoints(groundBoards);
    expect(deckBounds.getSize(new Vector3()).toArray()).toEqual([2, expect.closeTo(0.12, 5), 3]);
    const allPoints = vertices(scene);
    expect(Math.max(...allPoints.map(point => point.y)) - deckTop).toBeCloseTo(3.2, 5);
    expect(lamp!.size.y).toBeCloseTo(3.2, 5);
    const dusk = meshes(scene.group).find(mesh => mesh.name.endsWith("dusk"))!;
    expect(dusk.geometry.boundingBox!.getSize(new Vector3()).z).toBeCloseTo(0.35, 6);
    const mailboxBounds = new Box3().setFromCenterAndSize(mailbox!.center, mailbox!.size);
    const paper = meshes(scene.group).find(mesh => mesh.name.endsWith("paper"))!;
    const barrel = new Box3().setFromPoints(meshVertices(paper).filter(point => mailboxBounds.containsPoint(point)));
    expect(barrel.getSize(new Vector3()).z).toBeCloseTo(0.96 * 1.3, 5);
    expect(barrel.getSize(new Vector3()).y).toBeCloseTo(0.68 * 1.3, 5);
    for (const prop of [mailbox!, rack!, lamp!]) {
      expect(prop.center.y - prop.size.y / 2).toBeCloseTo(deckTop, 6);
    }
  });

  it("uses dark ink for roughly a tenth of the geometry surface, including the visible mailbox slot", () => {
    const { scene } = create();
    let totalArea = 0, inkArea = 0;
    for (const mesh of meshes(scene.group)) {
      // The round-two ink ratio belongs to the original platform furniture, not the new beach.
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
    expect(inkArea / totalArea).toBeGreaterThanOrEqual(0.08);
    expect(inkArea / totalArea).toBeLessThanOrEqual(0.14);
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
      // The shared platform touches the terrain; every prop starts on its level top.
      const points = vertices(scene);
      const platform = scene.colliders[0]!;
      const deckTop = platform.center.y + platform.size.y / 2;
      expect(points.filter(point => Math.abs(point.y - context.heightAt(point.x, point.z)) < 1e-5).length)
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

  it("frames the original platform with three rocks, a low two-rail fence and three grass clumps", () => {
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
    expect(grass).toHaveLength(3 * 9 * 18);
    expect(grass.some(point => Math.abs(point.y - context.heightAt(point.x, point.z)) < 1e-5)).toBe(true);
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
        expect(point.y).toBeGreaterThanOrEqual(groundAt(point) - 1e-4);
      }
      const grass = meshes(scene.group).filter(mesh => /forestLight|forestDeep/.test(mesh.name))
        .flatMap(meshVertices).filter(point => point.y - groundAt(point) <= 0.8);
      expect(grass).toHaveLength(3 * 9 * 18);
      console.info(`last-postcard real terrain: interaction ${scene.target.position.toArray().join(", ")}`);
    } finally {
      zones.forEach(zone => zone.dispose());
    }
  });

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
