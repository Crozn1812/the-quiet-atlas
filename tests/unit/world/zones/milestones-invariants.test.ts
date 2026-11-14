import { readFileSync } from "node:fs";
import {
  Box3, BufferGeometry, CylinderGeometry, Material, Mesh, MeshBasicMaterial, MeshToonMaterial,
  PerspectiveCamera, Points, Raycaster, Scene, Vector3, type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZONE_IDS } from "../../../../src/features/interaction/targets";
import { arrivalPoint } from "../../../../src/features/navigation/signposts";
import { CAMERA_CLEARANCE, CAMERA_PITCH, INITIAL_ZOOM } from "../../../../src/features/world/camera";
import { pathLength, pathPointAt } from "../../../../src/features/world/layout/path";
import { ZONES } from "../../../../src/features/world/layout/zones";
import { createFoliageColliders } from "../../../../src/features/world/foliage/colliders";
import { scatterTile } from "../../../../src/features/world/foliage/scatter";
import { createRampGradient } from "../../../../src/features/world/materials/ramp";
import { HEIGHT } from "../../../../src/features/world/scene";
import { surfaceHeight } from "../../../../src/features/world/scene/compose";
import { TILE_SIZE } from "../../../../src/features/world/terrain/tiles";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt } from "../../../../src/features/world/terrain/height";
import { nearestPath } from "../../../../src/features/world/terrain/samples";
import { placeZoneScenes } from "../../../../src/features/world/zones";
import { createMilestonesScene, milestoneCertificates, STATUE_YAW } from "../../../../src/features/world/zones/milestones";
import { certificateSlots } from "../../../../src/features/world/zones/milestones-statue-geometry";
import { PATH_CLEARANCE, type ZoneScene, type ZoneSceneContext } from "../../../../src/features/world/zones/types";

const scenes: ZoneScene[] = [];
const context = (overrides: Partial<ZoneSceneContext> = {}): ZoneSceneContext => ({
  seed: 104, heightAt: () => 0, onPath: x => Math.abs(x) <= PATH_CLEARANCE, underWater: () => false, ...overrides,
});
function create(overrides: Partial<ZoneSceneContext> = {}) {
  const scene = createMilestonesScene(context(overrides)); scenes.push(scene); return scene;
}
function real() {
  const [scene] = placeZoneScenes(surfaceHeight, ["milestones"]); scenes.push(scene!); return scene!;
}
function renderables(scene: ZoneScene) {
  const result: (Mesh | Points)[] = [];
  scene.group.traverse(node => { if (node instanceof Mesh || node instanceof Points) result.push(node); });
  return result;
}
function named(scene: ZoneScene, name: string) { return scene.group.getObjectByName(name) as Mesh; }
function stone(scene: ZoneScene) { return renderables(scene).find(node => node.userData.milestonesSurface === "weathered") as Mesh; }
function points(mesh: Mesh, count = mesh.geometry.getAttribute("position").count) {
  return Array.from({ length: count }, (_, i) => new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), i));
}
function snapshot(scene: ZoneScene) {
  scene.group.updateMatrixWorld(true);
  return { colliders: scene.colliders, target: scene.interactable, meshes: renderables(scene).map(mesh => ({
    name: mesh.name, matrix: mesh.matrixWorld.toArray(),
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, value]) => [name, Array.from(value.array)])),
    index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
    material: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => ({
      type: material.type, name: material.name, opacity: material.opacity, side: material.side,
    })),
  })) };
}
async function detail(scene: ZoneScene) {
  const bytes = readFileSync("public/world/milestones/character-milestones-walk.glb");
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValueOnce(gltf);
  const body = named(scene, "milestones-static-walk-white");
  const world = new Scene(); world.add(scene.group); scene.group.updateMatrixWorld(true);
  body.onBeforeRender({ domElement: { closest: () => ({ getAttribute: () => "high" }) } } as unknown as WebGLRenderer,
    world, new PerspectiveCamera(), body.geometry, body.material as Material, null as never);
  await vi.waitFor(() => expect(scene.group.userData.statue.ready).toBe(true));
  return body;
}
afterEach(() => { scenes.splice(0).forEach(scene => scene.dispose()); vi.restoreAllMocks(); });

