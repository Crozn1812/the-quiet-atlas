import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { SECRETS } from "../../../src/features/story/secrets";
import { NOT_YET_FEEDBACK, SECRET_FEEDBACK } from "../../../src/features/story/copy";
import { HEIGHT } from "../../../src/features/world/scene";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { ZONES } from "../../../src/features/world/layout/zones";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  position: undefined as unknown,
  firstPose: undefined as { position: import("three").Vector3; direction: import("three").Vector3; fov: number; far: number } | undefined,
  grade: vi.fn(),
  ending: vi.fn(),
  render: vi.fn(),
  mist: vi.fn(),
  fog: vi.fn(),
  preload: vi.fn(),
  corridor: vi.fn(),
  reduced: vi.fn(),
  dispose: vi.fn(),
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
    setGrade: harness.grade,
    setMist: harness.mist,
    setFog: harness.fog,
    setCorridor: harness.corridor,
    setQuality() {},
    setSize() {},
    dispose: harness.dispose,
    render(scene: Scene, camera: PerspectiveCamera) {
      harness.scene = scene;
      harness.camera = camera;
      harness.firstPose ??= { position: camera.position.clone(), direction: camera.getWorldDirection(new Vector3()), fov: camera.fov, far: camera.far };
      harness.render();
    },
  }),
}));
vi.mock("../../../src/features/world/scene/compose", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/features/world/scene/compose")>();
  const { DirectionalLight, HemisphereLight, Fog } = await import("three");
  const { createSkyDome } = await import("../../../src/features/world/sky/dome");
  return { ...actual, createWorldScene: ({ scene }: { scene: Scene }) => {
    const sun = new DirectionalLight();
    scene.add(sun, new HemisphereLight(), createSkyDome().mesh);
    scene.fog = new Fog("white", 10, 100);
    return {
      sun, collisionMeshes: [], visibleMeshes: [], foliageMeshes: [],
      update() {}, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload: harness.preload,
      setReducedMotion: harness.reduced, dispose: harness.dispose,
    };
  } };
});
vi.mock("../../../src/features/world/cinematic/ending-controller", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/features/world/cinematic/ending-controller")>();
  return { ...actual, createEndingController: (...args: Parameters<typeof actual.createEndingController>) => {
    harness.ending();
    return actual.createEndingController(...args);
  } };
});
vi.mock("../../../src/features/world/raycast", () => ({
  createController: async () => {
    const position = new Vector3();
    harness.position = position;
    return {
      position, grounded: true,
      teleport: (next: Vector3) => position.copy(next),
      resetVelocity() {},
      step(x: number, z: number, dt: number) { position.x += x * dt; position.z += z * dt; },
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
const skipButton = () => container.children.find(child => child.dataset.worldEndingSkip === "true");
const camera = () => harness.camera as PerspectiveCamera;
const position = () => harness.position as Vector3;
async function mount() {
  const { mountWorld } = await import("../../../src/features/world/index");
  unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast" });
}
beforeEach(() => {
  vi.useFakeTimers();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const scene = () => harness.scene as Scene;
const feedback = () => container.children.find(child => child.dataset.worldStoryFeedback)!;
function approach(id: typeof SECRETS[number]["id"]) {
  const secret = SECRETS.find(secret => secret.id === id)!;
  position().set(secret.position.x, surfaceHeight(secret.position.x, secret.position.z + 1.6) + HEIGHT + 0.02, secret.position.z + 1.6);
  advance();
}
function key(code: string) { return send(win, "keydown", { code }); }
function discover(id: typeof SECRETS[number]["id"]) { approach(id); key("KeyE"); }
function unlock() {
  discover("reflection");
  discover("forgotten-sound");
  discover("unmarked-road");
  discover("unwritten-page");
}

it("grounds four unsigned landmarks at the story positions and gives them neutral localized hints", async () => {
  await mount();
  for (const secret of SECRETS) {
    const root = scene().getObjectByName(secret.landmark)!;
    expect(root.position.toArray()).toEqual([secret.position.x, surfaceHeight(secret.position.x, secret.position.z), secret.position.z]);
    approach(secret.id);
    expect(container.children.some(child => child.textContent === "E — Pause")).toBe(true);
    send(container, "tqa:set-locale", { detail: { locale: "vi" } });
    expect(container.children.some(child => child.textContent === "E — Dừng")).toBe(true);
    send(container, "tqa:set-locale", { detail: { locale: "en" } });
  }
});

it("keeps the early bench metaphorical; discovers once, translates feedback and hides it after six seconds", async () => {
  await mount();
  const events: CustomEvent[] = [];
  const onFound = (event: Event) => events.push(event as CustomEvent);
  container.addEventListener("tqa:secret-found", onFound);
  discover("unwritten-page");
  expect(feedback().textContent).toBe(NOT_YET_FEEDBACK.en);
  expect(container.dataset.worldEnding).toBe("idle");
  expect(harness.ending).not.toHaveBeenCalled();
  expect(events).toHaveLength(0);
  discover("reflection"); key("KeyE");
  expect(events.map(event => event.detail)).toEqual([{ id: "reflection", count: 1 }]);
  expect(events.every(event => !event.bubbles)).toBe(true);
  expect(feedback().attributes["aria-live"]).toBe("polite");
  expect(feedback().textContent).toBe(SECRET_FEEDBACK.reflection.en);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(feedback().textContent).toBe(SECRET_FEEDBACK.reflection.vi);
  vi.advanceTimersByTime(5999);
  expect(feedback().textContent).not.toBe("");
  vi.advanceTimersByTime(1);
  expect(feedback().textContent).toBe("");
  send(container, "tqa:set-locale", { detail: { locale: "en" } });
  expect(feedback().textContent).toBe("");
  discover("forgotten-sound"); discover("unmarked-road"); discover("unwritten-page");
  expect(events.map(event => event.detail.count)).toEqual([1, 2, 3, 4]);
  expect(container.dataset.worldEnding).toBe("playing");
  container.removeEventListener("tqa:secret-found", onFound);
});

it.each(["click", "Escape", "Enter"])("locks gameplay and travel, then skips with %s to Last Postcard exactly once", async method => {
  const events: CustomEvent[] = [];
  const onEnding = (event: Event) => events.push(event as CustomEvent);
  container.addEventListener("tqa:ending", onEnding);
  await mount();
  unlock();
  expect(harness.ending).toHaveBeenCalledOnce();
  expect(container.dataset.worldEnding).toBe("playing");
  const start = position().clone();
  const skip = skipButton()!;
  expect(doc.activeElement).toBe(skip);
  expect(elements.filter(element => element.dataset.worldLetterbox)).toHaveLength(2);
  for (const code of ["KeyW", "KeyE", "ArrowLeft"]) key(code);
  send(container, "tqa:return-to-path");
  send(container, "tqa:teleport-to", { detail: { to: "roots" } });
  for (let i = 0; i < 20; i++) advance();
  expect(position().distanceTo(start)).toBe(0);
  expect(container.dataset.worldTeleport).toBe("idle");
  expect(camera().position.distanceTo(start)).toBeGreaterThan(0);
  expect(harness.grade).toHaveBeenCalled();
  expect(harness.mist.mock.calls.some(([value]) => value.strength > WORLD_DIRECTION.background.mist.strength)).toBe(true);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(skip.textContent).toBe("Bỏ qua");
  if (method === "click") send(skip, "click"); else key(method);
  expect(container.dataset.worldEnding).toBe("seen");
  const postcard = ZONES.find(zone => zone.id === "last-postcard")!;
  expect(Math.hypot(position().x - postcard.position.x, position().z - postcard.position.z)).toBeLessThan(10);
  expect(position().y).toBeCloseTo(surfaceHeight(position().x, position().z) + HEIGHT + 0.02);
  const finalCamera = camera().position.clone();
  advance();
  expect(camera().position.distanceTo(finalCamera)).toBeLessThan(1e-8);
  expect(skipButton()).toBeUndefined();
  expect(doc.activeElement).toBe(canvas);
  send(skip, "click");
  discover("unwritten-page");
  expect(harness.ending).toHaveBeenCalledOnce();
  expect(events.map(event => event.detail.state)).toEqual(["idle", "playing", "seen"]);
  expect(events.every(event => !event.bubbles)).toBe(true);
  container.removeEventListener("tqa:ending", onEnding);
});

it.each([false, true])("finishes naturally, suspends while paused and supports reduced motion=%s", async reduced => {
  media.matches = reduced;
  await mount();
  unlock();
  send(container, "tqa:pause", { detail: { reason: "overlay", paused: true } });
  const frozen = camera().position.clone();
  for (let i = 0; i < 400; i++) advance();
  expect(container.dataset.worldEnding).toBe("playing");
  expect(camera().position.distanceTo(frozen)).toBe(0);
  send(container, "tqa:pause", { detail: { reason: "overlay", paused: false } });
  for (let i = 0; i < (reduced ? 7 : 361); i++) advance();
  expect(container.dataset.worldEnding).toBe("seen");
  expect(skipButton()).toBeUndefined();
});

it("dismounts a rider before starting the ending", async () => {
  await mount();
  discover("reflection"); discover("forgotten-sound"); discover("unmarked-road");
  const bike = scene().getObjectByName("vehicle_view")!;
  position().copy(bike.position).add(new Vector3(0, HEIGHT, 0));
  advance(); key("KeyE");
  expect(container.dataset.worldVehicle).toBe("manual");
  discover("unwritten-page");
  expect(container.dataset.worldEnding).toBe("playing");
  expect(container.dataset.worldVehicle).toBe("parked");
});

it("animates only the chime pivot and freezes it when reduced motion changes", async () => {
  await mount();
  const chimes = scene().getObjectByName("chimes")!;
  advance();
  expect(chimes.rotation.z).not.toBe(0);
  expect(Math.abs(chimes.rotation.z)).toBeLessThan(0.05);
  media.matches = true;
  send(media, "change"); advance();
  expect(chimes.rotation.z).toBe(0);
  media.matches = false;
  send(media, "change"); advance();
  expect(chimes.rotation.z).not.toBe(0);
});

it("uses swept boxes only for the arch and bench", async () => {
  await mount();
  const offset = camera().position.clone().sub(position());
  const yaw = Math.atan2(offset.x, offset.z);
  const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  for (const secret of SECRETS) {
    const start = new Vector3(secret.position.x, surfaceHeight(secret.position.x, secret.position.z) + HEIGHT, secret.position.z).addScaledVector(forward, -3);
    position().copy(start);
    key("KeyW");
    for (let i = 0; i < 20; i++) advance();
    send(win, "keyup", { code: "KeyW" });
    const travel = position().clone().sub(start).dot(forward);
    if (secret.landmark === "bench" || secret.landmark === "vine-arch-mirror") expect(travel).toBeLessThan(3);
    else expect(travel).toBeGreaterThan(3);
  }
});

it("disposes landmarks, timers, listeners, DOM and animation frames during an ending; remount starts fresh", async () => {
  await mount();
  unlock();
  const roots = SECRETS.map(secret => scene().getObjectByName(secret.landmark)!);
  const dispose = vi.fn();
  for (const root of roots) root.traverse(object => { if ((object as import("three").Mesh).geometry) (object as import("three").Mesh).geometry.addEventListener("dispose", dispose); });
  unmount!(); unmount!();
  expect(dispose).toHaveBeenCalled();
  expect(roots.every(root => root.parent === null)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(container.children).toHaveLength(0);
  expect(raf.size).toBe(0);
  expect(container.dataset.worldEnding).toBeUndefined();
  for (const target of [win, doc, media, canvas, container, ...elements]) {
    expect(target.removes).toBe(target.adds);
    expect([...target.listeners.values()].every(group => group.size === 0)).toBe(true);
  }
  await mount();
  discover("unwritten-page");
  expect(container.dataset.worldEnding).toBe("idle");
  expect(feedback().textContent).toBe(NOT_YET_FEEDBACK.en);
});

