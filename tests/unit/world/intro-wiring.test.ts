import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
const DIRECTED_MIST = WORLD_DIRECTION.background.mist.strength;

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  position: undefined as unknown,
  firstPose: undefined as { position: import("three").Vector3; direction: import("three").Vector3; fov: number; far: number } | undefined,
  render: vi.fn(),
  mist: vi.fn(),
  reduced: vi.fn(),
  dispose: vi.fn(),
}));

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
vi.mock("../../../src/features/world/scene/compose", () => ({
  worldSpawn: () => new Vector3(0, 100, 0),
  nearestSafePath: (position: Vector3) => position.clone(),
  surfaceHeight: () => 100,
  createWorldScene: () => ({
    sun: { castShadow: false }, collisionMeshes: [], visibleMeshes: [], foliageMeshes: [],
    update() {}, contains: () => true, fadeCrowns() {}, setQuality() {},
    setReducedMotion: harness.reduced, dispose: harness.dispose,
  }),
}));
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
const skipButton = () => container.children.find(child => child.dataset.worldIntroSkip === "true");
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
  win = Object.assign(new TrackedTarget(), { devicePixelRatio: 1, matchMedia: vi.fn(() => media) });
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

it("renders first, starts with localized Skip and paper bars, locks movement/interaction, then hands off exactly", async () => {
  const states: CustomEvent[] = [];
  container.addEventListener("tqa:intro", event => states.push(event as CustomEvent));
  await mount();
  expect(harness.render).toHaveBeenCalledOnce();
  expect(container.dataset.worldIntro).toBe("playing");
  const skip = skipButton()!;
  expect(skip.tagName).toBe("button");
  expect(skip.textContent).toBe("Skip");
  expect(doc.activeElement).toBe(skip);
  const bars = elements.filter(element => element.dataset.worldLetterbox);
  expect(bars).toHaveLength(2);
  expect(bars.map(bar => bar.attributes["aria-hidden"])).toEqual(["true", "true"]);
  expect(bars.map(bar => bar.style.height)).toEqual(["12%", "12%"]);
  const start = position().clone();
  const opened = vi.fn();
  container.addEventListener("tqa:open-content", opened);
  for (const code of ["KeyW", "KeyE", "ArrowLeft"]) send(win, "keydown", { code });
  for (let i = 0; i < 160; i++) advance();
  expect(position().distanceTo(start)).toBe(0);
  expect(opened).not.toHaveBeenCalled();
  expect(harness.mist.mock.calls.some(([value]) => value.strength > DIRECTED_MIST)).toBe(true);
  expect(harness.mist.mock.calls.every(([value]) => value.strength <= 1)).toBe(true);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(skip.textContent).toBe("Bỏ qua");
  send(skip, "click");
  expect(container.dataset.worldIntro).toBe("done");
  expect(skipButton()).toBeUndefined();
  expect(bars.every(bar => !container.children.includes(bar))).toBe(true);
  expect(camera().position.distanceTo(harness.firstPose!.position)).toBeLessThan(1e-3);
  expect(camera().getWorldDirection(new Vector3()).distanceTo(harness.firstPose!.direction)).toBeLessThan(1e-3);
  expect(camera().fov).toBe(harness.firstPose!.fov);
  expect(camera().far).toBe(harness.firstPose!.far);
  expect(harness.mist).toHaveBeenLastCalledWith({ strength: DIRECTED_MIST });
  expect(doc.activeElement).toBe(canvas);
  expect(states.map(event => event.detail)).toEqual([{ state: "playing" }, { state: "done" }]);
  expect(states.every(event => !event.bubbles)).toBe(true);
  // A key held during intro must not carry into gameplay.
  advance(); advance();
  expect(position().distanceTo(start)).toBe(0);
  send(win, "keydown", { code: "KeyW" });
  advance();
  expect(position().distanceTo(start)).toBeGreaterThan(0);
});

it.each(["Escape", "Enter"])("skips with %s while the Skip button has focus", async code => {
  await mount();
  expect(send(win, "keydown", { code }).defaultPrevented).toBe(true);
  expect(container.dataset.worldIntro).toBe("done");
});

it("preserves outside focus at start and ignores Enter away from Skip", async () => {
  const outside = new Element("button");
  doc.activeElement = outside;
  await mount();
  expect(doc.activeElement).toBe(outside);
  send(win, "keydown", { code: "Enter" });
  expect(container.dataset.worldIntro).toBe("playing");
});

