import { WORLD_COPY } from "../../../src/features/world/copy";
import { arrivalPoint } from "../../../src/features/navigation/signposts";
import { surfaceHeight } from "../../../src/features/world/scene/compose";
import { HEIGHT } from "../../../src/features/world/scene";
import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  next: undefined as ((now: number) => void) | undefined,
  dpr: 0,
}));

// B2-045: unit tests never fetch the rigged GLB; the loader's capsule fallback keeps the old player shape.
vi.mock("../../../src/features/world/character/loader", async () => {
  const { createFallbackCharacter } = await import("../../../src/features/world/character/fallback");
  return { loadCharacter: async () => createFallbackCharacter() };
});
vi.mock("three", async importOriginal => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = harness.canvas;
      shadowMap = { enabled: false };
      info = { render: { calls: 3, triangles: 42 }, memory: { geometries: 4, textures: 0 }, programs: [] };
      setPixelRatio(value: number) {
        harness.dpr = value;
      }
      autoClear = true;
      target: unknown = null;
      setSize() {}
      getSize(out: import("three").Vector2) {
        return out.set(1000, 800);
      }
      getPixelRatio() {
        return harness.dpr || 1;
      }
      getRenderTarget() {
        return this.target;
      }
      setRenderTarget(target: unknown) {
        this.target = target;
      }
      clear() {}
      render(scene: import("three").Scene, camera: import("three").Camera) {
        // The paper post pass draws a full-screen triangle with an orthographic camera; record only the world render.
        if ((camera as { isOrthographicCamera?: boolean }).isOrthographicCamera) return;
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        harness.camera = camera;
        harness.scene = scene;
      }
      dispose() {}
      forceContextLoss() {}
    },
  };
});

class Element extends EventTarget {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  clientWidth = 1000;
  clientHeight = 800;
  textContent = "";
  captures = new Set<number>();
  children: Element[] = [];
  attributes: Record<string, string> = {};
  appendChild(child: Element) {
    this.children.push(child);
  }
  remove() {}
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
}

