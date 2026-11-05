import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Box3, PerspectiveCamera, Scene, Vector3 } from "three";
import { SIGNPOSTS, arrivalPoint } from "../../../src/features/navigation/signposts";
import { MIST_SECONDS, REDUCED_MOTION_SECONDS } from "../../../src/features/navigation/teleport";
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
  teleport: vi.fn(),
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
  surfaceHeight: () => 100,
  createWorldScene: () => ({
    sun: { castShadow: false }, collisionMeshes: [], visibleMeshes: [], foliageMeshes: [],
    update: harness.update, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload: harness.preload,
    setReducedMotion: harness.reduced, dispose: harness.dispose,
  }),
}));
vi.mock("../../../src/features/world/raycast", () => ({
  createController: async () => {
    const position = new Vector3();
    harness.position = position;
    return {
      position, grounded: true,
      teleport: (next: Vector3) => { harness.teleport(next); position.copy(next); },
      resetVelocity() {},
      step(x: number, z: number, dt: number) { harness.step(x, z, dt); position.x += x * dt; position.z += z * dt; },
      dispose: harness.dispose,
    };
  },
}));

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
  Object.assign(event, properties);
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
  harness.firstPose = undefined;
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
  vi.unstubAllGlobals();
});

const cover = () => container.children.find(child => child.dataset.worldTeleportCover);
const postMesh = (id = "first-light") => (harness.scene as Scene).getObjectByName(`teleport-${id}`)!;
function approach(id = "first-light") {
  position().copy(postMesh(id).position).add(new Vector3(1.5, 0, 0));
  advance();
}
function choose() { send(win, "keydown", { code: "KeyE" }); }
function travel(to = "roots") { send(container, "tqa:teleport-to", { detail: { to } }); }
function listen(type: string) {
  const listener = vi.fn();
  // Count only listeners owned by world in the cleanup assertions.
  EventTarget.prototype.addEventListener.call(container, type, listener);
  return listener;
}

it("places eight teleport targets at SIGNPOSTS and preserves the content sign", async () => {
  await mount();
  const scene = harness.scene as Scene;
  expect(scene.children.filter(mesh => mesh.name.startsWith("teleport-"))).toHaveLength(8);
  for (const post of SIGNPOSTS) {
    const mesh = postMesh(post.zoneId);
    expect(mesh.position.x).toBe(post.position.x);
    expect(mesh.position.z).toBe(post.position.z);
    // B2-046: painted signpost rests its geometry's lowest point on the surface (100).
    const box = new Box3().setFromObject(mesh);
    expect(box.min.y).toBeCloseTo(100, 4);
  }
  const content = scene.getObjectByName(WORLD_COPY.en.signpost)!;
  expect(content.position.distanceTo(postMesh().position)).toBeGreaterThanOrEqual(2);
  position().copy(content.position);
  const opened = listen("tqa:open-content");
  choose();
  expect(opened.mock.calls[0]![0].detail).toEqual({ zoneId: "first-light" });
  expect(container.dataset.worldTeleport).toBe("idle");
});

it("E chooses each sign's origin without pausing or opening content and localizes hints", async () => {
  await mount();
  const chosen = listen("tqa:teleport-choose");
  const opened = listen("tqa:open-content");
  for (const post of SIGNPOSTS) {
    approach(post.zoneId);
    expect(container.dataset.worldHint).toBe(post.zoneId);
    expect(container.children.some(child => child.textContent === "E — Travel…")).toBe(true);
    send(container, "tqa:set-locale", { detail: { locale: "vi" } });
    expect(container.children.some(child => child.textContent === "E — Đi tới…")).toBe(true);
    send(container, "tqa:set-locale", { detail: { locale: "en" } });
    choose();
    const event = chosen.mock.calls.at(-1)![0];
    expect(event.detail).toEqual({ from: post.zoneId });
    expect(event.bubbles).toBe(false);
    expect(container.dataset.worldPaused).toBe("false");
    expect(container.dataset.worldTeleport).toBe("active");
    expect(container.dataset.worldHint).toBeUndefined();
    send(container, "tqa:teleport-cancel");
    expect(container.dataset.worldTeleport).toBe("idle");
  }
  expect(chosen).toHaveBeenCalledTimes(8);
  expect(opened).not.toHaveBeenCalled();
});

it("click chooses the nearby teleport sign through world raycasting", async () => {
  await mount();
  approach();
  const chosen = listen("tqa:teleport-choose");
  const point = postMesh().position.clone().project(camera());
  send(canvas, "click", { button: 0, clientX: (point.x + 1) * 500, clientY: (1 - point.y) * 400 });
  expect(chosen).toHaveBeenCalledOnce();
  expect(chosen.mock.calls[0]![0].detail).toEqual({ from: "first-light" });
});

