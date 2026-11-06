import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GAMEPLAY_FAR } from "../../../src/features/world/scene/far-landscape";
import { Fog, PerspectiveCamera, Scene, Vector3 } from "three";
import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { createIntro, introAtmosphere } from "../../../src/features/world/cinematic/intro";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { waterLevelAt } from "../../../src/features/world/terrain/height";
const DIRECTED_MIST = WORLD_DIRECTION.background.mist.strength;

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  position: undefined as unknown,
  firstPose: undefined as { position: import("three").Vector3; direction: import("three").Vector3; fov: number; far: number } | undefined,
  resetAtmosphere: false,
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
vi.mock("../../../src/features/world/scene/compose", () => ({
  worldSpawn: () => new Vector3(0, 100, 0),
  nearestSafePath: (position: Vector3) => position.clone(),
  surfaceHeight: () => 100,
  createWorldScene: ({ scene }: { scene: Scene }) => ({
    groundReady: true, buildGround: (function* () {})(),
    sun: { castShadow: false }, collisionMeshes: [], visibleMeshes: [], foliageMeshes: [],
    update() {
      if (harness.resetAtmosphere) {
        const fog = WORLD_DIRECTION.background.forest!.fog;
        scene.fog = new Fog(0, fog.near, fog.far);
        harness.fog(fog);
        harness.mist({ strength: WORLD_DIRECTION.background.forest!.mist.strength });
      }
    }, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload: harness.preload,
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
let win: TrackedTarget & { __tqaSkipIntro?: boolean; __tqaJourney?: boolean };
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
  harness.resetAtmosphere = false;
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
  expect(harness.fog.mock.calls.some(([value]) => value.far > WORLD_DIRECTION.background.forest!.fog.far)).toBe(true);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(skip.textContent).toBe("Bỏ qua");
  send(skip, "click");
  expect(container.dataset.worldIntro).toBe("done");
  expect(skipButton()).toBeUndefined();
  expect(bars.every(bar => !container.children.includes(bar))).toBe(true);
  expect(camera().position.distanceTo(harness.firstPose!.position)).toBeLessThan(1e-3);
  expect(camera().getWorldDirection(new Vector3()).distanceTo(harness.firstPose!.direction)).toBeLessThan(1e-3);
  expect(camera().fov).toBe(harness.firstPose!.fov);
  // Lead review: the overview streams the river bends, then the reach returns to normal at handoff.
  expect(harness.preload.mock.calls.map(([value]) => value)).toEqual([600, 0]);
  expect(harness.corridor.mock.calls.every(([value]) => value === null)).toBe(true);
  expect(harness.corridor).toHaveBeenLastCalledWith(null);
  expect(harness.fog).toHaveBeenLastCalledWith({ near: WORLD_DIRECTION.background.fog.near, far: WORLD_DIRECTION.background.fog.far });
  // Lead batch 25: the gameplay far plane follows quality (adaptive quality may have stepped down meanwhile).
  expect(Object.values(GAMEPLAY_FAR)).toContain(camera().far);
  expect(camera().far).toBeLessThanOrEqual(harness.firstPose!.far);
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

it("applies altitude-aware fog and thin valley mist after grading at 1, 5, 10 and 15 seconds", async () => {
  harness.resetAtmosphere = true;
  await mount();
  advance(); // The first animation frame advances by FIXED_DT (1/60 s).
  advance(1000 * (0.1 - 1 / 60));
  const first = harness.firstPose!;
  const intro = createIntro({ position: first.position, target: first.position.clone().add(first.direction), fov: first.fov });
  let elapsed = 1;
  for (const seconds of [1, 5, 10, 15]) {
    while (elapsed < seconds * 10) { advance(); elapsed++; }
    const frame = intro.sample(seconds);
    expect(camera().position.distanceTo(frame.position)).toBeLessThan(1e-4);
    const atmosphere = introAtmosphere(camera().position, frame.mistBoost);
    expect(harness.fog.mock.calls.at(-1)![0].far).toBeCloseTo(atmosphere.fog.far, 4);
    expect(harness.mist.mock.calls.at(-1)![0].strength).toBeCloseTo(atmosphere.mist.strength, 6);
    expect(harness.mist.mock.calls.at(-1)![0].bands).toEqual(atmosphere.mist.bands);
    const nativeFog = (harness.scene as Scene).fog as Fog;
    expect(nativeFog.near).toBeCloseTo(atmosphere.fog.near, 4);
    expect(nativeFog.far).toBeCloseTo(atmosphere.fog.far, 4);
    const fogOrder = harness.fog.mock.invocationCallOrder.at(-1)!;
    expect(harness.mist.mock.invocationCallOrder.at(-1)).toBeGreaterThan(fogOrder);
    const river = nearestRiver(frame.position.x, frame.position.z);
    const distance = Math.hypot(river.distance, frame.position.y - waterLevelAt(river.z));
    expect(distance).toBeLessThan(atmosphere.fog.far);
    expect(atmosphere.mist.strength).toBeLessThanOrEqual(0.08);
  }
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

type Journey = { position(): { x: number; y: number; z: number }; cameraYaw(): number; zone(): string | null };
const journey = () => (container as Element & { __tqaJourney?: Journey }).__tqaJourney;

it.each([undefined, false])("does not install journey observation with flag %s", async flag => {
  win.__tqaJourney = flag;
  await mount();
  expect(Object.hasOwn(container, "__tqaJourney")).toBe(false);
  win.__tqaJourney = true; // Setting it after mount must not install a hook.
  advance();
  expect(journey()).toBeUndefined();
});

it("exposes live journey snapshots and yaw without allowing controller mutation", async () => {
  win.__tqaJourney = true;
  win.__tqaSkipIntro = true;
  await mount();
  const hook = journey()!;
  expect(Object.keys(hook).sort()).toEqual(["cameraYaw", "goTo", "position", "visitSecret", "zone"]);
  expect(Object.isFrozen(hook)).toBe(true);
  expect(hook.position()).toEqual({ x: position().x, y: position().y, z: position().z });
  const snapshot = hook.position();
  snapshot.x += 100;
  expect(hook.position().x).toBe(position().x);
  const { ZONES } = await import("../../../src/features/world/layout/zones");
  position().copy(ZONES.find(zone => zone.id === "workshop")!.position);
  expect(hook.zone()).toBe("workshop");
  position().set(100_000, 100, 100_000);
  expect(hook.zone()).toBeNull();
  const yaw = hook.cameraYaw();
  send(win, "keydown", { code: "ArrowLeft" });
  advance();
  expect(hook.cameraYaw()).toBeGreaterThan(yaw);
  expect(win.__tqaJourney).toBe(true);
});

it("removes the journey hook on idempotent cleanup and can mount it again", async () => {
  win.__tqaJourney = true;
  await mount();
  const first = journey();
  expect(first).toBeDefined();
  unmount!(); unmount!();
  expect(Object.hasOwn(container, "__tqaJourney")).toBe(false);
  await mount();
  expect(journey()).toBeDefined();
  expect(journey()).not.toBe(first);
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
  const mist = harness.mist.mock.calls.at(-1)![0];
  const renderCount = harness.render.mock.calls.length;
  for (let i = 0; i < 250; i++) advance();
  expect(camera().position.distanceTo(frozen)).toBe(0);
  expect(harness.mist).toHaveBeenLastCalledWith(mist);
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
