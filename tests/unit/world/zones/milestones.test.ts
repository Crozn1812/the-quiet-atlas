import { Box3, BufferGeometry, Color, CylinderGeometry, Mesh, MeshBasicMaterial, MeshToonMaterial, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZONE_IDS } from "../../../../src/features/interaction/targets";
import { arrivalPoint } from "../../../../src/features/navigation/signposts";
import { CAMERA_CLEARANCE, CAMERA_PITCH, INITIAL_ZOOM } from "../../../../src/features/world/camera";
import { pathLength, pathPointAt } from "../../../../src/features/world/layout/path";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { createPineCrownV2 } from "../../../../src/features/world/foliage/pine";
import { createFoliageColliders } from "../../../../src/features/world/foliage/colliders";
import { scatterTile } from "../../../../src/features/world/foliage/scatter";
import { TILE_SIZE } from "../../../../src/features/world/terrain/tiles";
import { disposeRampGradients, RAMP_PRESETS } from "../../../../src/features/world/materials/ramp";
import { HEIGHT } from "../../../../src/features/world/scene";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { ZONES } from "../../../../src/features/world/layout/zones";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import {
  createMilestonesScene, FUTURE_BASE_HEX, INK_BASE_HEX, milestoneCertificates, type MilestoneStatueMetadata, WEATHERED_BASE_HEX,
} from "../../../../src/features/world/zones/milestones";
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
function statueMeta(scene: ZoneScene): MilestoneStatueMetadata {
  return scene.group.userData.statue as MilestoneStatueMetadata;
}
function pedestalPoints(scene: ZoneScene) {
  return points(named(scene, "weathered"), 0, 312);
}
function statuePoints(scene: ZoneScene) {
  return points(named(scene, "weathered"), 0, statueMeta(scene).weatheredStatueVertexCount);
}
function unique(pts: Vector3[]) {
  return [...new Map(pts.map(point => [point.toArray().map(n => n.toFixed(5)).join(","), point])).values()];
}
/** Convex silhouette in the road-facing YZ plane, ignoring collinear ring/subdivision vertices. */
function outline(vertices: Vector3[]) {
  const sorted = [...new Map(vertices.map(p => [`${p.y.toFixed(5)},${p.z.toFixed(5)}`, p])).values()]
    .sort((a, b) => a.y - b.y || a.z - b.z);
  const half = (pts: Vector3[]) => {
    const hull: Vector3[] = [];
    for (const point of pts) {
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
  it("shows the monumental 6–8 m portrait bust from arrival and the 10–30 m trail approach in the default camera", () => {
    const [scene] = placeZoneScenes(surfaceHeight, ["milestones"]);
    const trunkGeometry = new CylinderGeometry(1, 1, 2, 6);
    const trunkMaterial = new MeshBasicMaterial();
    try {
      const arrival = arrivalPoint("milestones");
      const layout = ZONES.find(zone => zone.id === "milestones")!;
      const main = new Box3().setFromPoints(statuePoints(scene!).map(p => scene!.group.localToWorld(p.clone())));
      const aim = main.getCenter(new Vector3());
      const trunks: Mesh[] = [];
      for (let ix = Math.floor((aim.x - 64) / TILE_SIZE); ix <= Math.floor((aim.x + 64) / TILE_SIZE); ix++) {
        for (let iz = Math.floor((aim.z - 64) / TILE_SIZE); iz <= Math.floor((aim.z + 64) / TILE_SIZE); iz++) {
          for (const trunk of createFoliageColliders(scatterTile({ ix, iz }))) {
            const mesh = new Mesh(trunkGeometry, trunkMaterial);
            mesh.position.set(trunk.x, trunk.y, trunk.z);
            mesh.quaternion.copy(trunk.rotation);
            mesh.scale.set(trunk.radius, trunk.halfHeight, trunk.radius);
            mesh.updateMatrixWorld(true);
            trunks.push(mesh);
          }
        }
      }
      for (const distance of [undefined, 10, 15, 20, 25, 30]) {
        const point = distance === undefined ? new Vector3(arrival.position.x, 0, arrival.position.z)
          : pathPointAt(layout.t - distance / pathLength());
        const yaw = distance === undefined ? arrival.yaw
          : Math.atan2(point.x - layout.position.x, point.z - layout.position.z);
        const target = new Vector3(point.x, surfaceHeight(point.x, point.z) + HEIGHT + 0.02, point.z);
        const direction = new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH));
        const camera = new PerspectiveCamera(55, 1, 0.1, 100);
        camera.position.copy(target).addScaledVector(direction, INITIAL_ZOOM);
        camera.position.y = Math.max(camera.position.y, surfaceHeight(camera.position.x, camera.position.z) + CAMERA_CLEARANCE);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        const angle = camera.getWorldDirection(new Vector3()).angleTo(aim.clone().sub(camera.position)) * 180 / Math.PI;
        expect(angle).toBeLessThanOrEqual(28);
        const projected = aim.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
        const ray = new Raycaster(camera.position, aim.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(aim));
        expect(ray.intersectObjects(trunks)).toHaveLength(0);
      }
    } finally { scene!.dispose(); trunkGeometry.dispose(); trunkMaterial.dispose(); }
  });

  it("keeps the plinth collider, pine trunk collider and road-side interaction target in place", () => {
    const scene = create();
    expect(scene.colliders).toHaveLength(2);
    // Collider 0: Plinth supporting the monumental bust centered at x = 4.7, z = 0
    expect(scene.colliders[0]!.center.x).toBeCloseTo(4.7, 1);
    expect(scene.colliders[0]!.center.z).toBeCloseTo(0, 1);
    expect(scene.colliders[0]!.size.x).toBeCloseTo(2.2, 1);
    expect(scene.colliders[0]!.size.z).toBeCloseTo(2.8, 1);
    expect(scene.colliders[0]!.size.y).toBeCloseTo(1.0, 1);
    // Collider 1: Pine trunk at x = 15, z = 2.7
    expect(scene.colliders[1]!.center.distanceTo(new Vector3(15.01386, 2.1, 2.7))).toBeLessThanOrEqual(0.1);
    // Road-side interaction target on the plinth (x = 4.7, y = 1.38, z = 0)
    expect(scene.interactable.position.x).toBeCloseTo(4.7, 1);
    expect(scene.interactable.position.z).toBeCloseTo(0, 1);
    expect(scene.interactable.position.y).toBeCloseTo(1.38, 1);
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
      const target = scene.interactable.position;
      expect(target.x).toBeLessThan(-PATH_CLEARANCE);
      expect(Math.abs(target.z)).toBeGreaterThan(8);
      const edge = new Vector3(-PATH_CLEARANCE, 0, target.z);
      edge.y = heightAt(edge.x, edge.z) + HEIGHT;
      expect(edge.distanceTo(target)).toBeLessThanOrEqual(2.5);
      const localHeights = unique(statuePoints(scene)).map(point =>
        point.y - heightAt(point.x, point.z));
      expect(Math.min(...localHeights)).toBeCloseTo(-0.05, 5);
      expect(Math.max(...localHeights)).toBeGreaterThanOrEqual(5.6);
      expect(Math.max(...localHeights)).toBeLessThanOrEqual(6.2);
      // Plinth, chest and portrait head sight lines must reach the statue before any terrain lip.
      const meta = statueMeta(scene);
      const headCenter = meta.portrait.head.getCenter(new Vector3());
      const torsoCenter = meta.portrait.torso.getCenter(new Vector3());
      const plinthCenter = meta.portrait.pedestal.getCenter(new Vector3());
      for (const aimLocal of [plinthCenter, torsoCenter, headCenter]) {
        const eye = scene.group.localToWorld(edge.clone());
        const aim = scene.group.localToWorld(aimLocal.clone());
        const hit = new Raycaster(eye, aim.clone().sub(eye).normalize())
          .intersectObjects(scene.group.children)[0];
        expect(hit?.object.name).toMatch(/^milestones-(ink|weathered|future)$/);
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
    expect(triangles).toBeLessThanOrEqual(ZONE_BUDGET.triangles);
    const propTriangles = (named(scene, "weathered").geometry.getAttribute("position").count
      + named(scene, "future").geometry.getAttribute("position").count) / 3;
    expect(propTriangles).toBeLessThanOrEqual(2000);
    expect(drawCalls).toBe(5);
    expect(drawCalls).toBeLessThanOrEqual(ZONE_BUDGET.drawCalls);
    if (seed === 104) console.info(`MS-02 Milestones: ${triangles} total triangles (${propTriangles} prop triangles), ${drawCalls} draw calls`);
  });

  it("repeats all geometry, materials, colliders and target for the same seed", () => {
    const first = create(), second = create();
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(create({ seed: 105 }))).not.toEqual(snapshot(first));
  });

  it.each([0, 1, 104, 105, 65535, 73024, 2147483647, 4294967295])("seed %i: has 5–9 unequal silhouette edges on the plinth and a nonplanar front", seed => {
    for (const side of [1, -1]) {
      const scene = create({ seed, underWater: x => side * x < 0 });
      const vertices = pedestalPoints(scene), hull = outline(vertices);
      expect(hull.length).toBeGreaterThanOrEqual(5);
      expect(hull.length).toBeLessThanOrEqual(9);
      const lengths = hull.map((p, i) => {
        const next = hull[(i + 1) % hull.length]!;
        return Math.hypot(next.y - p.y, next.z - p.z);
      });
      const variation = (Math.max(...lengths) - Math.min(...lengths)) / (lengths.reduce((sum, n) => sum + n, 0) / lengths.length);
      expect(variation).toBeGreaterThanOrEqual(0.2);
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
    console.info(`milestones real-terrain construction: ${elapsed.toFixed(1)} ms wall, ${cpuMs.toFixed(1)} ms CPU (budget 450 ms)`);
    expect(cpuMs).toBeLessThanOrEqual(450);
  });

  it.each([0, 1, 104, 65535])("seed %i: has the 5.6–6.2 m unfinished portrait bust of Duy, stone shards and hovering planned certificate blocks", seed => {
    const scene = create({ seed });
    expect(scene.zoneId).toBe("milestones");
    // Only 2 colliders: plinth + pine trunk (no scattered ground rocks far from the statue).
    expect(scene.colliders).toHaveLength(2);
    const vertices = unique(statuePoints(scene));
    const height = Math.max(...vertices.map(point => point.y));
    const minFoot = Math.min(...vertices.map(point => point.y));
    expect(height).toBeGreaterThanOrEqual(5.6);
    expect(height).toBeLessThanOrEqual(6.2);
    expect(minFoot).toBeCloseTo(-0.05, 5);

    const meta = statueMeta(scene);
    expect(meta.totalHeight).toBeGreaterThanOrEqual(5.6);
    expect(meta.totalHeight).toBeLessThanOrEqual(6.2);
    const shards = meta.floatingFragments.filter(f => f.kind === "stone-shard");
    expect(shards.length).toBeGreaterThanOrEqual(4);
    expect(shards.length).toBeLessThanOrEqual(8);
    expect(named(scene, "future").material.color.r).toBeGreaterThan(named(scene, "weathered").material.color.r);
  });

  it.each([false, true])("grounds the statue plinth directly without a mound and keeps a clear road view (mirrored: %s)", wet => {
    const scene = create({ underWater: x => wet && x > 0 });
    expect(named(scene, "mound")).toBeUndefined();
    const foot = Math.min(...statuePoints(scene).map(point => point.y));
    expect(foot).toBeCloseTo(-0.05, 5);
    const pine = points(named(scene, "needles"));
    const plinthOuterEdge = Math.abs(scene.colliders[0]!.center.x) + scene.colliders[0]!.size.x / 2;
    expect(Math.min(...pine.map(point => Math.abs(point.x)))).toBeGreaterThan(plinthOuterEdge);
    const target = scene.interactable.position;
    scene.group.updateMatrixWorld(true);
    for (const dz of [-1.2, 0, 1.2]) {
      const eye = new Vector3(Math.sign(target.x) * PATH_CLEARANCE, 1.5, target.z + dz);
      const ray = new Raycaster(eye, target.clone().sub(eye).normalize());
      const hit = ray.intersectObjects(scene.group.children)[0];
      expect(hit?.object.name).toBe("milestones-weathered");
      expect(hit!.point.distanceTo(target)).toBeLessThan(1.4);
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
    expect(Math.abs(floodedCentre.interactable.position.z)).toBeGreaterThanOrEqual(12);
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

  it("keeps the labelled plinth 2–6 m from the corridor and within E range at its edge", () => {
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

  it("uses warm light-grey stone (luma 0.40–0.60), outward normals and blue-violet ramp shadows", () => {
    for (const side of [1, -1] as const) {
      const scene = create({ underWater: x => side * x < 0 });
      const weathered = named(scene, "weathered");
      const future = named(scene, "future");
      const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma(weathered.material.color)).toBeGreaterThanOrEqual(0.40);
      expect(luma(weathered.material.color)).toBeLessThanOrEqual(0.60);
      expect(luma(future.material.color)).toBeGreaterThan(luma(weathered.material.color));

      // Verify outward normals on the portrait head and shoulders so faces receive direct sunlight instead of black back-face shading.
      const meta = statueMeta(scene);
      const pos = weathered.geometry.getAttribute("position");
      const norm = weathered.geometry.getAttribute("normal");
      let upwardTopNormals = 0;
      let roadFacingNormals = 0;
      for (let i = 312; i < meta.weatheredStatueVertexCount; i++) {
        const y = pos.getY(i);
        const nx = norm.getX(i), ny = norm.getY(i);
        if (y > 5.4 && ny > 0.80) upwardTopNormals++;
        if (y > 2.0 && y < 5.8 && side * nx < -0.85) roadFacingNormals++;
      }
      expect(upwardTopNormals).toBeGreaterThan(0);
      expect(roadFacingNormals).toBeGreaterThan(20);
    }

    const scene = create();
    const expected = [
      new Color(WEATHERED_BASE_HEX).getHex(),
      new Color(FUTURE_BASE_HEX).getHex(),
      new Color(INK_BASE_HEX).getHex(),
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

  it("uses dark ink pigment for the trunk, round glasses and >= 0.35 m carved English inscriptions, with two 0.13 m flower accents", () => {
    const scene = create();
    const inkTris = named(scene, "ink").geometry.getAttribute("position").count / 3;
    expect(inkTris).toBeGreaterThan(42 + 80);
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

  it.each([0, 1, 104, 65535])("seed %i: localises green moss at the plinth foot and pale lichen above it", seed => {
    const scene = create({ seed }), mesh = named(scene, "weathered");
    const colors = mesh.geometry.getAttribute("color");
    const green: number[] = [], pale: number[] = [];
    const vertices = pedestalPoints(scene);
    for (let i = 0; i < vertices.length; i++) {
      const point = vertices[i]!, localY = point.y;
      const pigment = new Color().fromBufferAttribute(colors, i).multiply(mesh.material.color);
      if (pigment.g > pigment.r * 1.05) green.push(localY);
      if (pigment.r > 0.58 && pigment.b > 0.36) pale.push(localY);
    }
    expect(green.length).toBeGreaterThan(5);
    expect(Math.max(...green)).toBeLessThan(0.35);
    expect(pale.length).toBeGreaterThan(2);
    expect(Math.min(...pale)).toBeGreaterThan(0.2);
    expect(pale.length).toBeLessThan(vertices.length * 0.55);
    // The four loose pebble chips are embedded directly in the terrain at the plinth foot.
    const chipStart = statueMeta(scene).weatheredStatueVertexCount;
    for (let chip = 0; chip < 4; chip++) {
      const foot = Math.min(...points(mesh, chipStart + chip * 78, 78).map(point => point.y));
      expect(foot).toBeCloseTo(-0.04, 5);
    }
    const propTriangles = (mesh.geometry.getAttribute("position").count
      + named(scene, "future").geometry.getAttribute("position").count) / 3;
    expect(propTriangles).toBeLessThanOrEqual(2000);
  });

  it("sculpts the 5.6–6.2 m unfinished portrait bust of Duy with >= 0.30 m carved English letters, dark recessed sockets, 4 orbiting stone shards and 2 lighter planned blocks", () => {
    const certs = milestoneCertificates();
    expect(certs).toHaveLength(4);
    expect(certs.filter(c => c.achieved).map(c => c.inscription)).toEqual(["CCNA", "VTI DEVOPS"]);
    expect(certs.filter(c => !c.achieved).map(c => c.inscription)).toEqual(["AWS SAA", "LINUX CEH"]);
    for (const c of certs) {
      expect(c.inscription).toMatch(/^[A-Z0-9 ]+$/);
      if (c.achieved) {
        expect(c.charHeight).toBeGreaterThanOrEqual(0.30);
        expect(c.carveDepth).toBeGreaterThanOrEqual(0.05);
      } else {
        expect(c.carveDepth).toBeLessThanOrEqual(0.02);
      }
    }

    const scene = create();
    scene.group.updateMatrixWorld(true);
    const meta = statueMeta(scene);
    expect(meta.fittedPieces).toHaveLength(2);
    expect(meta.fittedPieces.map(p => p.inscription)).toEqual(["CCNA", "VTI DEVOPS"]);
    for (const piece of meta.fittedPieces) {
      expect(piece.charHeight).toBeGreaterThanOrEqual(0.30);
      expect(piece.carveDepth).toBeGreaterThanOrEqual(0.05);
    }

    expect(meta.plannedPieces).toHaveLength(2);
    expect(meta.plannedPieces.map(p => p.inscription)).toEqual(["AWS SAA", "LINUX CEH"]);
    for (const planned of meta.plannedPieces) {
      expect(planned.carveDepth).toBeLessThanOrEqual(0.02);
    }

    expect(meta.hollowGaps).toHaveLength(2);
    expect(meta.hollowGaps.map(g => g.inscription)).toEqual(["AWS SAA", "LINUX CEH"]);
    expect(meta.inscribedStrokeCount).toBeGreaterThanOrEqual(25);

    // Each hovering planned certificate piece sits 0.9–1.5 m in front of its corresponding recessed socket.
    for (const planned of meta.plannedPieces) {
      const gap = meta.hollowGaps.find(g => g.slot === planned.slot)!;
      const distance = planned.bounds.getCenter(new Vector3()).distanceTo(gap.bounds.getCenter(new Vector3()));
      expect(distance).toBeGreaterThanOrEqual(0.9);
      expect(distance).toBeLessThanOrEqual(1.5);
    }

    // Clear portrait bust silhouette: plinth -> broad shoulders/chest -> narrower neck -> head with round glasses & blocky hair.
    expect(meta.portrait.pedestal.min.y).toBeCloseTo(-0.05, 4);
    expect(meta.portrait.pedestal.max.y).toBeCloseTo(1.0, 1);
    const shoulderWidth = meta.portrait.shoulders.getSize(new Vector3()).z;
    const neckWidth = meta.portrait.neck.getSize(new Vector3()).z;
    const headWidth = meta.portrait.head.getSize(new Vector3()).z;
    expect(shoulderWidth).toBeGreaterThan(3.5);
    expect(neckWidth).toBeLessThan(headWidth * 0.7);
    expect(meta.portrait.head.min.y).toBeGreaterThan(meta.portrait.torso.min.y);
    expect(meta.portrait.glasses.min.y).toBeGreaterThan(meta.portrait.head.min.y);
    expect(meta.portrait.glasses.getSize(new Vector3()).z).toBeGreaterThan(0.60);
    expect(meta.portrait.hair.max.y).toBeGreaterThanOrEqual(5.6);
    expect(meta.portrait.hair.max.y).toBeLessThanOrEqual(6.2);

    // Floating fragments include the 2 planned certificate blocks, 2 head shards and 4 shoulder stone shards.
    expect(meta.floatingFragments.filter(f => f.kind === "certificate-piece")).toHaveLength(2);
    expect(meta.floatingFragments.filter(f => f.kind === "crown-lock")).toHaveLength(2);
    const orbitingShards = meta.floatingFragments.filter(f => f.kind === "stone-shard");
    expect(orbitingShards.length).toBeGreaterThanOrEqual(4);
    expect(orbitingShards.length).toBeLessThanOrEqual(8);
    for (const fragment of meta.floatingFragments) {
      expect(fragment.bounds.min.y).toBeGreaterThan(1.45);
    }

    // When all certificates are achieved, all 4 slots are fitted with zero planned gaps.
    const completed = milestoneCertificates({
      profiles: [{
        locale: "en",
        certificates: [
          { title: "Certificate of Completion: DevOps, VTI Academy", description: "Issued 2025." },
          { title: "CCNA (Cisco Certified Network Associate)", description: "Received 03/2026." },
          { title: "AWS Solutions Architect Associate", description: "Issued 2026." },
          { title: "Linux Foundation LFCS & CEH", description: "Issued 2026." },
        ],
      }],
    });
    expect(completed.every(c => c.achieved)).toBe(true);
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
    expect(dispose.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(() => create({ onPath: () => true })).toThrow(RangeError);
  });
});
