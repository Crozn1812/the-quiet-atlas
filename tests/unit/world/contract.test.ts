import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canvas: undefined as unknown,
  camera: undefined as unknown,
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
      setPixelRatio(value: number) {
        harness.dpr = value;
      }
      setSize() {}
      render(scene: import("three").Scene, camera: import("three").Camera) {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        harness.camera = camera;
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
  appendChild() {}
  remove() {}
  setAttribute() {}
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

it("implements container pause/quality events in place and gates camera input", async () => {
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
  const unmount = await mountWorld(container as unknown as HTMLElement, { collision: "raycast" });
  try {
    const tick = (now: number) => harness.next!(now);
    tick(100);
    const camera = harness.camera as import("three").Camera;
    const position = camera.position.clone();
    const stateCount = states.length;
    send(container, "tqa:pause", { detail: { reason: "overlay", paused: true } });
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
    const outsideWheel = send(container, "wheel", { deltaX: 100, deltaY: 100 });
    expect(outsideWheel.defaultPrevented).toBe(false);
  } finally {
    unmount();
  }
  expect(container.dataset.worldPaused).toBeUndefined();
  const count = states.length;
  send(container, "tqa:set-quality", { detail: { quality: "low" } });
  expect(states).toHaveLength(count);
});
