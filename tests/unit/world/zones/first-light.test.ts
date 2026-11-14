import { reportBudget } from "../report-budget";
import { createHash } from "node:crypto";
import { Box3, Color, CylinderGeometry, MeshBasicMaterial, Mesh, MeshStandardMaterial, MeshToonMaterial, PerspectiveCamera, Raycaster, Vector3, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMERA_CLEARANCE, CAMERA_PITCH, INITIAL_ZOOM, springArm } from "../../../../src/features/world/camera";
import { paletteColor } from "../../../../src/features/world/art/direction";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { surfaceHeight, worldSpawn } from "../../../../src/features/world/scene/compose";
import { PATH_WIDTH, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createFirstLightScene } from "../../../../src/features/world/zones/first-light";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneScene, type ZoneSceneContext,
} from "../../../../src/features/world/zones/types";

import { createIntro, INTRO_DURATION } from "../../../../src/features/world/cinematic/intro";
import { createFoliageColliders } from "../../../../src/features/world/foliage/colliders";
import { scatterTile } from "../../../../src/features/world/foliage/scatter";

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
      expect(y).toBeGreaterThanOrEqual(ctx.heightAt(x, z) - 0.10001);
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
    reportBudget("tests/unit/world/zones/first-light.test.ts:90 count", count, ZONE_BUDGET.triangles);
    // B2-220 adds a welcome still life; retain the current baseline growth cap.
    reportBudget("tests/unit/world/zones/first-light.test.ts:92 count", count, 6000);
    reportBudget("tests/unit/world/zones/first-light.test.ts:93 count", count, 5176 * 1.25);
    expect(objects).toHaveLength(8);
    reportBudget("tests/unit/world/zones/first-light.test.ts:95 count", count, 5176 * 1.5);
    reportBudget("tests/unit/world/zones/first-light.test.ts:96 objects.length", objects.length, ZONE_BUDGET.drawCalls);
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

  it.each([
    [0, [-0.063948, -0.048804], [[-0.007761, -0.004001], [-0.023163, 0.093336], [-0.000232, 0.054947], [-0.000825, -0.046611]]],
    [1, [-0.038458, -0.026369], [[-0.023163, 0.093336], [-0.000232, 0.054947], [-0.000825, -0.046611], [0.044045, 0.027898]]],
    [2, [0.029621, 0.020310], [[-0.000232, 0.054947], [-0.000825, -0.046611], [0.044045, 0.027898], [0.091275, 0.106943]]],
    [0xffffffff, [0.061778, 0.042358], [[0.009506, 0.077463], [-0.007761, -0.004001], [-0.023163, 0.093336], [-0.000232, 0.054947]]],
  ] as const)("seed %i retains pre-ticket rock and pine collider centres", (seed, rock, pines) => {
    const scene = create(context({ seed }));
    for (const [index, [x, z, scale]] of [[-6.7, 7.2, 1], [-8.3, 7.9, 0.7], [7.5, -2.8, 0.85]].entries()) {
      expect(scene.colliders[index + 2]!.center.x).toBeCloseTo(x! + rock[0] * scale!, 4);
      expect(scene.colliders[index + 2]!.center.z).toBeCloseTo(z! + rock[1] * scale!, 4);
    }
    // The fourth pine was removed for B2-191b's zone budget; retained boxes stay put.
    expect(scene.colliders).toHaveLength(9);
    for (const [index, [x, z]] of [[-10.5, 1], [-11.8, 11], [9.8, 9]].entries()) {
      expect(scene.colliders[index + 5]!.center.x).toBeCloseTo(x! + pines[index]![0], 4);
      expect(scene.colliders[index + 5]!.center.z).toBeCloseTo(z! + pines[index]![1], 4);
    }
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

  it("composes on the real terrain with a dry, grounded First Light beside the world path", () => {
    const placed = placeZoneScenes(surfaceHeight);
    try {
      const scene = placed.find(zone => zone.zoneId === "first-light")!;
      expect(scene).toBeDefined();
      const worldPoint = (x: number, z: number) => new Vector3(x, 0, z).applyMatrix4(scene.group.matrixWorld);
      // HR leaves repeat their five vertices across folded faces. Cache the
      // unchanged terrain function while still checking every sampled point.
      const terrain = new Map<string, number>();
      const height = (p: Vector3) => {
        const key = `${p.x}:${p.z}`;
        if (!terrain.has(key)) terrain.set(key, surfaceHeight(p.x, p.z));
        return terrain.get(key)!;
      };
      checkPlacement(scene, context({
        heightAt(x, z) {
          const p = worldPoint(x, z);
          return height(p) - scene.group.position.y;
        },
        onPath(x, z) {
          const p = worldPoint(x, z);
          return Math.abs(x) <= PATH_CLEARANCE || nearestPath(p.x, p.z).distance <= PATH_WIDTH / 2;
        },
        underWater(x, z) {
          const p = worldPoint(x, z);
          return height(p) <= waterLevelAt(p.z);
        },
      }));
      reportBudget("tests/unit/world/zones/first-light.test.ts:204 meshes(scene).reduce((sum, mesh) => sum + triangles(mesh.geometry), 0)", meshes(scene).reduce((sum, mesh) => sum + triangles(mesh.geometry), 0), ZONE_BUDGET.triangles);
      reportBudget("tests/unit/world/zones/first-light.test.ts:206 meshes(scene).length", meshes(scene).length, ZONE_BUDGET.drawCalls);
    } finally {
      placed.forEach(scene => scene.dispose());
    }
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

  it("preserves palette pigments, matte ramps and translucent dawn veils", () => {
    const scene = create();
    const colors: Record<string, number> = {
      wood: new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.65).getHex(),
      paper: new Color(PALETTE.cloud).getHex(),
      green: new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.6).getHex(),
      stone: new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), 0.2).getHex(),
      sun: paletteColor({ base: "sunGold", mix: "cloud", amount: 0.7, saturation: 1, brightness: 1 }),
      ink: new Color(PALETTE.rockDark).lerp(new Color(PALETTE.forestDeep), 0.45).getHex(),
      flower: new Color(PALETTE.flower).getHex(),
      petal: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sand), 0.12).getHex(),
    };
    for (const mesh of meshes(scene).filter(mesh => mesh.name !== "first-light-dressing")) {
      const surface = mesh.name.replace("first-light-", "");
      const pbr = surface === "wood" || surface === "paper";
      expect(mesh.material).toBeInstanceOf(pbr ? MeshStandardMaterial : MeshToonMaterial);
      expect(mesh.material.color.getHex()).toBe(colors[surface]);
      if (surface !== "paper" && surface !== "petal") {
        const paper = new Vector3(...new Color(PALETTE.paper).toArray());
        expect(new Vector3(...mesh.material.color.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
        const washes = mesh.geometry.getAttribute("color");
        for (let i = 0; i < washes.count; i++) {
          const pigment = mesh.material.color.clone().multiply(new Color(washes.getX(i), washes.getY(i), washes.getZ(i)));
          expect(new Vector3(...pigment.toArray()).distanceTo(paper)).toBeGreaterThan(0.08);
        }
      }
      expect(mesh.material.vertexColors).toBe(true);
      if (pbr) {
        expect(mesh.material).toHaveProperty("metalness", 0);
        expect((mesh.material as unknown as MeshStandardMaterial).roughness).toBeGreaterThanOrEqual(0.96);
      } else {
        expect(mesh.material.gradientMap).toBeTruthy();
        expect(mesh.material).not.toHaveProperty("metalness");
      }
      const washes = mesh.geometry.getAttribute("color");
      expect(washes.count).toBe(mesh.geometry.getAttribute("position").count);
      const palette = Object.values(PALETTE).map(value => new Vector3(...new Color(value).toArray()));
      const unique = new Set<string>();
      for (let i = 0; i < washes.count; i++) {
        const pigment = mesh.material.color.clone().multiply(new Color(washes.getX(i), washes.getY(i), washes.getZ(i)));
        expect(pigment.toArray().every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1)).toBe(true);
        // A wash may darken a palette mix. Check the actual rendered pigment, not raw multipliers.
        const p = new Vector3(...pigment.toArray());
        const key = p.toArray().map(channel => channel.toFixed(2)).join(",");
        if (unique.has(key)) continue;
        unique.add(key);
        let nearest = Infinity;
        for (const a of palette) for (const b of palette) {
          const direction = b.clone().sub(a);
          const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(direction) / (direction.lengthSq() || 1)));
          nearest = Math.min(nearest, p.distanceTo(a.clone().addScaledVector(direction, t)));
        }
        expect(nearest).toBeLessThan(0.065);
      }
      if (surface === "sun") {
        // B2-151: two subdivided veils with feathered vertex alpha (no longer a solid plank), 0.12-0.18 opacity.
        reportBudget("tests/unit/world/zones/first-light.test.ts:307 triangles(mesh.geometry)", triangles(mesh.geometry), 200);
        expect(mesh.material.transparent).toBe(true);
        expect(mesh.material.opacity).toBeGreaterThanOrEqual(0.12);
        expect(mesh.material.opacity).toBeLessThanOrEqual(0.18);
        expect(mesh.material.depthWrite).toBe(false);
        expect(mesh.material.forceSinglePass).toBe(true);
      }
    }
  });

  it("grounds the greeting clumps and keeps white flowers distinct from the book", () => {
    const scene = create();
    const green = meshes(scene).find(mesh => mesh.name === "first-light-green")!.geometry.getAttribute("position");
    const nearby: Vector3[] = [];
    for (let i = 0; i < green.count; i++) {
      const p = new Vector3().fromBufferAttribute(green, i);
      if (Math.hypot(p.x - 4.8, p.z - 3.8) < 1.1) nearby.push(p);
    }
    expect(nearby.length).toBeGreaterThan(0);
    expect(Math.min(...nearby.map(p => p.y))).toBeLessThanOrEqual(0.05);
    expect(Math.max(...nearby.map(p => p.y))).toBeLessThanOrEqual(0.5);
    const petals = meshes(scene).find(mesh => mesh.name === "first-light-petal")!;
    expect(petals.material.color.getHex()).toBe(new Color(PALETTE.cloud).lerp(new Color(PALETTE.sand), 0.12).getHex());
    expect(petals.geometry.boundingBox!.max.y).toBeLessThan(0.4);
    const paper = meshes(scene).find(mesh => mesh.name === "first-light-paper")!;
    expect(paper.geometry.boundingBox!.min.y).toBeGreaterThan(0.75);
    const positions = paper.geometry.getAttribute("position");
    const originalBook = new Box3();
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 1.5)
      originalBook.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
    expect(originalBook.getSize(new Vector3()).length()).toBeLessThan(1);
    const total = meshes(scene).reduce((sum, mesh) => sum + triangles(mesh.geometry), 0);
    console.info(`B2-220 First Light budget: 5176 -> ${total} triangles, 7 -> ${meshes(scene).length} draw calls`);
  });

  it("keeps the small orange blooms and one larger cluster beside the log, omitting them when flooded", () => {
    const scene = create();
    const flowers = meshes(scene).find(mesh => mesh.name === "first-light-flower")!;
    const positions = flowers.geometry.getAttribute("position");
    const centres = [
      new Vector3(-5.45, 0.25, 4.7), new Vector3(-6.25, 0.29, 3.05), new Vector3(-7.65, 0.27, 3),
      new Vector3(-5.27, 0.32, 3.2), new Vector3(-5.03, 0.4, 3.24), new Vector3(-5.15, 0.35, 3.43),
    ];
    const bounds = centres.map(() => new Box3());
    for (let i = 0; i < positions.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(positions, i);
      const index = centres.findIndex((centre, index) => centre.distanceTo(vertex) < (index < 3 ? 0.1 : 0.145));
      expect(index).toBeGreaterThanOrEqual(0);
      bounds[index]!.expandByPoint(vertex);
    }
    for (const [index, box] of bounds.entries()) {
      const size = box.getSize(new Vector3());
      expect(Math.max(size.x, size.z)).toBeGreaterThanOrEqual(index < 3 ? 0.1 : 0.24);
      expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(index < 3 ? 0.15 : 0.28);
    }
    expect(meshes(create(context({ underWater: x => x < -6 })))
      .some(mesh => mesh.name === "first-light-flower")).toBe(false);
  });

  it("keeps shipped box colliders and grounds each hard assembly within its footprint", () => {
    const scene = create();
    const expected = [
      [4.798890, 0.830379, 3.8, 0.819744, 1.660759, 0.61],
      [-7.201088, 0.454785, 3.846004, 3.797172, 0.909570, 1.475537],
      [-6.763492, 0.544026, 7.156467, 1.892386, 1.088052, 1.339229],
      [-8.344444, 0.380818, 7.869527, 1.324671, 0.761636, 0.937460],
      [7.446032, 0.462422, -2.837003, 1.608529, 0.924844, 1.138345],
      [-10.557801, 8.5, 1.140655, 2.7, 17, 2.532003],
      [-11.776724, 7.5, 10.972408, 2.674772, 15, 2.7],
      [9.813375, 8, 9.071885, 2.689813, 16, 2.7],
      [4.998912, 0.454785, -4.453996, 3.797172, 0.909570, 1.475537],
    ];
    expect(scene.colliders).toHaveLength(expected.length);
    for (const [index, collider] of scene.colliders.entries()) {
      [...collider.center.toArray(), ...collider.size.toArray()].forEach((value, axis) => {
        expect(Math.abs(value - expected[index]![axis]!)).toBeLessThan(0.1);
      });
      let foot = Infinity;
      let count = 0;
      for (const mesh of meshes(scene).filter(mesh => !mesh.material.transparent)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i += 3) {
          const p = new Vector3().fromBufferAttribute(positions, i);
          if (Math.abs(p.x - collider.center.x) > collider.size.x / 2 ||
              Math.abs(p.z - collider.center.z) > collider.size.z / 2) continue;
          foot = Math.min(foot, p.y);
          count++;
        }
      }
      expect(foot).toBeGreaterThanOrEqual(-0.1);
      expect(foot).toBeLessThanOrEqual(0.05);
      expect(count).toBeGreaterThan(0);
      reportBudget("tests/unit/world/zones/first-light.test.ts:399 count", count, 2000);
    }
  });

  it("leaves the open notebook visible from the path edge at either greeting site", () => {
    for (const ctx of [context(), context({ underWater: x => x > 0 })]) {
      const scene = create(ctx);
      const { x, z } = scene.interactable.position;
      const edgeX = Math.sign(x) * PATH_CLEARANCE;
      const eye = new Vector3(edgeX, ctx.heightAt(edgeX, z) + 1.6, z);
      const paper = meshes(scene).find(mesh => mesh.name === "first-light-paper")!.geometry.getAttribute("position");
      const book = new Box3();
      for (let i = 0; i < paper.count; i++) {
        if (Math.abs(paper.getX(i) - x) < 0.5 && Math.abs(paper.getZ(i) - z) < 0.5) {
          book.expandByPoint(new Vector3().fromBufferAttribute(paper, i));
        }
      }
      const size = book.getSize(new Vector3());
      expect(size.x).toBeGreaterThan(0.6);
      expect(size.z).toBeGreaterThan(0.42);
      expect(size.y).toBeGreaterThan(0.1);
      expect(book.min.y - ctx.heightAt(x, z)).toBeGreaterThan(1.5);
      const page = new Vector3(x - 0.15, ctx.heightAt(x, z) + 1.64, z);
      const ray = new Raycaster(eye, page.clone().sub(eye).normalize(), 0, eye.distanceTo(page) + 0.1);
      scene.group.updateMatrixWorld(true);
      const hits = ray.intersectObjects(scene.group.children);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.object.name).toBe("first-light-paper");
      // The taller, thicker book can meet the eye ray at its page-block edge before the top leaf.
      expect(book.containsPoint(hits[0]!.point)).toBe(true);
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
    const ramp = meshes(first).find(mesh => mesh.name === "first-light-green")!.material.gradientMap!;
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
    expect(meshes(sibling).find(mesh => mesh.name === "first-light-green")!.material.gradientMap).toBe(ramp);
  });

  it("frames the welcome at the real intro/skip handoff without trunk occlusion", () => {
    const zones = placeZoneScenes(surfaceHeight);
    const geometry = new CylinderGeometry(1, 1, 2, 6), material = new MeshBasicMaterial();
    // Use the same full-density, leaning trunk collider data as compose.ts.
    // Keeping trees excluded by zone boxes is conservative for visibility.
    const trunks = [-1, 0, 1].flatMap(ix => [-1, 0, 1].flatMap(iz =>
      createFoliageColliders(scatterTile({ ix, iz })).map(trunk => {
        const mesh = new Mesh(geometry, material);
        mesh.position.set(trunk.x, trunk.y, trunk.z);
        mesh.quaternion.copy(trunk.rotation);
        mesh.scale.set(trunk.radius, trunk.halfHeight, trunk.radius);
        mesh.updateMatrixWorld(true);
        return mesh;
      })));
    try {
      const scene = zones.find(zone => zone.zoneId === "first-light")!, spawn = worldSpawn();
      // index.ts updateCamera: initial yaw, arm retraction and terrain clamp.
      const yaw = Math.atan2(7, 9);
      const direction = new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH),
        Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH));
      const armRay = new Raycaster(spawn, direction, 0, INITIAL_ZOOM);
      const hit = armRay.intersectObjects([...trunks, ...zones.flatMap(zone => zone.boxes)])[0];
      expect(hit).toBeUndefined(); // Exclusion filtering cannot change this unobstructed arm.
      const position = spawn.clone().addScaledVector(direction,
        springArm(INITIAL_ZOOM, INITIAL_ZOOM, hit?.distance, 1 / 60));
      position.y = Math.max(position.y, surfaceHeight(position.x, position.z) + CAMERA_CLEARANCE);
      const intro = createIntro({ position, target: spawn, fov: 55 });
      const bounds = (name: string) => {
        const box = new Box3();
        for (const mesh of meshes(scene)) {
          const ranges = mesh.geometry.userData.parts as { name: string; start: number; count: number }[];
          for (const range of ranges.filter(part => part.name === name)) {
            const vertices = mesh.geometry.getAttribute("position");
            for (let i = range.start; i < range.start + range.count; i++) box.expandByPoint(
              new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld));
          }
        }
        expect(box.isEmpty(), name).toBe(false);
        return box;
      };
      const names = ["welcome-log-seat", "seat-open-notebook", "notebook-ink-strokes",
        "seat-cup", "cup-handle", "seat-mailbox-post", "seat-mailbox-pocket", "seat-foot-moss"];
      const cluster = names.reduce((box, name) => box.union(bounds(name)), new Box3());
      const center = cluster.getCenter(new Vector3());
      const notebookCenter = bounds("seat-open-notebook").getCenter(new Vector3());
      // The moved light must survive real-terrain footprint validation, too.
      const sun = meshes(scene).find(mesh => mesh.name === "first-light-sun")!;
      const sunVertices = sun.geometry.getAttribute("position");
      let shaftDistance = Infinity;
      for (let i = 0; i < sunVertices.count; i++) shaftDistance = Math.min(shaftDistance,
        new Vector3().fromBufferAttribute(sunVertices, i).applyMatrix4(sun.matrixWorld).distanceTo(notebookCenter));
      expect(shaftDistance).toBeLessThan(0.25);
      expect(center.clone().sub(spawn).setY(0).length()).toBeGreaterThanOrEqual(6);
      expect(center.clone().sub(spawn).setY(0).length()).toBeLessThanOrEqual(10);
      expect(center.clone().sub(spawn).setY(0).dot(direction.clone().negate())).toBeGreaterThan(0);
      expect(cluster.getSize(new Vector3()).y).toBeGreaterThanOrEqual(0.8);
      expect(cluster.getSize(new Vector3()).y).toBeLessThanOrEqual(1.6);
      for (const pose of [intro.sample(INTRO_DURATION), intro.finalFrame()]) {
        expect(pose.position).toEqual(position);
        const camera = new PerspectiveCamera(pose.fov, 16 / 9, 0.1, 100);
        camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
        const angle = camera.getWorldDirection(new Vector3()).angleTo(center.clone().sub(camera.position)) * 180 / Math.PI;
        expect(angle).toBeGreaterThanOrEqual(10);
        expect(angle).toBeLessThanOrEqual(25);
        const sight = center.clone().sub(camera.position);
        expect(new Raycaster(camera.position, sight.clone().normalize(), 0, sight.length())
          .intersectObjects(trunks)).toHaveLength(0);
        for (const name of names) {
          const box = bounds(name), point = box.getCenter(new Vector3());
          const clip = point.clone().project(camera);
          expect(Math.abs(clip.x), name).toBeLessThan(1);
          expect(Math.abs(clip.y), name).toBeLessThan(1);
          expect(clip.z, name).toBeGreaterThan(-1);
          expect(clip.z, name).toBeLessThan(1);
          const delta = point.clone().sub(camera.position);
          expect(new Raycaster(camera.position, delta.clone().normalize(), 0, delta.length())
            .intersectObjects(trunks), name).toHaveLength(0);
        }
      }
      const paper = meshes(scene).find(mesh => mesh.name === "first-light-paper")!;
      const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      for (const mesh of meshes(scene).filter(mesh => !["first-light-paper", "first-light-sun", "first-light-dressing"].includes(mesh.name)))
        expect(luma(paper.material.color)).toBeGreaterThan(luma(mesh.material.color));
      for (const mesh of meshes(scene)) {
        const vertices = mesh.geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) expect(new Vector3().fromBufferAttribute(vertices, i)
          .applyMatrix4(mesh.matrixWorld).sub(spawn).setY(0).length()).toBeGreaterThan(3);
      }
      console.info("B2-222 handoff:", position.toArray(), "cluster:", center.toArray(),
        "distance from spawn:", center.clone().sub(spawn).setY(0).length(),
        "height:", cluster.getSize(new Vector3()).y);
    } finally {
      zones.forEach(zone => zone.dispose()); geometry.dispose(); material.dispose();
    }
  });

  it("lands the sun shaft at the notebook seat", () => {
    const scene = create();
    const sun = meshes(scene).find(m => m.name === "first-light-sun")!;
    const positions = sun.geometry.getAttribute("position");
    const target = new Vector3(5, 0.84, -4.5);
    let nearest = Infinity;
    for (let i = 0; i < positions.count; i++) nearest = Math.min(nearest,
      new Vector3().fromBufferAttribute(positions, i).distanceTo(target));
    expect(nearest).toBeLessThan(0.1);
  });

  it("builds the clearing under 200 ms on Node", () => {
    create();
    const times = Array.from({ length: 5 }, () => {
      const start = performance.now(); create(); return performance.now() - start;
    }).sort((a, b) => a - b);
    reportBudget("tests/unit/world/zones/first-light.test.ts:584 times[2]", times[2], 200);
    const scene = scenes.at(-1)!;
    console.info("B2-220 First Light:", meshes(scene).reduce((n, m) => n + triangles(m.geometry), 0),
      "triangles;", meshes(scene).length, "calls; median", times[2], "ms");
  });

  it("fingerprints the rebuilt props, collision envelopes and interaction", () => {
    const scene = create();
    scene.group.updateMatrixWorld(true);
    const triangles: string[] = [];
    for (const mesh of meshes(scene)) {
      const positions = mesh.geometry.getAttribute("position");
      // Shared foliage changes independently; test its total budget and determinism above.
      if (mesh.name === "first-light-green" || mesh.name === "first-light-dressing") continue;
      for (let i = 0; i < positions.count; i += 3) {
        triangles.push([0, 1, 2].flatMap(offset => new Vector3().fromBufferAttribute(positions, i + offset)
          .applyMatrix4(mesh.matrixWorld).toArray().map(value => value.toFixed(5))).join(","));
      }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      triangles: triangles.sort(), colliders: scene.colliders, interactable: scene.interactable,
    })).digest("hex");
    // FL-03 narrows both welcome shafts; collision and interaction stay included.
    expect(fingerprint).toBe("0de6855bf00bbea9bbcd1ce8d947cb516cea939bf347adfce1de4b7b785e7bd0");
  });

});
