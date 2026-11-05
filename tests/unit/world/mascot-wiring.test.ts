import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { HEIGHT } from "../../../src/features/world/scene";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createMascotFollowState, FOLLOW_DISTANCE } from "../../../src/features/mascot/follow";
import { HINT_COOLDOWN, MASCOT_HINTS } from "../../../src/features/mascot/hints";
import { SECRETS } from "../../../src/features/story/secrets";
import { ambienceMixAt } from "../../../src/features/audio/mix";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { waterLevelAt } from "../../../src/features/world/terrain/height";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  player: undefined as unknown,
  realSurface: false,
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
  return { loadCharacter: async () => {
    const character = createFallbackCharacter();
    harness.player = character.root;
    return character;
  } };
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
    setGrade() {},
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
vi.mock("../../../src/features/world/scene/compose", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/features/world/scene/compose")>();
  return {
    worldSpawn: () => new Vector3(0, 100, 0),
    nearestSafePath: (position: Vector3) => position.clone(),
    surfaceHeight: (x: number, z: number) => harness.realSurface ? actual.surfaceHeight(x, z) : 100,
    createWorldScene: () => ({
      sun: { castShadow: false, color: { copy() {} }, position: new Vector3() }, collisionMeshes: [], visibleMeshes: [], foliageMeshes: [],
      update: harness.update, contains: () => true, fadeCrowns() {}, setQuality() {}, setPreload: harness.preload,
      setReducedMotion: harness.reduced, dispose: harness.dispose,
    }),
  };
});
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
const position = () => harness.position as Vector3;
async function mount() {
  const { mountWorld } = await import("../../../src/features/world/index");
  unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast" });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  harness.firstPose = undefined;
  harness.realSurface = false;
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
const mascot = () => scene().getObjectByName("mascot")!;
const hint = () => container.children.find(child => child.dataset.worldMascotHint)!;
function enterZone(id: typeof ZONES[number]["id"]) {
  const zone = ZONES.find(zone => zone.id === id)!;
  position().set(zone.position.x, 100 + HEIGHT, zone.position.z);
  advance();
}
function expectSnapped() {
  expect(Math.hypot(mascot().position.x - position().x, mascot().position.z - position().z)).toBeCloseTo(FOLLOW_DISTANCE);
}

it("follows movement every frame with feet-based height, snaps even a short recovery and respects reduced motion", async () => {
  await mount();
  const initial = mascot().position.clone();
  position().x += 1;
  advance();
  expect(mascot().position.x).toBeGreaterThan(initial.x);
  expect(mascot().position.x).toBeLessThan(initial.x + 1);
  // This recovery moves less than the follower's automatic teleport threshold.
  send(container, "tqa:return-to-path");
  expectSnapped();
  const player = harness.player as import("three").Object3D;
  const forward = player.getWorldDirection(new Vector3());
  const expected = createMascotFollowState({
    playerPosition: { x: position().x, y: position().y - HEIGHT, z: position().z },
    heading: Math.atan2(-forward.x, -forward.z), terrainHeight: () => 100,
  });
  expect(mascot().position.toArray()).toEqual([expected.position.x, expected.position.y, expected.position.z]);
  media.matches = true;
  send(media, "change");
  position().x += 0.5;
  advance();
  expectSnapped();
  const frozen = mascot().position.clone();
  advance();
  expect(mascot().position.distanceTo(frozen)).toBe(0);
  // Euler Y alone folds at 90 degrees; the follower must use the full facing vector.
  player.rotation.set(0, 2.5, 0);
  advance();
  const rotated = createMascotFollowState({
    playerPosition: { x: position().x, y: position().y - HEIGHT, z: position().z },
    heading: 2.5 - Math.PI, terrainHeight: () => 100, reducedMotion: true,
  });
  expect(mascot().position.x).toBeCloseTo(rotated.position.x);
  expect(mascot().position.z).toBeCloseTo(rotated.position.z);
});

it("hides during intro, then snaps at handoff without stealing focus for hints", async () => {
  win.__tqaSkipIntro = false;
  await mount();
  expect(mascot().visible).toBe(false);
  enterZone("first-light");
  expect(hint().textContent).toBe("");
  const skip = container.children.find(child => child.dataset.worldIntroSkip)!;
  send(skip, "click");
  expect(mascot().visible).toBe(true);
  expectSnapped();
  expect(doc.activeElement).toBe(canvas);
  advance();
  expect(hint().textContent).toBe(MASCOT_HINTS["first-light"].en);
  expect(hint().attributes["aria-live"]).toBe("polite");
  expect(doc.activeElement).toBe(canvas);
});

it("snaps under the teleport cover at arrival and immediately on mounting/dismounting", async () => {
  await mount();
  const bike = scene().getObjectByName("vehicle_view")!;
  position().copy(bike.position).add(new Vector3(0, HEIGHT, 0));
  advance();
  send(win, "keydown", { code: "KeyE" });
  expect(container.dataset.worldVehicle).toBe("manual");
  expectSnapped();
  send(win, "keydown", { code: "KeyE" });
  expect(container.dataset.worldVehicle).toBe("parked");
  expectSnapped();
  position().copy(scene().getObjectByName("teleport-first-light")!.position).add(new Vector3(1.5, 0, 0));
  advance();
  send(win, "keydown", { code: "KeyE" });
  send(container, "tqa:teleport-to", { detail: { to: "roots" } });
  const before = position().clone();
  for (let i = 0; i < 15 && position().distanceTo(before) < 1; i++) advance();
  expect(position().distanceTo(before)).toBeGreaterThan(6);
  expectSnapped();
  expect(container.dataset.worldTeleport).toBe("active");
});

it("hides during ending and snaps when it returns control", async () => {
  harness.realSurface = true;
  await mount();
  for (const secret of SECRETS) {
    position().set(secret.position.x, secret.position.y + HEIGHT + 0.02, secret.position.z + 1.6);
    advance();
    send(win, "keydown", { code: "KeyE" });
  }
  expect(container.dataset.worldEnding).toBe("playing");
  expect(mascot().visible).toBe(false);
  expect(hint().textContent).toBe("");
  const skip = container.children.find(child => child.dataset.worldEndingSkip)!;
  send(skip, "click");
  expect(container.dataset.worldEnding).toBe("seen");
  expect(mascot().visible).toBe(true);
  expectSnapped();
});

it("validates the memory-only toggle, suppresses hints immediately and does not replay disabled visits", async () => {
  await mount();
  enterZone("first-light");
  expect(hint().textContent).not.toBe("");
  for (const detail of [null, undefined, {}, { enabled: "false" }, { enabled: 0 }]) {
    send(container, "tqa:set-mascot", { detail });
    expect(container.dataset.worldMascot).toBe("on");
  }
  send(container, "tqa:set-mascot", { detail: { enabled: false } });
  expect(container.dataset.worldMascot).toBe("off");
  expect(mascot().visible).toBe(false);
  expect(hint().textContent).toBe("");
  enterZone("roots");
  for (let i = 0; i < 500; i++) advance();
  expect(hint().textContent).toBe("");
  send(container, "tqa:set-mascot", { detail: { enabled: true } });
  expect(container.dataset.worldMascot).toBe("on");
  expect(mascot().visible).toBe(true);
  expectSnapped();
  advance();
  expect(hint().textContent).toBe("");
});

it("localizes hints, expires after six seconds, observes cooldown and never queues departed zones", async () => {
  await mount();
  enterZone("first-light");
  expect(hint().textContent).toBe(MASCOT_HINTS["first-light"].en);
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(hint().textContent).toBe(MASCOT_HINTS["first-light"].vi);
  vi.advanceTimersByTime(5999);
  expect(hint().textContent).not.toBe("");
  vi.advanceTimersByTime(1);
  expect(hint().textContent).toBe("");
  enterZone("workshop");
  expect(hint().textContent).toBe("");
  enterZone("roots");
  for (let i = 0; i < HINT_COOLDOWN * 10 + 1; i++) advance();
  expect(hint().textContent).toBe(MASCOT_HINTS.roots.vi);
  enterZone("workshop");
  for (let i = 0; i < HINT_COOLDOWN * 10 + 1; i++) advance();
  expect(hint().textContent).toBe("");
});

it("emits the position-derived forest/coast mixes at no more than 4 Hz and stays silent while paused", async () => {
  await mount();
  const events: { now: number; event: CustomEvent }[] = [];
  EventTarget.prototype.addEventListener.call(container, "tqa:ambience", (event: Event) => events.push({ now: clock, event: event as CustomEvent }));
  enterZone("first-light");
  const forest = events[0]!.event.detail;
  expect(forest).toEqual(ambienceMixAt({
    distanceToRiver: nearestRiver(position().x, position().z).distance,
    distanceToSea: Math.hypot(Math.max(0, position().z + 880), Math.max(0, position().y - HEIGHT - waterLevelAt(position().z))),
    zoneBiome: "forest-dawn", timeOfDay: timeOfDayAt(nearestPath(position().x, position().z).t),
  }));
  for (let i = 0; i < 1000; i++) advance(1);
  expect(events).toHaveLength(5);
  expect(events.every(({ event }) => !event.bubbles)).toBe(true);
  const coast = ZONES.find(zone => zone.id === "last-postcard")!.position;
  position().set(coast.x, HEIGHT + waterLevelAt(coast.z) + 0.4, coast.z);
  advance(250);
  const sea = events.at(-1)!.event.detail;
  expect(sea.birds).toBe(0);
  expect(sea.sea).toBeGreaterThan(forest.sea);
  expect(sea.wind).not.toBe(forest.wind);
  for (const reason of ["overlay", "journal", "error"]) {
    send(container, "tqa:pause", { detail: { reason, paused: true } });
    const count = events.length;
    for (let i = 0; i < 10; i++) advance();
    expect(events).toHaveLength(count);
    expect(hint().textContent).toBe("");
    send(container, "tqa:pause", { detail: { reason, paused: false } });
    advance(1);
    expect(events).toHaveLength(count + 1);
  }
  expect(events.slice(1).every(({ now }, i) => now - events[i]!.now >= 250)).toBe(true);
});

it("disposes mascot resources, timers, listeners, DOM and frames; remount enables a fresh mascot", async () => {
  await mount();
  enterZone("first-light");
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  const mesh = mascot() as ReturnType<typeof import("../../../src/features/mascot/shape").createMascotMesh>;
  const dispose = vi.spyOn(mesh, "dispose");
  const oldPosition = mesh.position.clone();
  unmount!(); unmount!();
  expect(dispose).toHaveBeenCalledOnce();
  expect(mesh.parent).toBe(null);
  expect(vi.getTimerCount()).toBe(0);
  expect(container.children).toHaveLength(0);
  expect(container.dataset.worldMascot).toBeUndefined();
  expect(raf.size).toBe(0);
  for (const target of [win, doc, media, canvas, container, ...elements]) {
    expect(target.removes).toBe(target.adds);
    expect([...target.listeners.values()].every(group => group.size === 0)).toBe(true);
  }
  send(container, "tqa:set-mascot", { detail: { enabled: false } });
  advance();
  expect(mesh.position.distanceTo(oldPosition)).toBe(0);
  expect(container.dataset.worldMascot).toBeUndefined();
  await mount();
  expect(container.dataset.worldMascot).toBe("on");
});

