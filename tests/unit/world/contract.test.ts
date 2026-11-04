import { WORLD_COPY } from "../../../src/features/world/copy";
import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
  scene: undefined as unknown,
  next: undefined as ((now: number) => void) | undefined,
  dpr: 0,
}));

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
      setSize() {}
      render(scene: import("three").Scene, camera: import("three").Camera) {
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
it.each([undefined, "vi"] as const)("implements container events in place with locale %s", async locale => {
  const canvas = new Element();
  harness.canvas = canvas;
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    activeElement: null as unknown,
    hasFocus: () => true,
    createElement: () => new Element(),
  });
  const window = Object.assign(new EventTarget(), { devicePixelRatio: 2 });
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
  const unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast", debug: true, locale });
  try {
    const tick = (now: number) => harness.next!(now);
    tick(100);
    const camera = harness.camera as import("three").Camera;
    const scene = harness.scene as import("three").Scene;
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
    tick(31000);
    send(canvas, "webglcontextlost", {});
    expect(errors).toHaveBeenCalledOnce();
    expect(perf.frames()).toHaveLength(stopped);
    const outsideWheel = send(container, "wheel", { deltaX: 100, deltaY: 100 });
    expect(outsideWheel.defaultPrevented).toBe(false);
  } finally {
    unmount();
  }
  expect((container as unknown as HTMLElement).__tqaPerf).toBeUndefined();
  expect(container.dataset.worldPaused).toBeUndefined();
  send(container, "tqa:set-locale", { detail: { locale: "vi" } });
  expect(container.dataset.worldLocale).toBeUndefined();
  const count = states.length;
  send(container, "tqa:set-quality", { detail: { quality: "low" } });
  expect(states).toHaveLength(count);
}, 30_000);
