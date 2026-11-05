import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Box3, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3 } from "three";
import { ZONES } from "../../../src/features/world/layout/zones";
import { ZONE_IDS } from "../../../src/features/interaction/targets";
import { HEIGHT } from "../../../src/features/world/scene";
import { placeZoneScenes, zoneFoliageBounds, createZoneEntryTracker } from "../../../src/features/world/zones";
import { createWorldScene } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { createController } from "../../../src/features/world/rapier";
import { scatterTile } from "../../../src/features/world/foliage/scatter";
import { scatterGround } from "../../../src/features/world/foliage/ground";
import { tilesToLoad } from "../../../src/features/world/terrain/streaming";

const h = vi.hoisted(() => ({
  canvas: undefined as unknown, scene: undefined as unknown, camera: undefined as unknown,
  zones: [] as ReturnType<typeof import("../../../src/features/world/zones").placeZoneScenes>,
  next: undefined as ((now: number) => void) | undefined,
  position: undefined as unknown, reduced: vi.fn(), idleMotion: vi.fn(),
}));
vi.mock("three", async original => {
  const actual = await original<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {
    domElement = h.canvas;
    shadowMap = { enabled: false };
    setPixelRatio() {} setSize() {} dispose() {} forceContextLoss() {}
  } };
});
vi.mock("../../../src/features/world/scene/paper", () => ({ createGradedPaperPass: () => ({
  setGrade() {}, setMist() {}, setFog() {}, setCorridor() {}, setSize() {}, setQuality() {}, dispose() {},
  render(scene: Scene, camera: PerspectiveCamera) {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); h.scene = scene; h.camera = camera;
  },
}) }));
vi.mock("../../../src/features/world/scene/compose", async original => ({
  ...await original<typeof import("../../../src/features/world/scene/compose")>(),
  surfaceHeight: () => 100,
  worldSpawn: () => new Vector3(ZONES[0]!.position.x, 100 + HEIGHT, ZONES[0]!.position.z),
  createWorldScene: ({ zoneBoxes }: { zoneBoxes: Mesh[] }) => ({
    sun: { castShadow: false }, collisionMeshes: zoneBoxes, visibleMeshes: [], foliageMeshes: [],
    update() {}, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload() {}, dispose() {}, setReducedMotion: h.reduced,
  }),
}));
vi.mock("../../../src/features/world/raycast", () => ({ createController: async () => {
  const position = new Vector3(); h.position = position;
  return { position, grounded: true, teleport: (p: Vector3) => position.copy(p), resetVelocity() {}, dispose() {},
    step(x: number, z: number, dt: number) { position.x += x * dt; position.z += z * dt; } };
} }));
vi.mock("../../../src/features/world/zones", async original => {
  const actual = await original<typeof import("../../../src/features/world/zones")>();
  return { ...actual, placeZoneScenes: (height: (x: number, z: number) => number) => {
    const zones = actual.placeZoneScenes(height);
    zones.forEach(zone => { zone.update = vi.fn(zone.update); zone.dispose = vi.fn(zone.dispose); });
    h.zones = zones; return zones;
  } };
});
vi.mock("../../../src/features/world/character/loader", async () => {
  const { createFallbackCharacter } = await import("../../../src/features/world/character/fallback");
  return { loadCharacter: async () => createFallbackCharacter() };
});
vi.mock("../../../src/features/world/character/animator", async original => {
  const actual = await original<typeof import("../../../src/features/world/character/animator")>();
  return { ...actual, createCharacterAnimator: (...args: Parameters<typeof actual.createCharacterAnimator>) => {
    const animator = actual.createCharacterAnimator(...args);
    return { ...animator, setReducedMotion(value: boolean) { h.idleMotion(value); animator.setReducedMotion(value); } };
  } };
});
class Element extends EventTarget {
  dataset: Record<string, string> = {}; style = {}; attributes: Record<string, string> = {};
  children: Element[] = []; textContent = ""; clientWidth = 1000; clientHeight = 800; parent?: Element;
  appendChild(child: Element) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  focus() { doc.activeElement = this; } closest() { return null; }
  hasPointerCapture() { return false; } releasePointerCapture() {} setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
}
function send(target: EventTarget, type: string, detail?: unknown) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}
function key() {
  const event = new Event("keydown"); Object.assign(event, { code: "KeyE" }); win.dispatchEvent(event);
}
let doc: EventTarget & { activeElement: Element | null };
let win: EventTarget & { __tqaSkipIntro: boolean };
let media: EventTarget & { matches: boolean };
let container: Element;
let canvas: Element;
let now: number;
let unmount: (() => void) | undefined;
const position = () => h.position as Vector3;
function tick() { h.next!(now += 100); }
async function mount(skip = true) {
  win.__tqaSkipIntro = skip;
  const { mountWorld } = await import("../../../src/features/world");
  unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast" });
}
beforeEach(() => {
  vi.clearAllMocks(); now = 0;
  canvas = new Element(); h.canvas = canvas; container = new Element();
  media = Object.assign(new EventTarget(), { matches: false });
  doc = Object.assign(new EventTarget(), { activeElement: null, hidden: false, hasFocus: () => true, createElement: () => new Element() });
  win = Object.assign(new EventTarget(), { __tqaSkipIntro: true, devicePixelRatio: 1, matchMedia: () => media });
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => { h.next = cb; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => { unmount?.(); unmount = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("places eight groups at anchors, aims +Z along the path and opens every localized target via E and click", async () => {
  await mount();
  expect(h.zones.map(zone => zone.zoneId).sort()).toEqual([...ZONE_IDS].sort());
  const opened: CustomEvent[] = [];
  container.addEventListener("tqa:open-content", event => opened.push(event as CustomEvent));
  for (const zone of h.zones) {
    expect(zone.group.parent).toBe(h.scene);
    expect(zone.group.position).toEqual(new Vector3(zone.layout.position.x, 100, zone.layout.position.z));
    expect(new Vector3(0, 0, 1).applyQuaternion(zone.group.quaternion).dot(zone.layout.lookDirection)).toBeCloseTo(1);
    const point = zone.target.position;
    position().copy(point).add(new Vector3(-Math.sign(zone.interactable.position.x) * 1.1, 0, 0).applyQuaternion(zone.group.quaternion));
    tick();
    for (const locale of ["en", "vi"] as const) {
      send(container, "tqa:set-locale", { locale });
      expect(container.children.some(child => child.textContent === "E \u2014 " + zone.interactable.label[locale])).toBe(true);
      key(); expect(opened.at(-1)!.detail).toEqual({ zoneId: zone.zoneId });
    }
    const p = point.clone().project(h.camera as PerspectiveCamera);
    const event = new Event("click"); Object.assign(event, { button: 0, clientX: (p.x + 1) * 500, clientY: (1 - p.y) * 400 });
    const count = opened.length; canvas.dispatchEvent(event);
    expect(opened, `click at ${zone.zoneId}`).toHaveLength(count + 1);
    expect(opened.at(-1)!.detail).toEqual({ zoneId: zone.zoneId });
  }
  expect(opened.every(event => !event.bubbles)).toBe(true);
});

it("freezes all eight zone updates on pause, overrides OS motion for zones/water/idle/mascot, and disposes once", async () => {
  await mount(); tick(); tick();
  expect(h.zones.every(zone => vi.mocked(zone.update!).mock.lastCall![0] > 0)).toBe(true);
  send(container, "tqa:pause", { reason: "overlay", paused: true }); tick();
  expect(h.zones.every(zone => vi.mocked(zone.update!).mock.lastCall![0] === 0)).toBe(true);
  send(container, "tqa:set-motion", { reduced: true });
  expect(container.dataset.worldMotion).toBe("reduced"); expect(h.reduced).toHaveBeenLastCalledWith(true); expect(h.idleMotion).toHaveBeenLastCalledWith(true);
  send(container, "tqa:pause", { reason: "overlay", paused: false }); tick();
  expect(h.zones.every(zone => vi.mocked(zone.update!).mock.lastCall![1])).toBe(true);
  const mascot = (h.scene as Scene).getObjectByName("mascot")!;
  const still = mascot.position.clone(); tick(); tick(); expect(mascot.position).toEqual(still);
  send(container, "tqa:set-motion", { reduced: false }); tick();
  expect(container.dataset.worldMotion).toBe("full"); expect(mascot.position.distanceTo(still)).toBeGreaterThan(0);
  media.matches = true; send(media, "change"); expect(container.dataset.worldMotion).toBe("full");
  for (const reduced of [undefined, null, 1, "true"]) send(container, "tqa:set-motion", { reduced });
  expect(container.dataset.worldMotion).toBe("full");
  const zones = h.zones; unmount!(); unmount!(); unmount = undefined;
  for (const zone of zones) { expect(zone.dispose).toHaveBeenCalledOnce(); expect(zone.group.parent).toBeNull(); }
  expect(container.dataset.worldMotion).toBeUndefined();
  send(container, "tqa:set-motion", { reduced: true }); expect(container.dataset.worldMotion).toBeUndefined();
});

it("suppresses zone-enter throughout intro and changes an active intro to the reduced fade", async () => {
  const entered: CustomEvent[] = []; container.addEventListener("tqa:zone-enter", e => entered.push(e as CustomEvent));
  await mount(false); tick(); tick(); expect(entered).toHaveLength(0);
  send(container, "tqa:set-motion", { reduced: true });
  for (let i = 0; i < 5; i++) tick();
  expect(container.dataset.worldIntro).toBe("done");
  expect(entered.map(e => e.detail)).toEqual([{ zoneId: "first-light" }]);
  expect(entered[0]!.bubbles).toBe(false);
});

it("applies the 4 m hysteresis independently at all eight zones", () => {
  // Workshop and Roots overlap (t 0.14 / 0.19), so each zone gets a fresh tracker (Lead, B2-100).
  for (const zone of ZONES) {
    const track = createZoneEntryTracker();
    const p = (distance: number) => ({ x: zone.position.x + distance, z: zone.position.z });
    expect(track(p(0), false)).toEqual([]);
    expect(track(p(zone.radius - 0.01), true)).toContain(zone.id); // 1 cm inside: x + r - x is not exactly r in floating point
    expect(track(p(zone.radius + 3.99), true)).not.toContain(zone.id); // still inside the 4 m hysteresis band
    expect(track(p(0), true)).not.toContain(zone.id);
    track(p(zone.radius + 4.01), true);
    expect(track(p(0), true)).toContain(zone.id);
  }
});

it("grounds all eight real scenes, keeps fixed colliders across qualities and excludes streamed trees/grass", async () => {
  const actual = await vi.importActual<typeof import("../../../src/features/world/scene/compose")>("../../../src/features/world/scene/compose");
  const zones = placeZoneScenes(actual.surfaceHeight);
  const bounds = zoneFoliageBounds(zones);
  const boxes = zones.flatMap(zone => zone.boxes);
  const backend = createMeshPhysics(); const scene = new Scene();
  const composed = actual.createWorldScene({ ...backend, scene, quality: "High", zoneBounds: bounds, zoneBoxes: boxes });
  try {
    for (const zone of zones) {
      expect(zone.group.position.y).toBe(actual.surfaceHeight(zone.layout.position.x, zone.layout.position.z));
      composed.update(zone.group.position, 0);
      expect(boxes.every(box => composed.collisionMeshes.includes(box))).toBe(true);
      for (const mesh of composed.collisionMeshes) if (!boxes.includes(mesh as typeof boxes[number]) && mesh.geometry.type === "CylinderGeometry") {
        expect(bounds.some(box => mesh.position.x >= box.min.x && mesh.position.x <= box.max.x && mesh.position.z >= box.min.z && mesh.position.z <= box.max.z)).toBe(false);
      }
      // Rendered ground instances, after filtering, must be outside every expanded zone box.
      const matrix = new Matrix4();
      scene.traverse(object => {
        const mesh = object as import("three").InstancedMesh;
        if (!mesh.isInstancedMesh || !mesh.name.startsWith("ground-")) return;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix); const p = new Vector3().setFromMatrixPosition(matrix);
          expect(bounds.some(box => p.x >= box.min.x && p.x <= box.max.x && p.z >= box.min.z && p.z <= box.max.z)).toBe(false);
        }
      });
    }
  } finally { composed.dispose(); zones.forEach(zone => zone.dispose()); }
});
