import { Box3, BufferGeometry, Color, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZONE_IDS } from "../../../../src/features/interaction/targets";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { createPineCrownV2 } from "../../../../src/features/world/foliage/pine";
import { disposeRampGradients, RAMP_PRESETS } from "../../../../src/features/world/materials/ramp";
import { HEIGHT } from "../../../../src/features/world/scene";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { ZONES } from "../../../../src/features/world/layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { placeZoneScenes } from "../../../../src/features/world/zones";
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
function rockPoints(scene: ZoneScene, index: number) {
  const surface = index < 7 ? "weathered" : "future";
  // Upright kit slabs have refined caps (104 triangles); horizontal slots retain 80.
  const count = index < 7 ? 312 : 240;
  return points(named(scene, surface), (index < 7 ? index : index - 7) * count, count);
}
function unique(points: Vector3[]) {
  return [...new Map(points.map(point => [point.toArray().map(n => n.toFixed(5)).join(","), point])).values()];
}
/** Convex silhouette in the road-facing YZ plane, ignoring collinear ring/subdivision vertices. */
function outline(vertices: Vector3[]) {
  const sorted = [...new Map(vertices.map(p => [`${p.y.toFixed(5)},${p.z.toFixed(5)}`, p])).values()]
    .sort((a, b) => a.y - b.y || a.z - b.z);
  const half = (points: Vector3[]) => {
    const hull: Vector3[] = [];
    for (const point of points) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2]!, b = hull[hull.length - 1]!;
        if ((b.y - a.y) * (point.z - a.z) - (b.z - a.z) * (point.y - a.y) > 1e-5) break;
        hull.pop();
      }
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
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
  it("keeps the previous box centres and labelled target within 0.1 m", () => {
    // Captured before the kit migration (seed 104); sizes still enclose the new silhouettes.
    const previous = [
      [4.70508, 1.38064, -0.00349], [6.79322, 1.05148, -3.11352],
      [9.49378, 1.13236, -4.76370], [10.89982, 1.07500, -1.43573],
      [7.39401, 1.23586, 2.62716], [10.30224, 0.97828, 4.16813],
      [11.49137, 1.19896, 1.40990], [6.11127, 0.19332, -7.09900],
      [8.20943, 0.29381, 7.19432], [15.01386, 2.10000, 2.70000],
    ];
    const scene = create();
    scene.colliders.forEach((box, i) => {
      const centre = new Vector3(...previous[i] as [number, number, number]);
      expect(box.center.distanceTo(centre)).toBeLessThanOrEqual(0.1);
      if (i === 0) expect(scene.interactable.position.distanceTo(centre)).toBeLessThanOrEqual(0.1);
    });
  });

  it("places the scene on the composed world's real terrain", () => {
    const placed = placeZoneScenes(surfaceHeight);
    try {
      const scene = placed.find(zone => zone.zoneId === "milestones")!;
      expect(scene).toBeDefined();
      const anchor = scene.group.position;
      const heightAt = (x: number, z: number) => {
        const p = new Vector3(x, 0, z).applyMatrix4(scene.group.matrixWorld);
        return surfaceHeight(p.x, p.z) - anchor.y;
      };
      // The complete composition retreats along the road onto its shallow uphill shoulder.
      const target = scene.interactable.position;
      expect(target.x).toBeLessThan(-PATH_CLEARANCE);
      expect(Math.abs(target.z)).toBeGreaterThan(8);
      const edge = new Vector3(-PATH_CLEARANCE, 0, target.z);
      edge.y = heightAt(edge.x, edge.z) + HEIGHT;
      expect(edge.distanceTo(target)).toBeLessThanOrEqual(2.5);
      const localHeights = unique(rockPoints(scene, 0)).map(point =>
        point.y - heightAt(point.x, point.z));
      expect(Math.min(...localHeights)).toBeCloseTo(-0.05, 5);
      expect(Math.max(...localHeights)).toBeCloseTo(2.4, 5);
      // Near-foot, middle and upper-body sight lines must reach rock before any terrain lip.
      const ground = heightAt(target.x, target.z);
      for (const lift of [0.2, 1.2, 2.1]) {
        const eye = scene.group.localToWorld(edge.clone());
        const aim = scene.group.localToWorld(new Vector3(target.x, ground + lift, target.z));
        const hit = new Raycaster(eye, aim.clone().sub(eye).normalize())
          .intersectObjects(scene.group.children)[0];
        expect(hit?.object.name).toMatch(/^milestones-(ink|weathered)$/);
        const localHit = scene.group.worldToLocal(hit!.point.clone());
        for (let i = 0; i <= 20; i++) {
          const point = edge.clone().lerp(localHit, i / 20);
          expect(point.y).toBeGreaterThan(heightAt(point.x, point.z));
        }
      }
    } finally {
      placed.forEach(zone => zone.dispose());
    }
  });
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
    expect(triangles).toBeLessThanOrEqual(1466 * 1.5);
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    expect(drawCalls).toBe(5);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    // Removing the 432-triangle mound keeps the kit slabs and V2 pine under the previous budget.
    if (seed === 104) expect(triangles).toBe(1422);
    if (seed === 104) console.info(`milestones: ${triangles} triangles, ${drawCalls} draw calls`);
  });

  it("repeats all geometry, materials, colliders and target for the same seed", () => {
    const first = create(), second = create();
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(create({ seed: 105 }))).not.toEqual(snapshot(first));
  });

  it.each([0, 1, 104, 105, 65535, 73024, 2147483647, 4294967295])("seed %i: has 5–9 unequal silhouette edges and a nonplanar front", seed => {
    for (const side of [1, -1]) {
      const scene = create({ seed, underWater: x => side * x < 0 });
      const vertices = rockPoints(scene, 0), hull = outline(vertices);
      expect(hull.length).toBeGreaterThanOrEqual(5);
      expect(hull.length).toBeLessThanOrEqual(9);
      const lengths = hull.map((p, i) => {
        const next = hull[(i + 1) % hull.length]!;
        return Math.hypot(next.y - p.y, next.z - p.z);
      });
      const variation = (Math.max(...lengths) - Math.min(...lengths)) / (lengths.reduce((sum, n) => sum + n, 0) / lengths.length);
      expect(variation).toBeGreaterThanOrEqual(0.2);
      // The kit's 72 side triangles precede its refined cut faces; exclude bevel normals.
      const normals = named(scene, "weathered").geometry.getAttribute("normal");
      const front: Vector3[] = [];
      for (let i = 72 * 3; i < vertices.length; i += 3) {
        const normal = new Vector3().fromBufferAttribute(normals, i);
        if (side * normal.x < -0.95) front.push(normal);
      }
      expect(new Set(front.map(n => n.toArray().map(v => v.toFixed(3)).join(","))).size).toBeGreaterThanOrEqual(2);
      expect(Math.max(...front.flatMap(a => front.map(b => a.distanceTo(b))))).toBeGreaterThan(0.03);
    }
  });

  it("constructs the real-terrain zone within 450 ms of Node CPU time", () => {
    const layout = ZONES.find(zone => zone.id === "milestones")!;
    const yaw = Math.atan2(layout.lookDirection.x, layout.lookDirection.z);
    const anchorY = surfaceHeight(layout.position.x, layout.position.z);
    const world = (x: number, z: number) => ({
      x: layout.position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
      z: layout.position.z - x * Math.sin(yaw) + z * Math.cos(yaw),
    });
    const real = context({
      seed: TERRAIN_SEED + ZONE_IDS.indexOf("milestones"),
      heightAt(x, z) { const p = world(x, z); return surfaceHeight(p.x, p.z) - anchorY; },
      onPath(x, z) { const p = world(x, z); return Math.abs(x) <= PATH_CLEARANCE || nearestPath(p.x, p.z).distance <= PATH_WIDTH / 2; },
      underWater(x, z) { const p = world(x, z); return surfaceHeight(p.x, p.z) <= waterLevelAt(p.z); },
    });
    const start = performance.now();
    const cpuStart = process.cpuUsage();
    create(real);
    const elapsed = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart), cpuMs = (cpu.user + cpu.system) / 1000;
    // Full-suite workers compete for wall time; CPU work is the stable regression gate.
    console.info(`milestones real-terrain construction: ${elapsed.toFixed(1)} ms wall, ${cpuMs.toFixed(1)} ms CPU (budget 450 ms)`);
    expect(cpuMs).toBeLessThanOrEqual(450);
  });

  it.each([0, 1, 104, 65535])("seed %i: has six rough leaning rocks, a broad 2.4 m target and two detached low slots", seed => {
    const scene = create({ seed });
    expect(scene.zoneId).toBe("milestones");
    expect(scene.colliders).toHaveLength(10);
    const stones = scene.colliders.slice(0, 9);
    const middle = stones[0]!;
    expect(scene.interactable.position).toEqual(middle.center);
    for (const [index, stone] of stones.entries()) {
      const faceVertices = rockPoints(scene, index);
      const vertices = unique(faceVertices);
      const colliderBounds = new Box3().setFromCenterAndSize(stone.center, stone.size).expandByScalar(1e-5);
      for (const point of vertices) expect(colliderBounds.containsPoint(point)).toBe(true);
      const local = vertices;
      const height = Math.max(...local.map(point => point.y));
      if (index === 0) expect(height).toBeCloseTo(2.4, 5);
      else if (index < 7) {
        expect(height).toBeGreaterThanOrEqual(0.9);
        expect(height).toBeLessThanOrEqual(1.6);
        expect(stone.center.x).toBeGreaterThan(middle.center.x);
        expect(stone.size.z).toBeLessThan(middle.size.z * 0.75);
      }
      expect(Math.min(...local.map(point => point.y))).toBeCloseTo(-0.05, 5);
      if (index < 7) {
        // Broad cut faces really face the road and lean slightly; bevels remain distinct.
        let frontArea = 0;
        const normals = new Set<string>();
        const localFaces = faceVertices;
        for (let i = 0; i < localFaces.length; i += 3) {
          const [a, b, c] = localFaces.slice(i, i + 3) as [Vector3, Vector3, Vector3];
          const cross = b.clone().sub(a).cross(c.clone().sub(a)), normal = cross.clone().normalize();
          normals.add(normal.toArray().map(value => value.toFixed(2)).join(","));
          if (normal.x < -0.95) {
            frontArea += cross.length() / 2;
            expect(Math.abs(normal.y)).toBeLessThan(0.32);
          }
        }
        expect(frontArea).toBeGreaterThan(stone.size.z * height * 0.35);
        expect(normals.size).toBeGreaterThan(6);
      } else {
        // The stable collider centre needs a taller envelope after removing the mound.
        expect(new Box3().setFromPoints(vertices).getSize(new Vector3()).y).toBeLessThan(0.6);
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

  it.each([false, true])("grounds stones directly without a raised or mismatched mound and keeps a clear road view (mirrored: %s)", wet => {
    const scene = create({ underWater: x => wet && x > 0 });
    // With no overlay, every visible ground point retains the terrain's own height and luma.
    expect(named(scene, "mound")).toBeUndefined();
    for (let i = 0; i < 9; i++) {
      const foot = Math.min(...rockPoints(scene, i).map(point => point.y));
      expect(foot).toBeCloseTo(-0.05, 5);
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

  it("drapes rocks and trunk over a slope with shallowly embedded feet", () => {
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
        expect(b.getY(i)).toBeGreaterThanOrEqual(heightAt(x, z) - 0.051);
        if (Math.abs(a.getY(i)) < 1e-6) {
          expect(b.getY(i)).toBeCloseTo(heightAt(x, z), 5);
          feet++;
        }
      }
      if (mesh.name === "milestones-ink") expect(feet).toBeGreaterThan(0);
    }
  });

  it("moves the whole cluster behind a steep road-side lip onto flat dry ground", () => {
    const heightAt = (x: number, z: number) => z <= -6 ? 0 : -4 * Math.min(1, Math.max(0, x - 3));
    const flat = create(), retreat = create({ heightAt, underWater: x => x < 0 });
    expect(retreat.interactable.position.z - flat.interactable.position.z).toBeCloseTo(-16, 5);
    const before = meshes(flat), after = meshes(retreat);
    for (const [index, mesh] of before.entries()) {
      const a = mesh.geometry.getAttribute("position"), b = after[index]!.geometry.getAttribute("position");
      for (let i = 0; i < a.count; i++) {
        expect(b.getX(i)).toBeCloseTo(a.getX(i), 5);
        expect(b.getZ(i)).toBeCloseTo(a.getZ(i) - 16, 5);
        expect(b.getY(i)).toBeCloseTo(a.getY(i), 5);
        expect(heightAt(b.getX(i), b.getZ(i))).toBe(0);
      }
    }
    expect(snapshot(create({ heightAt, underWater: x => x < 0 }))).toEqual(snapshot(retreat));
  });

  it("keeps the labelled middle stone 2–6 m from the corridor and within E range at its edge", () => {
    for (const seed of [0, 1, 104, 65535]) {
      for (const wet of [false, true]) {
        const scene = create({ seed, underWater: x => wet && x > 0 });
        const point = scene.interactable.position;
        const fromEdge = Math.abs(point.x) - PATH_CLEARANCE;
        expect(fromEdge).toBeGreaterThanOrEqual(2);
        expect(fromEdge).toBeLessThanOrEqual(6);
        const standingAtEdge = new Vector3(Math.sign(point.x) * PATH_CLEARANCE, HEIGHT, point.z);
        expect(standingAtEdge.distanceTo(point)).toBeLessThanOrEqual(2.5);
        expect(scene.interactable.label).toEqual({ vi: "Cụm đá dấu mốc", en: "Milestone rocks" });
      }
    }
  });

  it("uses natural palette recipes, moss on existing stone faces and soft matte ramp materials", () => {
    const scene = create();
    const expected = [
      new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), 0.24).getHex(),
      new Color(PALETTE.rock).getHex(),
      new Color(PALETTE.rockDark).getHex(),
      new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.42).getHex(),
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
        const rendered = new Color().fromBufferAttribute(colors, i).multiply(mesh.material.color);
        expect(rendered.toArray().every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      }
    }
  });

  it("keeps dark pigment on the trunk instead of a black stone plinth, with only two 0.13 m flower accents", () => {
    const scene = create();
    expect(named(scene, "ink").geometry.getAttribute("position").count / 3).toBe(42);
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

  it.each([0, 1, 104, 65535])("seed %i: localises green moss at the foot and pale lichen above it", seed => {
    const scene = create({ seed }), mesh = named(scene, "weathered");
    const colors = mesh.geometry.getAttribute("color");
    const green: number[] = [], pale: number[] = [];
    const kitHighlight = new Color(PALETTE.rock).lerp(new Color(PALETTE.sand), 0.16);
    // Inspect the interactable's actual surface, not the nearby loose chips.
    const vertices = rockPoints(scene, 0);
    for (let i = 0; i < vertices.length; i++) {
      const point = vertices[i]!, localY = point.y;
      const pigment = new Color().fromBufferAttribute(colors, i).multiply(mesh.material.color);
      if (pigment.g > pigment.r * 1.15) green.push(localY);
      if (pigment.r > kitHighlight.r + 0.04 && pigment.b > kitHighlight.b + 0.04) pale.push(localY);
    }
    expect(green.length).toBeGreaterThan(5);
    expect(Math.max(...green)).toBeLessThan(0.35);
    expect(pale.length).toBeGreaterThan(2);
    expect(Math.min(...pale)).toBeGreaterThan(0.2);
    expect(pale.length).toBeLessThan(vertices.length * 0.3);
    // The four loose kit chips are embedded directly in the terrain.
    for (let chip = 0; chip < 4; chip++) {
      const foot = Math.min(...points(mesh, 7 * 312 + chip * 78, 78).map(point => point.y));
      expect(foot).toBeCloseTo(-0.04, 5);
    }
    const propTriangles = (mesh.geometry.getAttribute("position").count
      + named(scene, "future").geometry.getAttribute("position").count) / 3;
    expect(propTriangles).toBeLessThanOrEqual(2000);
  });

  it("preserves V2 pine bark and needle pigments through the shared material", () => {
    const scene = create(), pine = named(scene, "needles");
    const source = createPineCrownV2(104), flat = source.toNonIndexed();
    try {
      const expected = flat.getAttribute("color"), actual = pine.geometry.getAttribute("color");
      expect(actual.count).toBe(expected.count);
      for (let i = 0; i < actual.count; i++) {
        const pigment = new Color().fromBufferAttribute(actual, i).multiply(pine.material.color);
        const original = new Color().fromBufferAttribute(expected, i).multiply(new Color(RAMP_PRESETS.crown));
        expect(pigment.r).toBeCloseTo(original.r, 6);
        expect(pigment.g).toBeCloseTo(original.g, 6);
        expect(pigment.b).toBeCloseTo(original.b, 6);
      }
    } finally { source.dispose(); flat.dispose(); }
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
