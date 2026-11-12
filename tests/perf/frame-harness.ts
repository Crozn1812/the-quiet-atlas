// L3-007 — shared helpers for T08/T09 (tests/perf/*.frame.ts): machine info, quality selection through the world menu,
// in-page rAF frame recorder, fixed key route, GL object counter.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { MENU_TRIGGER } from "../e2e/helpers";

export const OUT_DIR = path.resolve(process.cwd(), "test-results", "frame-budget");
export const MACHINE_LABEL = process.env.PERF_MACHINE_LABEL ?? "desktop dGPU RTX 3060";

export type Quality = "low" | "balanced" | "high";

/** Fixed route (§8 "tuyến cố định"): W held throughout; ← held for `turnMs` at the start of every `periodMs` cycle. */
export const ROUTE = { periodMs: 6_000, turnMs: 1_500 } as const;

export async function machineInfo(browser: Browser, page: Page) {
  let power = "n/a";
  try {
    power = execFileSync("powercfg", ["/getactivescheme"], { encoding: "utf8" }).trim();
  } catch {
    power = "n/a (powercfg unavailable)";
  }
  const display = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      webglRenderer: gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "no WebGL2",
      viewport: `${innerWidth}×${innerHeight}`,
      screen: `${screen.width}×${screen.height}`,
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    };
  });
  const totalMemGB = Number((os.totalmem() / 1024 ** 3).toFixed(1));
  return {
    label: MACHINE_LABEL,
    os: `${os.type()} ${os.release()} (${os.version()}) ${os.arch()}`,
    cpu: `${os.cpus()[0]?.model ?? "n/a"} × ${os.cpus().length} logical`,
    ram: `${totalMemGB} GiB (OS-reported usable memory)`,
    osTotalMemGB: totalMemGB,
    browser: `${browser.browserType().name()} channel ${process.env.PLAYWRIGHT_CHANNEL || "msedge"} ${browser.version()}`,
    headless: false,
    power,
    ...display,
    node: process.version,
  };
}

/** Selects the menu radio through real input, pinning quality before the measurement starts. */
export async function selectQuality(page: Page, world: Locator, quality: Quality) {
  // ADR 0009: the menu trigger lives in the bottom-left HUD.
  await page.locator(MENU_TRIGGER).click();
  const dialog = page.locator(".world-menu dialog");
  await expect(dialog).toHaveAttribute("open", "");
  const choice = dialog.locator(`input[type="radio"][name="world-menu-quality"][value="${quality}"]`);
  // check() on an already checked radio emits no change. Switch away first so the requested
  // choice always sends the manual-quality event that disables adaptive quality (before warm-up).
  if (await choice.isChecked()) {
    const alternate = quality === "low" ? "balanced" : "low";
    await dialog.locator(`input[type="radio"][name="world-menu-quality"][value="${alternate}"]`).check();
    await expect(world).toHaveAttribute("data-world-quality", alternate);
  }
  await world.evaluate(element => {
    const w = window as unknown as { __tqaSetQuality: unknown[] };
    w.__tqaSetQuality = [];
    element.addEventListener("tqa:set-quality", event => void w.__tqaSetQuality.push((event as CustomEvent).detail?.quality), { once: true });
  });
  await choice.check();
  await expect(choice).toBeChecked();
  await expect(world).toHaveAttribute("data-world-quality", quality);
  // A manual tqa:set-quality must reach the world (also when the value was already selected) so adaptive quality is off.
  expect(await page.evaluate(() => (window as unknown as { __tqaSetQuality: unknown[] }).__tqaSetQuality)).toEqual([quality]);
  await dialog.getByRole("button", { name: /^× / }).click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await world.focus();
  await expect(world).toHaveAttribute("data-world-paused", "false");
}

type Recorder = {
  stamps: number[];
  events: { t: number; type: string; detail?: unknown }[];
  running: boolean;
};