it.each([
  { reduced: false, duration: MIST_SECONDS, effect: "mist" },
  { reduced: true, duration: REDUCED_MOTION_SECONDS, effect: "fade" },
])("moves under opaque paper, snaps arrival/yaw, locks input and emits start/end ($effect)", async ({ reduced, duration, effect }) => {
  await mount();
  approach();
  media.matches = reduced;
  const events: CustomEvent[] = [];
  for (const name of ["tqa:teleport-start", "tqa:teleport-end"]) {
    EventTarget.prototype.addEventListener.call(container, name, (event: Event) => events.push(event as CustomEvent));
  }
  choose();
  const origin = position().clone();
  harness.step.mockClear();
  travel();
  expect(events.map(event => event.type)).toEqual(["tqa:teleport-start"]);
  expect(events[0]!.detail).toEqual({ from: "first-light", to: "roots" });
  expect(cover()!.attributes["aria-hidden"]).toBe("true");
  expect(cover()!.dataset.worldTeleportCover).toBe(effect);
  expect(cover()!.style.opacity).toBe("0");
  send(win, "keydown", { code: "KeyW" });
  send(win, "keydown", { code: "ArrowLeft" });
  expect(send(canvas, "wheel", { deltaY: 100, deltaX: 100 }).defaultPrevented).toBe(false);
  travel("horizon"); // Ignore overlapping requests.
  advance();
  expect(Number(cover()!.style.opacity)).toBeGreaterThan(0);
  expect(Number(cover()!.style.opacity)).toBeLessThan(1);
  expect(position().distanceTo(origin)).toBe(0);
  const arrival = arrivalPoint("roots");
  const expected = new Vector3(arrival.position.x, 100 + HEIGHT + 0.02, arrival.position.z);
  let remaining = duration - 1 / 60;
  while (remaining > 1e-10) {
    const step = Math.min(0.05, remaining);
    advance(step * 1000);
    remaining -= step;
  }
  if (position().distanceTo(origin) === 0) advance(0.001);
  expect(position().distanceTo(expected)).toBeLessThan(0.1);
  expect(Number(cover()!.style.opacity)).toBeGreaterThan(0.999);
  expect(harness.update.mock.calls.some(([point, dt]) => point.distanceTo(expected) < 0.1 && dt === 0)).toBe(true);
  const cameraOffset = camera().position.clone().sub(position());
  expect(Math.atan2(cameraOffset.x, cameraOffset.z)).toBeCloseTo(arrival.yaw);
  expect(harness.step).not.toHaveBeenCalled();
  expect(container.dataset.worldTeleport).toBe("active");
  advance(50);
  expect(Number(cover()!.style.opacity)).toBeLessThan(1);
  for (let i = 0; i < Math.ceil(duration / 0.05); i++) advance(50);
  expect(events.map(event => event.type)).toEqual(["tqa:teleport-start", "tqa:teleport-end"]);
  expect(events[1]!.detail).toEqual({ to: "roots" });
  expect(events.every(event => !event.bubbles)).toBe(true);
  expect(container.dataset.worldTeleport).toBe("idle");
  expect(cover()).toBeUndefined();
  advance(); advance();
  expect(position().distanceTo(expected)).toBeLessThan(0.1);
  send(win, "keydown", { code: "KeyW" });
  advance();
  expect(position().distanceTo(expected)).toBeGreaterThan(0.1);
});

it("continues under the UI overlay pause and preserves that pause at completion", async () => {
  await mount();
  approach(); choose();
  send(container, "tqa:pause", { detail: { reason: "overlay", paused: true } });
  travel();
  for (let i = 0; i < 15; i++) advance();
  expect(container.dataset.worldTeleport).toBe("idle");
  expect(container.dataset.worldPaused).toBe("true");
  expect(position().x).toBeCloseTo(arrivalPoint("roots").position.x);
});

it.each(["choosing", "fadingOut", "fadingIn"])("cancels %s to idle and allows a new journey", async phase => {
  await mount();
  approach(); choose();
  const ended = listen("tqa:teleport-end");
  if (phase !== "choosing") travel();
  if (phase === "fadingIn") for (let i = 0; i < 8; i++) advance();
  const stopped = position().clone();
  send(container, "tqa:teleport-cancel");
  expect(container.dataset.worldTeleport).toBe("idle");
  expect(cover()).toBeUndefined();
  for (let i = 0; i < 15; i++) advance();
  expect(position().distanceTo(stopped)).toBe(0);
  expect(ended).not.toHaveBeenCalled();
  approach(); choose(); travel();
  expect(cover()).toBeDefined();
});

it("ignores unsolicited, invalid and same-zone destinations and repeated chooser activation", async () => {
  await mount();
  travel();
  expect(container.dataset.worldTeleport).toBe("idle");
  approach();
  const chosen = listen("tqa:teleport-choose");
  choose(); choose();
  expect(chosen).toHaveBeenCalledOnce();
  for (const detail of [undefined, null, {}, { to: "reflection" }, { to: 1 }, { to: "first-light" }]) {
    send(container, "tqa:teleport-to", { detail });
    expect(cover()).toBeUndefined();
  }
  travel();
  expect(cover()).toBeDefined();
});

it("ignores travel and E while the intro is playing", async () => {
  win.__tqaSkipIntro = false;
  await mount();
  const started = listen("tqa:teleport-start");
  const chosen = listen("tqa:teleport-choose");
  approach(); choose(); travel();
  expect(container.dataset.worldIntro).toBe("playing");
  expect(container.dataset.worldTeleport).toBe("idle");
  expect(started).not.toHaveBeenCalled();
  expect(chosen).not.toHaveBeenCalled();
  expect(cover()).toBeUndefined();
});

it("cleans owned listeners, DOM and animation frames on unmount during travel", async () => {
  await mount();
  approach(); choose(); travel(); advance();
  const faded = cover()!;
  const stopped = position().clone();
  unmount!(); unmount!();
  expect(container.children).toHaveLength(0);
  expect(container.dataset.worldTeleport).toBeUndefined();
  expect(raf.size).toBe(0);
  for (const target of [win, doc, media, canvas, container, ...elements]) {
    expect(target.removes).toBe(target.adds);
    expect([...target.listeners.values()].every(group => group.size === 0)).toBe(true);
  }
  send(container, "tqa:teleport-to", { detail: { to: "horizon" } });
  send(container, "tqa:teleport-cancel");
  advance();
  expect(position().distanceTo(stopped)).toBe(0);
  expect(container.dataset.worldTeleport).toBeUndefined();
  expect(container.children).not.toContain(faded);
});