it("uses a fixed gameplay pose and finishes reduced motion within 0.5 simulated seconds", async () => {
  media.matches = true;
  await mount();
  for (let i = 0; i < 5; i++) {
    advance();
    expect(camera().position.distanceTo(harness.firstPose!.position)).toBeLessThan(1e-3);
  }
  expect(container.dataset.worldIntro).toBe("done");
  expect(skipButton()).toBeUndefined();
  expect(harness.reduced).toHaveBeenCalledWith(true);
});

it("reads the test flag without changing it and enters done immediately", async () => {
  win.__tqaSkipIntro = true;
  await mount();
  expect(container.dataset.worldIntro).toBe("done");
  expect(skipButton()).toBeUndefined();
  expect(win.__tqaSkipIntro).toBe(true);
  expect(camera().position.distanceTo(harness.firstPose!.position)).toBe(0);
});

it("waits for the initial pause and freezes camera, mist and letterbox during a playing pause", async () => {
  doc.hasFocus = () => false;
  await mount();
  expect(skipButton()).toBeUndefined();
  advance();
  expect(container.dataset.worldIntro).toBeUndefined();
  send(win, "focus");
  advance();
  expect(container.dataset.worldIntro).toBe("playing");
  for (let i = 0; i < 30; i++) advance();
  send(container, "tqa:pause", { detail: { reason: "overlay", paused: true } });
  const frozen = camera().position.clone();
  const heights = elements.filter(element => element.dataset.worldLetterbox).map(bar => bar.style.height);
  const mistCount = harness.mist.mock.calls.length;
  const renderCount = harness.render.mock.calls.length;
  for (let i = 0; i < 250; i++) advance();
  expect(camera().position.distanceTo(frozen)).toBe(0);
  expect(harness.mist).toHaveBeenCalledTimes(mistCount);
  expect(elements.filter(element => element.dataset.worldLetterbox).map(bar => bar.style.height)).toEqual(heights);
  expect(harness.render.mock.calls.length).toBeGreaterThan(renderCount);
  expect(container.dataset.worldIntro).toBe("playing");
  send(container, "tqa:pause", { detail: { reason: "overlay", paused: false } });
  for (let i = 0; i < 10; i++) advance();
  expect(camera().position.distanceTo(frozen)).toBeGreaterThan(0);
  for (let i = 0; i < 220; i++) advance();
  expect(container.dataset.worldIntro).toBe("done");
  expect(camera().position.distanceTo(harness.firstPose!.position)).toBeLessThan(1e-3);
});

it("keeps context loss behavior during intro", async () => {
  await mount();
  const errors = vi.fn();
  container.addEventListener("tqa:world-error", errors);
  send(canvas, "webglcontextlost");
  expect(errors).toHaveBeenCalledOnce();
  expect(errors.mock.calls[0]![0].detail).toEqual({ kind: "context-lost" });
  expect(container.dataset.worldPaused).toBe("true");
  expect(container.dataset.worldIntro).toBe("playing");
  expect(raf.size).toBe(0);
  const renders = harness.render.mock.calls.length;
  send(doc, "visibilitychange");
  advance();
  expect(harness.render).toHaveBeenCalledTimes(renders);
});

it("keeps quality/locale, removes every listener/DOM/rAF on active unmount, and replays on re-entry", async () => {
  await mount();
  const skip = skipButton()!;
  send(container, "tqa:set-quality", { detail: { quality: "low" } });
  expect(container.dataset.worldQuality).toBe("low");
  send(media, "change");
  expect(harness.reduced).toHaveBeenCalledTimes(2);
  send(doc, "visibilitychange");
  send(doc, "visibilitychange");
  expect(container.dataset.worldIntro).toBe("playing");
  expect(raf.size).toBe(1);
  unmount!(); unmount!();
  for (const target of [win, doc, media, canvas, container, ...elements]) {
    expect(target.removes).toBe(target.adds);
    expect([...target.listeners.values()].every(group => group.size === 0)).toBe(true);
  }
  expect(container.children).toHaveLength(0);
  expect(container.dataset.worldIntro).toBeUndefined();
  expect(raf.size).toBe(0);
  send(skip, "click");
  advance();
  expect(container.dataset.worldIntro).toBeUndefined();
  await mount();
  expect(container.dataset.worldIntro).toBe("playing");
  expect(skipButton()).toBeDefined();
});
