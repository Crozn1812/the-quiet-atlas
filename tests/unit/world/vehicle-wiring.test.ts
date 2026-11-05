import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from "three";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { HEIGHT } from "../../../src/features/world/scene";
import { WORLD_COPY } from "../../../src/features/world/copy";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  position: undefined as unknown,
  firstPose: undefined as { position: import("three").Vector3; direction: import("three").Vector3; fov: number; far: number } | undefined,
  render: vi.fn(),
  mist: vi.fn(),
  fog: vi.fn(),
  preload: vi.fn(),
  corridor: vi.fn(),
  reduced: vi.fn(),
  dispose: vi.fn(),
  update: vi.fn(),
  step: vi.fn(),
  teleport: vi.fn(), wet: false, blocked: false, realPhysics: false, collisions: [] as import("three").Mesh[],
}));

// B2-045: unit tests never fetch the rigged GLB; the loader's capsule fallback keeps the old player shape.
vi.mock("../../../src/features/world/character/loader", async () => {
  const { createFallbackCharacter } = await import("../../../src/features/world/character/fallback");
  return { loadCharacter: async () => createFallbackCharacter() };
});
vi.mock("three", async importOriginal => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {
    domElement = harness.canvas;
    shadowMap = { enabled: false };
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    forceContextLoss() {}
  } };
});
vi.mock("../../../src/features/world/scene/paper", () => ({
  createGradedPaperPass: () => ({
    setMist: harness.mist,
    setFog: harness.fog,
    setCorridor: harness.corridor,
    setQuality() {},
    setSize() {},
    dispose: harness.dispose,
    render(scene: Scene, camera: PerspectiveCamera) {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      harness.scene = scene;
      harness.camera = camera;
      harness.firstPose ??= { position: camera.position.clone(), direction: camera.getWorldDirection(new Vector3()), fov: camera.fov, far: camera.far };
      harness.render();
    },
  }),
}));
vi.mock("../../../src/features/world/scene/compose", () => ({
  worldSpawn: () => new Vector3(0, 100, 0),
  nearestSafePath: (position: Vector3) => position.clone(),
  surfaceHeight: () => harness.wet ? -10 : 100,
  createWorldScene: () => ({
    sun: { castShadow: false }, collisionMeshes: harness.collisions, visibleMeshes: [], foliageMeshes: [],
    update: harness.update, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload: harness.preload,
    setReducedMotion: harness.reduced, dispose: harness.dispose,
  }),
}));
vi.mock("../../../src/features/world/raycast", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/features/world/raycast")>();
  return { createController: async (obstacles: Mesh[]) => {
    if (harness.realPhysics) {
      const controller = await actual.createController(obstacles);
      harness.position = controller.position;
      return controller;
    }
    const position = new Vector3();
    harness.position = position;
    return {
      position, grounded: true,
      teleport: (next: Vector3) => { harness.teleport(next); position.copy(next); },
      resetVelocity() {},
      step(x: number, z: number, dt: number) { harness.step(x, z, dt); if (!harness.blocked) { position.x += x * dt; position.z += z * dt; } },
      dispose: harness.dispose,
    };
  } };
});

