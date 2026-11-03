// L3-007 — Q15 (context loss part): WebGL context lost inside the world → HTML fallback ≤ 2 s; content and CV reachable.
// Context loss is simulated with the WEBGL_lose_context extension on the world's own canvas.
// Two layers (ADR 0008, P01-F extension):
//   1. world contract (L2-007, merged): `tqa:world-error {kind:"context-lost"}` on the container, bubbles: false.
//   2. UI handling (L1-007, in progress at the time of writing): the portfolio UI leaves world mode and brings the
//      viewer back to HTML within 2 s. Until L1-007 lands this is a known product gap → `test.fail()`; once it lands
//      the test passes unexpectedly and Playwright reports it, so the marker must be removed.
// Load failure / no WebGL parts of Q15 are covered by html-fallback.spec.ts.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld, ensureWindowFocus } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
// One worker for this file: keeps the number of simultaneous SwiftShader worlds down (see world-content.spec.ts).
test.describe.configure({ mode: "default", timeout: 90_000 });

async function setup(page: Page) {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  test.info().annotations.push({ type: "window-focus", description: await ensureWindowFocus(page) });
  await world!.evaluate(element => {
    const w = window as unknown as { __tqaErrors: { kind: unknown; at: number }[] };
    w.__tqaErrors = [];
    element.addEventListener("tqa:world-error", event => void w.__tqaErrors.push({ kind: (event as CustomEvent).detail?.kind, at: performance.now() }));
  });
  return world!;
}

/** Loses the world canvas's WebGL context; returns the in-page time (ms) of the call, or null without the extension. */
async function loseContext(world: Locator) {
  return world.locator("canvas").evaluate(canvas => {
    const c = canvas as HTMLCanvasElement;
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGL2RenderingContext | null;
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (!ext) return null;
    const at = performance.now();
    ext.loseContext();
    return at;
  });
}

test("Q15 world contract: losing the WebGL context emits tqa:world-error {kind:'context-lost'} once on the container", async ({ page }) => {
  const world = await setup(page);
  const at = await loseContext(world);
  test.skip(at === null, "NOT RUN: WEBGL_lose_context unavailable");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tqaErrors: unknown[] }).__tqaErrors.length), { timeout: 5_000 }).toBe(1);
  const [error] = await page.evaluate(() => (window as unknown as { __tqaErrors: { kind: unknown; at: number }[] }).__tqaErrors);
  expect(error!.kind).toBe("context-lost");
  test.info().annotations.push({ type: "event-latency", description: `${(error!.at - at!).toFixed(1)} ms after loseContext()` });
});

test("Q15 UI: after context loss the viewer is back on HTML within 2 s (world mode left, Quick Portfolio + CV reachable)", async ({ page }) => {
  test.fail(true, "Known gap (L1-007 not merged on this branch): WorldEntry does not listen for tqa:world-error, so the page stays in world mode with a dead canvas. Remove this marker when L1-007 lands.");
  const world = await setup(page);
  const at = await loseContext(world);
  test.skip(at === null, "NOT RUN: WEBGL_lose_context unavailable");

  // ≤ 2 s budget (spec §13 Q15), measured from the loseContext() call.
  await expect(page.locator("[data-app-mode='world']")).toHaveCount(0, { timeout: 2_000 });
  await expect(page.locator("[data-app-mode]")).not.toHaveAttribute("data-app-mode", "loading");
  await expect(page.getByRole("link", { name: /Quick Portfolio|View Editorial/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /CV/ }).first()).toBeVisible();
});