describe("MS-C2 restored hillside invariants (original numeric thresholds)", () => {
  it("grounds the real-terrain plinth at -0.05 m and the walking body on its 1 m top", async () => {
    const scene = real(), body = await detail(scene);
    const heightAt = (p: Vector3) => { const world = scene.group.localToWorld(new Vector3(p.x, 0, p.z)); return surfaceHeight(world.x, world.z) - scene.group.position.y; };
    const plinth = points(stone(scene), 312);
    expect(Math.min(...plinth.map(p => p.y - heightAt(p)))).toBeCloseTo(-.05, 5);
    const statue = body.parent!;
    expect(statue.position.y - heightAt(statue.position)).toBeCloseTo(1, 5);
    body.geometry.computeBoundingBox();
    expect(body.geometry.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(body.geometry.boundingBox!.max.y).toBeGreaterThanOrEqual(5.6);
    expect(body.geometry.boundingBox!.max.y).toBeLessThanOrEqual(6.2);
    const edge = new Vector3(-PATH_CLEARANCE, 0, scene.interactable.position.z);
    edge.y = heightAt(edge) + HEIGHT;
    expect(edge.distanceTo(scene.interactable.position)).toBeLessThanOrEqual(2.5);
  });

  it("keeps the plinth 2–6 m from the corridor and within E range at its edge on either bank", () => {
    for (const seed of [0, 1, 104, 65535]) for (const wet of [false, true]) {
      const scene = create({ seed, underWater: x => wet && x > 0 }), p = scene.interactable.position;
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeGreaterThanOrEqual(2);
      expect(Math.abs(p.x) - PATH_CLEARANCE).toBeLessThanOrEqual(6);
      expect(new Vector3(Math.sign(p.x) * PATH_CLEARANCE, HEIGHT, p.z).distanceTo(p)).toBeLessThanOrEqual(2.5);
    }
  });

  it("preserves the plinth/pine collider sizes, yaw and reserved interaction target", () => {
    const scene = create();
    expect(scene.colliders).toHaveLength(2);
    expect(scene.colliders[0]!.center).toEqual(new Vector3(4.7, .5, 0));
    expect(scene.colliders[0]!.size.distanceTo(new Vector3(2.2, 1, 2.8))).toBeLessThan(.0001);
    expect(scene.colliders[0]!.yaw).toBe(STATUE_YAW);
    expect(scene.colliders[1]!.center.distanceTo(new Vector3(15.01386, 2.1, 2.7))).toBeLessThanOrEqual(.1);
    expect(scene.interactable).toEqual({ position: new Vector3(4.7, 1.38, 0), label: { vi: "Cụm đá dấu mốc", en: "Milestone rocks" } });
  });

  it("reserves the click target between the ankles before and after deferred loading", async () => {
    const scene = create(); scene.group.updateMatrixWorld(true);
    for (const loaded of [false, true]) {
      if (loaded) await detail(scene);
      for (const dz of [-1.2, 0, 1.2]) {
        const target = scene.interactable.position, eye = new Vector3(PATH_CLEARANCE, 1.5, target.z + dz);
        const hits = new Raycaster(eye, target.clone().sub(eye).normalize()).intersectObject(scene.group);
        expect(hits[0]?.object).toBe(stone(scene));
        expect(hits[0]!.point.distanceTo(target)).toBeLessThan(1.4);
      }
    }
  });

  it("repeats geometry, pigments, transforms, colliders and target with the same seed", async () => {
    const first = create(), second = create();
    await detail(first); await detail(second);
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(snapshot(create({ seed: 105 }))).not.toEqual(snapshot(create()));
  });

  it("disposes each owned geometry/material once and preserves shared ramps and sibling resources", async () => {
    const scene = create(), sibling = create(); await detail(scene); await detail(sibling);
    const geometries = new Set(renderables(scene).map(mesh => mesh.geometry));
    const materials = new Set(renderables(scene).flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    const owned = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
    const siblingOwned = renderables(sibling).flatMap(mesh => [mesh.geometry, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]);
    const untouched = [...new Set(siblingOwned)].map(resource => vi.spyOn(resource, "dispose"));
    const ramp = vi.spyOn(createRampGradient(), "dispose");
    expect([...materials].some(material => material instanceof MeshToonMaterial && material.gradientMap)).toBe(true);
    scene.dispose(); scene.dispose();
    owned.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    untouched.forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(ramp).not.toHaveBeenCalled(); expect(scene.group.children).toHaveLength(0);
  });

  it("releases temporary construction geometry when neither dry bank fits", () => {
    const spy = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => create({ underWater: () => true })).toThrow(RangeError);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(() => create({ onPath: () => true })).toThrow(RangeError);
  });

  it("constructs the composed real-terrain zone within 450 ms of Node CPU", () => {
    const layout = ZONES.find(zone => zone.id === "milestones")!, yaw = Math.atan2(layout.lookDirection.x, layout.lookDirection.z);
    const anchorY = surfaceHeight(layout.position.x, layout.position.z);
    const world = (x: number, z: number) => ({ x: layout.position.x + x * Math.cos(yaw) + z * Math.sin(yaw), z: layout.position.z - x * Math.sin(yaw) + z * Math.cos(yaw) });
    const ctx = context({ seed: TERRAIN_SEED + ZONE_IDS.indexOf("milestones"),
      heightAt(x, z) { const p = world(x, z); return surfaceHeight(p.x, p.z) - anchorY; },
      onPath(x, z) { const p = world(x, z); return Math.abs(x) <= PATH_CLEARANCE || nearestPath(p.x, p.z).distance <= PATH_WIDTH / 2; },
      underWater(x, z) { const p = world(x, z); return surfaceHeight(p.x, p.z) <= waterLevelAt(p.z); },
    });
    const start = process.cpuUsage(); create(ctx); const elapsed = process.cpuUsage(start);
    const cpuMs = (elapsed.user + elapsed.system) / 1000;
    console.info(`milestones real-terrain construction: ${cpuMs.toFixed(1)} ms CPU (budget 450 ms)`);
    expect(cpuMs).toBeLessThanOrEqual(450);
  });

  it("leaves every loaded transform and geometry byte unchanged during reduced motion updates", async () => {
    const scene = create(); await detail(scene); const before = snapshot(scene);
    for (let i = 0; i < 120; i++) scene.update?.(1 / 30, true);
    expect(snapshot(scene)).toEqual(before);
  });

  it("shows the loaded statue from arrival and the 10–30 m approach in the default camera without tree occlusion", async () => {
    const scene = real(), body = await detail(scene);
    const arrival = arrivalPoint("milestones"), layout = ZONES.find(zone => zone.id === "milestones")!;
    const aim = new Box3().setFromObject(body).getCenter(new Vector3());
    const geometry = new CylinderGeometry(1, 1, 2, 6), material = new MeshBasicMaterial();
    try {
      const trunks: Mesh[] = [];
      for (let ix = Math.floor((aim.x - 64) / TILE_SIZE); ix <= Math.floor((aim.x + 64) / TILE_SIZE); ix++) {
        for (let iz = Math.floor((aim.z - 64) / TILE_SIZE); iz <= Math.floor((aim.z + 64) / TILE_SIZE); iz++) {
          for (const trunk of createFoliageColliders(scatterTile({ ix, iz }))) {
            const mesh = new Mesh(geometry, material); mesh.position.set(trunk.x, trunk.y, trunk.z);
            mesh.quaternion.copy(trunk.rotation); mesh.scale.set(trunk.radius, trunk.halfHeight, trunk.radius); mesh.updateMatrixWorld(true); trunks.push(mesh);
          }
        }
      }
      for (const distance of [undefined, 10, 15, 20, 25, 30]) {
        const p = distance === undefined ? new Vector3(arrival.position.x, 0, arrival.position.z) : pathPointAt(layout.t - distance / pathLength());
        const yaw = distance === undefined ? arrival.yaw : Math.atan2(p.x - layout.position.x, p.z - layout.position.z);
        const target = new Vector3(p.x, surfaceHeight(p.x, p.z) + HEIGHT + .02, p.z);
        const direction = new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH));
        const camera = new PerspectiveCamera(55, 1, .1, 100); camera.position.copy(target).addScaledVector(direction, INITIAL_ZOOM);
        camera.position.y = Math.max(camera.position.y, surfaceHeight(camera.position.x, camera.position.z) + CAMERA_CLEARANCE);
        camera.lookAt(target); camera.updateMatrixWorld(true);
        expect(camera.getWorldDirection(new Vector3()).angleTo(aim.clone().sub(camera.position)) * 180 / Math.PI).toBeLessThanOrEqual(28);
        const projected = aim.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1); expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
        expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
        expect(new Raycaster(camera.position, aim.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(aim)).intersectObjects(trunks)).toHaveLength(0);
      }
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("retains 25° yaw towards Roots and >=0.5 m horizontal separation of planned shards", () => {
    for (const wet of [false, true]) {
      const scene = create({ underWater: x => wet && x > 0 }), statue = named(scene, "milestones-walking-statue");
      expect(STATUE_YAW).toBeCloseTo(25 * Math.PI / 180, 4);
      expect(statue.rotation.y).toBeCloseTo(-Math.sign(statue.position.x) * (Math.PI / 2 + STATUE_YAW), 4);
      // The forward vector always points towards the earlier/Roots side (-Z).
      expect(new Vector3(0, 0, 1).applyEuler(statue.rotation).z).toBeLessThan(0);
      const slots = certificateSlots(milestoneCertificates()).filter(slot => !slot.certificate.achieved);
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        expect(Math.hypot(slots[i]!.floating.x - slots[j]!.floating.x, slots[i]!.floating.z - slots[j]!.floating.z)).toBeGreaterThanOrEqual(.5);
      }
    }
  });

  it("engraves exactly the data inscriptions and no extra certificate pieces", async () => {
    const scene = create(); await detail(scene);
    const slots = scene.group.userData.statue.certificates as ReturnType<typeof certificateSlots>;
    expect(slots.map(slot => slot.certificate)).toEqual(milestoneCertificates());
    const calls: string[] = [];
    const getContext = vi.fn(() => ({ fillText: (text: string) => calls.push(text) }));
    vi.stubGlobal("document", { createElement: () => ({ getContext }) });
    try {
      const { createMilestonesStatue } = await import("../../../../src/features/world/zones/milestones-statue");
      const statue = createMilestonesStatue(milestoneCertificates());
      try {
        expect(calls).toEqual(milestoneCertificates().flatMap(piece => piece.inscription.split(" ").flatMap(word => [word, word])));
        expect(statue.slots).toHaveLength(milestoneCertificates().length);
        expect(statue.slots.every(slot => slot.certificate.charHeight >= .26)).toBe(true);
      } finally { statue.dispose(); }
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([false, true])("keeps visible vertices and collider footprints clear of path/water (wet bank %s)", async wet => {
    const ctx = context({ underWater: x => wet && x > 0 }), scene = create(ctx); await detail(scene); scene.group.updateMatrixWorld(true);
    for (const mesh of renderables(scene)) for (const p of points(mesh as Mesh)) {
      const local = scene.group.worldToLocal(mesh.localToWorld(p));
      expect(Math.abs(local.x)).toBeGreaterThan(PATH_CLEARANCE);
      expect(ctx.onPath(local.x, local.z)).toBe(false); expect(ctx.underWater(local.x, local.z)).toBe(false);
    }
    for (const box of scene.colliders) for (let ix = 0; ix <= 10; ix++) for (let iz = 0; iz <= 10; iz++) {
      const dx = box.size.x * (ix / 10 - .5), dz = box.size.z * (iz / 10 - .5), a = box.yaw ?? 0;
      const x = box.center.x + dx * Math.cos(a) - dz * Math.sin(a), z = box.center.z + dx * Math.sin(a) + dz * Math.cos(a);
      expect(Math.abs(x)).toBeGreaterThan(PATH_CLEARANCE); expect(ctx.onPath(x, z)).toBe(false); expect(ctx.underWater(x, z)).toBe(false);
    }
  });

  it("honours path branches and water within prop footprints", () => {
    expect(create({ onPath: (x, z) => Math.abs(x) <= 2.6 || x > 4 && Math.abs(z) < 1 }).interactable.position.x).toBeLessThan(0);
    expect(create({ underWater: (x, z) => x > 4.48 && x < 4.53 && Math.abs(z) < .9 }).interactable.position.x).toBeLessThan(0);
    expect(Math.abs(create({ underWater: (_x, z) => Math.abs(z) < 6.5 }).interactable.position.z)).toBeGreaterThanOrEqual(12);
  });

  it("drapes the retained plinth and trunk over slopes with shallowly embedded feet", () => {
    const heightAt = (x: number, z: number) => .04 * x + .025 * z, flat = create(), slope = create({ heightAt });
    for (const name of ["rock-stack-stones", "milestones-ink"]) {
      const a = points(named(flat, name)), b = points(named(slope, name)); expect(b).toHaveLength(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i]!.y).toBeCloseTo(a[i]!.y + heightAt(b[i]!.x, b[i]!.z), 5);
        expect(b[i]!.y).toBeGreaterThanOrEqual(heightAt(b[i]!.x, b[i]!.z) - .051);
      }
    }
  });

  it("retreats behind a steep lip to the same dry site deterministically", () => {
    const heightAt = (x: number, z: number) => z <= -6 ? 0 : -4 * Math.min(1, Math.max(0, x - 3));
    const flat = create(), retreat = create({ heightAt, underWater: x => x < 0 });
    expect(retreat.interactable.position.z - flat.interactable.position.z).toBeCloseTo(-16, 5);
    expect(snapshot(create({ heightAt, underWater: x => x < 0 }))).toEqual(snapshot(retreat));
  });
});