class TrackedTarget extends EventTarget {
  adds = 0;
  removes = 0;
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
    const [type, listener] = args;
    if (listener) {
      this.adds++;
      const group = this.listeners.get(type) ?? new Set();
      group.add(listener);
      this.listeners.set(type, group);
    }
    super.addEventListener(...args);
  }
  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) {
    const [type, listener] = args;
    if (listener) {
      this.removes++;
      this.listeners.get(type)?.delete(listener);
    }
    super.removeEventListener(...args);
  }
}
class Element extends TrackedTarget {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: Element[] = [];
  parent?: Element;
  textContent = "";
  clientWidth = 1000;
  clientHeight = 800;
  captures = new Set<number>();
  constructor(readonly tagName: string) { super(); }
  appendChild(child: Element) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  focus() { doc.activeElement = this; }
  closest() { return null; }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
  setPointerCapture(id: number) { this.captures.add(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
}
function send(target: EventTarget, type: string, properties: object = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(event, name, { value });
  target.dispatchEvent(event);
  return event;
}
let doc: TrackedTarget & { activeElement: Element | null; hidden: boolean; body: Element; hasFocus: () => boolean; createElement: (tag: string) => Element };
let win: TrackedTarget & { __tqaSkipIntro?: boolean };
let media: TrackedTarget & { matches: boolean };
let container: Element;
let canvas: Element;
let elements: Element[];
let raf: Map<number, (now: number) => void>;
let clock = 100;
let unmount: (() => void) | undefined;
function advance(ms = 100) {
  clock += ms;
  const callbacks = [...raf.values()];
  raf.clear();
  for (const callback of callbacks) callback(clock);
}
const camera = () => harness.camera as PerspectiveCamera;
const position = () => harness.position as Vector3;
async function mount() {
  const { mountWorld } = await import("../../../src/features/world/index");
  unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast" });
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.firstPose = undefined; harness.wet = false; harness.blocked = false; harness.realPhysics = false; harness.collisions = [];
  clock = 100;
  elements = [];
  canvas = new Element("canvas");
  harness.canvas = canvas;
  container = new Element("section");
  media = Object.assign(new TrackedTarget(), { matches: false });
  doc = Object.assign(new TrackedTarget(), {
    activeElement: null as Element | null, hidden: false, body: new Element("body"), hasFocus: () => true,
    createElement: (tag: string) => { const element = new Element(tag); elements.push(element); return element; },
  });
  win = Object.assign(new TrackedTarget(), { __tqaSkipIntro: true, devicePixelRatio: 1, matchMedia: vi.fn(() => media) });
  raf = new Map();
  let nextId = 0;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => { raf.set(++nextId, callback); return nextId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  for (const mesh of harness.collisions) {
    mesh.geometry.dispose();
    (mesh.material as MeshBasicMaterial).dispose();
  }
  vi.unstubAllGlobals();
});

const bike = () => (harness.scene as Scene).getObjectByName("vehicle_view")!;
const player = () => (harness.scene as Scene).children.find(object => (object as Mesh).geometry?.type === "CapsuleGeometry")!;
const key = (code: string, repeat = false) => send(win, "keydown", { code, repeat });
const release = (code: string) => send(win, "keyup", { code });
function approachBike() {
  position().copy(bike().position).add(new Vector3(0, HEIGHT, 0));
  advance();
}
async function ride() {
  await mount();
  approachBike();
  key("KeyE");
  expect(container.dataset.worldVehicle).toBe("manual");
}
function drive(seconds: number) {
  for (let i = 0; i < seconds * 10; i++) advance();
}
function colliderAhead(metres: number) {
  const start = nearestPath(bike().position.x, bike().position.z);
  const centre = pathPointAt(start.t);
  const point = pathPointAt(start.t + metres / pathLength()).add(bike().position.clone().sub(centre).setY(0));
  const mesh = new Mesh(new CylinderGeometry(0.28, 0.28, 5, 6), new MeshBasicMaterial());
  mesh.position.set(point.x, 102.5, point.z);
  mesh.updateMatrixWorld(true);
  harness.collisions.push(mesh);
  return mesh;
}

it("parks 2 m off First Light clear of signs, localizes Ride, gates range and mounts once", async () => {
  await mount();
  expect(container.dataset.worldVehicle).toBe("parked");
  expect(nearestPath(bike().position.x, bike().position.z).distance).toBeCloseTo(2, 2);
  const signs = (harness.scene as Scene).children.filter(object => object.name.startsWith("teleport-") || object.name === WORLD_COPY.en.signpost);
  for (const sign of signs) expect(new Box3().setFromObject(sign).intersectsBox(new Box3().setFromObject(bike()))).toBe(false);
  key("KeyE");
  expect(container.dataset.worldVehicle).toBe("parked");
  approachBike();
  expect(container.children.some(child => child.textContent === "E — Ride")).toBe(true);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(container.children.some(child => child.textContent === "E — Lên xe")).toBe(true);
  key("KeyE", true);
  expect(container.dataset.worldVehicle).toBe("parked");
  key("KeyE");
  expect(player().visible).toBe(false);
  key("KeyE", true);
  expect(container.dataset.worldVehicle).toBe("manual");
});

it("moves manually on the corridor, expands the camera and limits steering", async () => {
  await ride();
  const start = bike().position.clone();
  const zoom = camera().position.distanceTo(position());
  key("KeyW"); key("KeyD");
  drive(6);
  expect(bike().position.distanceTo(start)).toBeGreaterThan(10);
  expect(nearestPath(bike().position.x, bike().position.z).distance).toBeLessThanOrEqual(2.01);
  expect(position().x).toBeCloseTo(bike().position.x, 3);
  expect(position().z).toBeCloseTo(bike().position.z, 3);
  expect(camera().position.distanceTo(position())).toBeCloseTo(zoom * 1.3, 1);
  release("KeyD"); release("KeyW");
  drive(6);
  key("KeyE");
  expect(container.dataset.worldVehicle).toBe("parked");
  expect(player().visible).toBe(true);
  expect(position().distanceTo(bike().position)).toBeGreaterThan(1);
});

it.each([false, true])("stops before the same trunk collider in cruise=%s", async cruise => {
  await ride();
  const mesh = colliderAhead(7);
  if (cruise) key("KeyC"); else key("KeyW");
  drive(8);
  const stopped = bike().position.clone();
  expect(stopped.distanceTo(mesh.position)).toBeGreaterThan(1);
  expect(nearestPath(stopped.x, stopped.z).t).toBeLessThan(nearestPath(mesh.position.x, mesh.position.z).t);
  drive(2);
  expect(bike().position.distanceTo(stopped)).toBeLessThan(0.01);
  expect(container.dataset.worldVehicle).toBe(cruise ? "cruise" : "manual");
});

it("rejects a blocked controller proposal without moving the view or leaving the corridor", async () => {
  await ride();
  const start = bike().position.clone();
  harness.blocked = true;
  key("KeyW"); drive(3);
  expect(bike().position.distanceTo(start)).toBeLessThan(0.02);
  expect(position().x).toBeCloseTo(start.x, 1);
  expect(harness.step).toHaveBeenCalled();
});

it("drives through the real raycast controller and stops before a streamed trunk mesh", async () => {
  harness.realPhysics = true;
  const floor = new Mesh(new BoxGeometry(200, 0.5, 200), new MeshBasicMaterial());
  floor.position.y = 99.75;
  floor.updateMatrixWorld(true);
  harness.collisions.push(floor);
  await ride();
  const start = bike().position.clone();
  const trunk = colliderAhead(7);
  key("KeyW"); drive(8);
  expect(bike().position.distanceTo(start)).toBeGreaterThan(2);
  expect(nearestPath(bike().position.x, bike().position.z).t).toBeLessThan(nearestPath(trunk.position.x, trunk.position.z).t);
  expect(Math.abs(position().y - (100 + HEIGHT))).toBeLessThan(0.1);
  const stopped = bike().position.clone();
  drive(2);
  expect(bike().position.distanceTo(stopped)).toBeLessThan(0.01);
});

it.each(["Escape", "KeyC", "overlay", "journal", "blur", "KeyS", "focusin"])("cancels cruise immediately for %s", async reason => {
  await ride();
  const start = bike().position.clone();
  key("KeyC");
  expect(container.dataset.worldVehicle).toBe("cruise");
  drive(2);
  expect(bike().position.distanceTo(start)).toBeGreaterThan(1);
  if (reason === "overlay" || reason === "journal") send(container, "tqa:pause", { detail: { reason, paused: true } });
  else if (reason === "blur") send(win, "blur");
  else if (reason === "focusin") send(doc, "focusin", { target: { closest: () => ({}) } });
  else key(reason);
  expect(container.dataset.worldVehicle).toBe("manual");
  if (["overlay", "journal", "blur", "focusin"].includes(reason)) {
    const stopped = bike().position.clone();
    if (reason === "blur") send(win, "focus");
    if (reason === "overlay" || reason === "journal") send(container, "tqa:pause", { detail: { reason, paused: false } });
    drive(1);
    expect(bike().position.distanceTo(stopped)).toBe(0);
  }
});

it("keeps the rider aboard on wet, blocked or moving ground and localizes the failure hint", async () => {
  await ride();
  harness.wet = true;
  key("KeyE");
  expect(container.dataset.worldVehicle).toBe("manual");
  expect(container.children.some(child => child.textContent === WORLD_COPY.en.vehicleUnsafe)).toBe(true);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(container.children.some(child => child.textContent === WORLD_COPY.vi.vehicleUnsafe)).toBe(true);
  harness.wet = false;
  advance();
  const blocker = new Mesh(new BoxGeometry(6, 3, 6), new MeshBasicMaterial());
  blocker.position.copy(bike().position).add(new Vector3(0, 1, 0));
  blocker.updateMatrixWorld(true);
  harness.collisions.push(blocker);
  key("KeyE");
  expect(container.dataset.worldVehicle).toBe("manual");
  harness.collisions.pop(); blocker.geometry.dispose(); blocker.material.dispose();
  key("KeyW"); drive(1); release("KeyW"); key("KeyE");
  expect(container.dataset.worldVehicle).toBe("manual");
  drive(3); key("KeyE");
  expect(container.dataset.worldVehicle).toBe("parked");
});

it("locks mounting during intro and teleport, then resets a ridden bike when travel starts", async () => {
  win.__tqaSkipIntro = false;
  await mount();
  approachBike(); key("KeyE");
  expect(container.dataset.worldVehicle).toBe("parked");
  key("Escape");
  approachBike(); key("KeyE");
  const parked = bike().position.clone();
  key("KeyW"); drive(0.5); release("KeyW");
  // Click a nearby travel sign while riding; the normal interaction callback owns the chooser.
  const post = (harness.scene as Scene).getObjectByName("teleport-first-light")!;
  position().copy(post.position).add(new Vector3(0.6, HEIGHT, 0));
  advance();
  const screen = post.position.clone().add(new Vector3(0, 0.2, 0)).project(camera());
  send(canvas, "click", { button: 0, clientX: (screen.x + 1) * 500, clientY: (1 - screen.y) * 400 });
  expect(container.dataset.worldTeleport).toBe("active");
  expect(container.dataset.worldVehicle).toBe("parked");
  expect(bike().position.distanceTo(parked)).toBe(0);
  expect(player().visible).toBe(true);
  approachBike(); key("KeyE");
  expect(container.dataset.worldVehicle).toBe("parked");
  send(container, "tqa:teleport-to", { detail: { to: "roots" } });
  drive(2);
  expect(container.dataset.worldTeleport).toBe("idle");
});

it("removes all listeners, DOM, dataset, animation frames and bike resources on unmount", async () => {
  await ride();
  key("KeyC");
  const group = bike();
  const dispose = vi.fn();
  group.traverse(object => { if ((object as Mesh).geometry) (object as Mesh).geometry.addEventListener("dispose", dispose); });
  unmount!(); unmount!();
  expect(dispose).toHaveBeenCalled();
  expect(group.parent).toBeNull();
  expect(group.children).toHaveLength(0);
  expect(container.dataset.worldVehicle).toBeUndefined();
  expect(container.children).toHaveLength(0);
  expect(raf.size).toBe(0);
  for (const target of [win, doc, media, canvas, container, ...elements]) {
    expect(target.removes).toBe(target.adds);
    expect([...target.listeners.values()].every(group => group.size === 0)).toBe(true);
  }
  key("KeyC"); key("KeyE"); advance();
  expect(container.dataset.worldVehicle).toBeUndefined();
});