/** Starts an in-page requestAnimationFrame recorder (frame start timestamps) + pause/quality/focus event log. */
export async function startRecorder(page: Page, world: Locator) {
  await world.evaluate(element => {
    const rec: Recorder = { stamps: [], events: [], running: true };
    (window as unknown as { __tqaFrames: Recorder }).__tqaFrames = rec;
    const loop = (t: number) => {
      if (!rec.running) return;
      rec.stamps.push(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    element.addEventListener("tqa:world-state", event => rec.events.push({ t: performance.now(), type: "world-state", detail: (event as CustomEvent).detail }));
    window.addEventListener("blur", () => rec.events.push({ t: performance.now(), type: "window-blur" }));
    window.addEventListener("focus", () => rec.events.push({ t: performance.now(), type: "window-focus" }));
    document.addEventListener("visibilitychange", () => rec.events.push({ t: performance.now(), type: `visibility-${document.visibilityState}` }));
  });
}

export const pageNow = (page: Page) => page.evaluate(() => performance.now());

export async function stopRecorder(page: Page) {
  return page.evaluate(() => {
    const rec = (window as unknown as { __tqaFrames: Recorder }).__tqaFrames;
    rec.running = false;
    return { stamps: rec.stamps, events: rec.events };
  });
}

/**
 * Drives the fixed route for `durationMs` (wall clock): W held, ← held `turnMs` every `periodMs`.
 * `hold` stays pressed for the whole time; keys are released at the end.
 */
export async function driveRoute(page: Page, durationMs: number, onTick?: (elapsedMs: number) => Promise<void>) {
  const start = Date.now();
  await page.keyboard.down("KeyW");
  let turning = false;
  try {
    for (;;) {
      const elapsed = Date.now() - start;
      if (elapsed >= durationMs) break;
      const inCycle = elapsed % ROUTE.periodMs;
      const shouldTurn = inCycle < ROUTE.turnMs;
      if (shouldTurn !== turning) {
        if (shouldTurn) await page.keyboard.down("ArrowLeft");
        else await page.keyboard.up("ArrowLeft");
        turning = shouldTurn;
      }
      if (onTick) await onTick(elapsed);
      await page.waitForTimeout(50);
    }
  } finally {
    if (turning) await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("KeyW");
  }
}

/** Init script (T09 only): counts live WebGL objects and draw calls on every WebGL(2) context of the page. */
export function installGlCounter() {
  type Counter = { live: Record<string, number>; draws: number };
  const counter: Counter = { live: {}, draws: 0 };
  (window as unknown as { __tqaGl: Counter }).__tqaGl = counter;
  const kinds = ["Buffer", "Texture", "Program", "Shader", "Framebuffer", "Renderbuffer", "VertexArray"];
  const alive = new WeakSet<object>();
  for (const ctor of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!ctor) continue;
    const proto = ctor.prototype as unknown as Record<string, unknown>;
    for (const kind of kinds) {
      counter.live[kind] ??= 0;
      const create = proto[`create${kind}`];
      const remove = proto[`delete${kind}`];
      if (typeof create !== "function" || typeof remove !== "function") continue;
      proto[`create${kind}`] = function (this: unknown, ...args: unknown[]) {
        const object = (create as (...a: unknown[]) => unknown).apply(this, args);
        if (object && typeof object === "object" && !alive.has(object)) {
          alive.add(object);
          counter.live[kind]!++;
        }
        return object;
      };
      proto[`delete${kind}`] = function (this: unknown, object: unknown, ...args: unknown[]) {
        if (object && typeof object === "object" && alive.has(object)) {
          alive.delete(object);
          counter.live[kind]!--;
        }
        return (remove as (...a: unknown[]) => unknown).call(this, object, ...args);
      };
    }
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
      const draw = proto[name];
      if (typeof draw !== "function") continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        counter.draws++;
        return (draw as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
  }
}