function send(target: EventTarget, type: string, properties: object) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// L4-010: per-test timeout (30 s). This test (formerly "implements container pause/quality events…") timed out at
// the 5 s default on the GitHub runner (run #1). Harness limit only, not a performance gate.
it.each([
  { locale: undefined, collision: "raycast" },
  { locale: "vi", collision: "raycast" },
  { locale: undefined, collision: "rapier" },
  { locale: "vi", collision: "rapier" },
] as const)("implements container events in place with $locale / $collision", async ({ locale, collision }) => {
  const canvas = new Element();
  harness.canvas = canvas;
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as unknown,
    hasFocus: () => true,
    createElement: () => new Element(),
  });
  // This contract covers gameplay events; cinematic timing/focus is covered by intro-wiring.test.ts.
  const window = Object.assign(new EventTarget(), { devicePixelRatio: 2, performance, __tqaSkipIntro: true });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    harness.next = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const container = new Element();
  const states: unknown[] = [];
  container.addEventListener("tqa:world-state", event => states.push((event as CustomEvent).detail));
  const { mountWorld } = await import("../../../src/features/world/index");
  const unmount = await mountWorld(container as unknown as HTMLElement, { collision, debug: true, locale });
  try {
    expect(container.dataset.worldVehicle).toBe("parked");
    expect(container.dataset.worldEnding).toBe("idle");
    const tick = (now: number) => harness.next!(now);
    tick(100);
    const camera = harness.camera as import("three").Camera;
    const scene = harness.scene as import("three").Scene;
    const mascot = scene.getObjectByName("mascot")!;
    expect(container.dataset.worldMascot).toBe("on");
    expect(mascot.visible).toBe(true);
    send(container, "tqa:set-mascot", { detail: { enabled: false } });
    expect(container.dataset.worldMascot).toBe("off");
    expect(mascot.visible).toBe(false);
    send(container, "tqa:set-mascot", { detail: { enabled: true } });
    expect(container.dataset.worldMascot).toBe("on");
    expect(mascot.visible).toBe(true);
    const opened = vi.fn();
    container.addEventListener("tqa:open-content", opened);
    const sign = scene.getObjectByName(WORLD_COPY[locale ?? "en"].signpost)!;
    const desk = scene.getObjectByName(WORLD_COPY[locale ?? "en"].desk)!;
    const clickObject = (object: import("three").Object3D) => {
      const point = object.position.clone().project(camera);
      send(canvas, "click", {
        button: 0,
        clientX: (point.x + 1) * 500,
        clientY: (1 - point.y) * 400,
      });
    };
    expect(container.dataset.worldHint).toBe("first-light");
    clickObject(desk);
    expect(opened).not.toHaveBeenCalled();
    clickObject(sign);
    expect(opened).toHaveBeenCalledOnce();
    expect(opened.mock.calls[0]![0].detail).toEqual({ zoneId: "first-light" });
    const position = camera.position.clone();
    const stateCount = states.length;
    expect(container.dataset.worldLocale).toBe(locale ?? "en");
    for (const next of ["vi", "en", "vi"] as const) {
      send(container, "tqa:set-locale", { detail: { locale: next } });
      expect(container.dataset.worldLocale).toBe(next);
      expect(canvas.attributes["aria-label"]).toBe(WORLD_COPY[next].canvas);
      expect(container.children[0]!.textContent).toBe(WORLD_COPY[next].signpost + " · " + WORLD_COPY[next].desk);
      expect(container.children[3]!.textContent).toBe("E — " + WORLD_COPY[next].signpost);
      expect(scene.getObjectByName(WORLD_COPY[next].signpost)).toBe(sign);
      expect(container.children[1]).toBe(canvas);
      expect(camera.position.distanceTo(position)).toBe(0);
      expect(states).toHaveLength(stateCount);
    }
    for (const detail of [undefined, null, {}, { locale: "fr" }, { locale: 1 }]) {
      send(container, "tqa:set-locale", { detail });
      expect(container.dataset.worldLocale).toBe("vi");
    }
    send(container, "tqa:pause", { detail: { reason: "overlay", paused: true } });
    send(container, "tqa:content-closed", { detail: { zoneId: "first-light" } });
    expect(container.dataset.worldHint).toBeUndefined();
    clickObject(sign);
    expect(opened).toHaveBeenCalledOnce();
    expect(container.dataset.worldPaused).toBe("true");
    // Return uses the nearest safe route point while preserving the overlay pause.
    send(container, "tqa:return-to-path", {});
    expect(container.dataset.worldPaused).toBe("true");
    send(container, "tqa:set-locale", { detail: { locale: "en" } });
    expect(container.dataset.worldPaused).toBe("true");
    send(window, "keydown", { code: "ArrowLeft" });
    send(canvas, "wheel", { deltaX: 100, deltaY: 100, deltaMode: 0, ctrlKey: false });
    tick(200);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    send(container, "tqa:set-quality", { detail: { quality: "high" } });
    tick(300);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(container.dataset.worldQuality).toBe("high");
    expect(harness.dpr).toBe(2);
    expect(states.length).toBe(stateCount + 2);
    send(container, "tqa:pause", { detail: { reason: "overlay", paused: false } });
    expect(container.dataset.worldPaused).toBe("false");
    document.activeElement = { closest: () => ({}) };
    send(window, "keydown", { code: "ArrowLeft" });
    const typingWheel = send(canvas, "wheel", { deltaX: 100, deltaY: 0, deltaMode: 0 });
    expect(typingWheel.defaultPrevented).toBe(false);
    tick(400);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    document.activeElement = null;
    send(window, "keyup", { code: "ArrowLeft" });
    const wheel = send(canvas, "wheel", { deltaX: 100, deltaY: 0, deltaMode: 0 });
    expect(wheel.defaultPrevented).toBe(true);
    tick(500);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(1);
    const perf = (container as unknown as HTMLElement).__tqaPerf!;
    expect(perf.frames().length).toBeGreaterThan(0);
    expect(perf.info()).toEqual({ drawCalls: 3, triangles: 42, geometries: 4, textures: 0, programs: 0 });
    for (let now = 600; now < 30000; now += 100) tick(now);
    expect(container.dataset.worldQuality).toBe("high");
    // Exercise the adapter with both real physics backends and streamed destination terrain.
    const player = scene.children.find(object => (object as import("three").Mesh).geometry?.type === "CapsuleGeometry")!;
    const teleportSign = scene.getObjectByName("teleport-first-light")!;
    let now = 30000;
    function approach(target: import("three").Object3D) {
      for (let i = 0; i < 80 && Math.hypot(player.position.x - target.position.x, player.position.z - target.position.z) > 0.8; i++) {
        const dx = target.position.x - player.position.x;
        const dz = target.position.z - player.position.z;
        const offset = camera.position.clone().sub(player.position);
        const yaw = Math.atan2(offset.x, offset.z);
        const directions = [
          { code: "KeyW", x: -Math.sin(yaw), z: -Math.cos(yaw) },
          { code: "KeyS", x: Math.sin(yaw), z: Math.cos(yaw) },
          { code: "KeyA", x: -Math.cos(yaw), z: Math.sin(yaw) },
          { code: "KeyD", x: Math.cos(yaw), z: -Math.sin(yaw) },
        ];
        const direction = directions.sort((a, b) => (b.x - a.x) * dx + (b.z - a.z) * dz)[0]!;
        send(window, "keydown", { code: direction.code });
        tick(now += 100);
        send(window, "keyup", { code: direction.code });
      }
    }
    const bike = scene.getObjectByName("vehicle_view")!;
    approach(bike);
    send(window, "keydown", { code: "KeyE" });
    expect(container.dataset.worldVehicle).toBe("manual");
    expect(player.visible).toBe(false);
    const parked = bike.position.clone();
    send(window, "keydown", { code: "KeyW" });
    for (let i = 0; i < 10; i++) tick(now += 100);
    send(window, "keyup", { code: "KeyW" });
    for (let i = 0; i < 30; i++) tick(now += 100);
    expect(bike.position.distanceTo(parked)).toBeGreaterThan(1);
    send(window, "keydown", { code: "KeyE" });
    expect(container.dataset.worldVehicle).toBe("parked");
    expect(player.visible).toBe(true);
    approach(teleportSign);
    const chosen = vi.fn();
    const journeys: CustomEvent[] = [];
    container.addEventListener("tqa:teleport-choose", chosen);
    for (const name of ["tqa:teleport-start", "tqa:teleport-end"]) {
      container.addEventListener(name, event => journeys.push(event as CustomEvent));
    }
    send(window, "keydown", { code: "KeyE" });
    expect(chosen).toHaveBeenCalledOnce();
    expect(chosen.mock.calls[0]![0].detail).toEqual({ from: "first-light" });
    for (const to of ["roots", "last-postcard"] as const) {
      if (to === "last-postcard") send(window, "keydown", { code: "KeyE" });
      send(container, "tqa:teleport-to", { detail: { to } });
      send(window, "keydown", { code: "KeyW" });
      for (let i = 0; i < 14; i++) tick(now += 100);
      const arrival = arrivalPoint(to).position;
      expect(Math.hypot(player.position.x - arrival.x, player.position.z - arrival.z)).toBeLessThan(0.1);
      expect(Math.abs(player.position.y - (surfaceHeight(arrival.x, arrival.z) + HEIGHT + 0.02))).toBeLessThan(0.1);
      expect(container.dataset.worldTeleport).toBe("idle");
    }
    expect(journeys.map(event => event.type)).toEqual([
      "tqa:teleport-start", "tqa:teleport-end", "tqa:teleport-start", "tqa:teleport-end",
    ]);
    expect(journeys[2]!.detail).toEqual({ from: "roots", to: "last-postcard" });
    expect(journeys.every(event => !event.bubbles)).toBe(true);
    const errors = vi.fn();
    container.addEventListener("tqa:world-error", errors);
    send(canvas, "webglcontextlost", {});
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0]![0].detail).toEqual({ kind: "context-lost" });
    expect(errors.mock.calls[0]![0].bubbles).toBe(false);
    expect(container.dataset.worldPaused).toBe("true");
    const stopped = perf.frames().length;
    send(document, "visibilitychange", {});
    send(container, "tqa:pause", { detail: { reason: "error", paused: false } });
    tick(now + 100);
    send(canvas, "webglcontextlost", {});
    expect(errors).toHaveBeenCalledOnce();
    expect(perf.frames()).toHaveLength(stopped);
    const outsideWheel = send(container, "wheel", { deltaX: 100, deltaY: 100 });
    expect(outsideWheel.defaultPrevented).toBe(false);
  } finally {
    unmount();
    unmount();
  }
  expect((container as unknown as HTMLElement).__tqaPerf).toBeUndefined();
  expect(container.dataset.worldPaused).toBeUndefined();
  expect(container.dataset.worldVehicle).toBeUndefined();
  expect(container.dataset.worldEnding).toBeUndefined();
  expect(container.dataset.worldMascot).toBeUndefined();
  send(container, "tqa:set-mascot", { detail: { enabled: false } });
  expect(container.dataset.worldMascot).toBeUndefined();
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(container.dataset.worldLocale).toBeUndefined();
  const count = states.length;
  send(container, "tqa:set-quality", { detail: { quality: "low" } });
  expect(states).toHaveLength(count);
}, 30_000);
