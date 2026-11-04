// L3-007 — P01-E interaction + content overlay e2e (spec §6.1, §6.3, §13 T07; ADR 0008 open-content/content-closed/hint).
// Needs WebGL2 (SwiftShader in headless Edge); skipped as NOT RUN without it. Window focus as in world-menu.spec.ts.
// Positions (src/features/world/index.ts, src/state/session.ts): spawn (0, 4), First Light signpost (1.8, 4) → hinted
// at spawn; Workshop desk (2, −3). Initial camera yaw atan2(7, 9): holding W+D walks along ≈ (0.12, −0.99), which passes
// ≈ 1.1 m from the desk (radius 2.5 m). The drive is checked through `data-world-hint`; if it never reaches "workshop"
// the test falls back to dispatching `tqa:open-content` (allowed by the ticket) and says so in an annotation.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
// One worker for this file (tests in order, a failure does not skip the rest): fewer simultaneous SwiftShader worlds
// keeps parallel load down — under heavy load L2-007 adaptive quality drops other specs' worlds to Low.
test.describe.configure({ mode: "default", timeout: 90_000 });

const overlay = (page: Page) => page.locator("dialog.world-content");
const overlayTitle = (page: Page) => page.locator("#world-content-title");

async function setup(page: Page) {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  const focusMode = await ensureWindowFocus(page);
  test.info().annotations.push({ type: "window-focus", description: focusMode });
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  await world!.evaluate(element => {
    const w = window as unknown as { __tqaOpened: string[]; __tqaClosed: string[]; __tqaLatency: number[] };
    w.__tqaOpened = [];
    w.__tqaClosed = [];
    w.__tqaLatency = [];
    // Start = the E keydown (capture, before the world sees it) or, for a dispatched request, the event itself
    // (capture phase on document runs before the overlay's own listener on the container).
    let start: number | undefined;
    document.addEventListener("keydown", event => void (event.code === "KeyE" && (start = performance.now())), true);
    document.addEventListener("tqa:open-content", () => void (start ??= performance.now()), true);
    const dialog = document.querySelector("dialog.world-content")!;
    new MutationObserver(() => {
      if (dialog.hasAttribute("open") && start !== undefined && dialog.querySelector("#world-content-title")) {
        w.__tqaLatency.push(performance.now() - start);
        start = undefined;
      }
    }).observe(dialog, { attributes: true, attributeFilter: ["open"], childList: true, subtree: true });
    element.addEventListener("tqa:open-content", event => void w.__tqaOpened.push((event as CustomEvent).detail?.zoneId));
    element.addEventListener("tqa:content-closed", event => void w.__tqaClosed.push((event as CustomEvent).detail?.zoneId));
  });
  return world!;
}

const events = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __tqaOpened: string[]; __tqaClosed: string[] };
    return { opened: w.__tqaOpened, closed: w.__tqaClosed };
  });

/** In-page time (ms) from E keydown / open request to the overlay dialog being open with its title rendered. */
async function openLatencyMs(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tqaLatency: number[] }).__tqaLatency.length)).toBeGreaterThan(0);
  return page.evaluate(() => (window as unknown as { __tqaLatency: number[] }).__tqaLatency.at(-1)!);
}

/**
 * T07 "overlay mở ≤ 300 ms" is a reference-machine budget. Headless SwiftShader under parallel load measured 6–380 ms
 * for the same synchronous open, so here the value is only recorded; T07_LATENCY_GATE=1 (e.g. a headed run on the
 * ADR 0007 machine) turns it into an assertion.
 */
async function recordOpenLatency(page: Page) {
  const latency = await openLatencyMs(page);
  const gate = process.env.T07_LATENCY_GATE === "1";
  test.info().annotations.push({ type: "overlay-open-ms", description: `${latency.toFixed(1)} ms${gate ? " (gated ≤ 300 ms)" : " (recorded only: headless SwiftShader is not the reference machine)"}` });
  if (gate) expect(latency, "T07: overlay opens ≤ 300 ms").toBeLessThanOrEqual(300);
}

async function closeWithEscape(page: Page, world: Locator, zoneId: string) {
  await page.keyboard.press("Escape");
  await expect(overlay(page)).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  // The world menu must not have opened on the same Escape.
  await expect(page.locator(".world-menu dialog")).not.toHaveAttribute("open", "");
  expect((await events(page)).closed).toEqual([zoneId]);
}

test("T07 First Light: hinted at spawn, E opens the overlay (paused, focus on title, open latency recorded), Esc closes (resumed, focus back)", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await expect(world).toHaveAttribute("data-world-hint", "first-light");
  await expect(world.getByText("E — First Light signpost (placeholder)")).toBeAttached();
  await page.keyboard.press("e");
  await expect(overlay(page)).toHaveAttribute("open", "");
  await recordOpenLatency(page);
  expect((await events(page)).opened).toEqual(["first-light"]);
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await expect(overlayTitle(page)).toHaveText("The First Light");
  await expect(overlayTitle(page)).toBeFocused();
  // Content JSON is fetched under parallel SwiftShader load; same headroom as the other content checks here.
  await expect(overlay(page).getByRole("heading", { level: 1, name: "Nguyen Huu Bao Duy" })).toBeVisible({ timeout: 10_000 });

  await closeWithEscape(page, world, "first-light");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("T07 Workshop: walk to the desk with real keys (W+D), hint = workshop, E opens the project list; Esc closes", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  // The in-page poll stops the walk in the same frame the hint appears (synthetic keyup on window, where the world
  // listens): a Playwright round trip under parallel load can take longer than crossing the 2.5 m circle (≈ 1.5 s).
  // The real keyups follow in `finally`.
  const reached = await world
    .evaluate(
      (element, timeoutMs) =>
        new Promise<boolean>(resolve => {
          const start = performance.now();
          const poll = () => {
            if (element.getAttribute("data-world-hint") === "workshop") {
              for (const [code, key] of [["KeyD", "d"], ["KeyW", "w"]]) window.dispatchEvent(new KeyboardEvent("keyup", { code, key }));
              resolve(true);
            } else if (performance.now() - start > timeoutMs) resolve(false);
            else requestAnimationFrame(poll);
          };
          poll();
        }),
      20_000,
    )
    .finally(async () => {
      await page.keyboard.up("KeyD");
      await page.keyboard.up("KeyW");
    });

  if (reached) {
    test.info().annotations.push({ type: "workshop-route", description: "reached the desk with real keys (W+D)" });
    await expect(world).toHaveAttribute("data-world-hint", "workshop");
    await page.keyboard.press("e");
  } else {
    test.info().annotations.push({ type: "workshop-route", description: "SIMULATED: hint never became 'workshop' within 15 s; dispatched tqa:open-content {zoneId:'workshop'} instead" });
    await world.evaluate(element => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "workshop" } })));
  }

  await expect(overlay(page)).toHaveAttribute("open", "");
  await recordOpenLatency(page);
  expect((await events(page)).opened).toEqual(["workshop"]);
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await expect(overlayTitle(page)).toHaveText("The Workshop");
  await expect(overlayTitle(page)).toBeFocused();
  // Content arrives from /en/world-content.json: the project list (links to case studies).
  await expect(overlay(page).getByRole("heading", { level: 2, name: "Featured projects" })).toBeVisible({ timeout: 10_000 });
  await expect(overlay(page).locator("a[href^='/en/projects/']").first()).toBeVisible();
  await expect(overlay(page).getByText("Under construction")).toHaveCount(0);

  await closeWithEscape(page, world, "workshop");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("§6.3 zone without data (roots): overlay shows 'Under construction' with a Quick Portfolio link; × Close closes", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  // Simulated request: P01-E has no 3D object for The Roots yet (ADR 0008 zone list).
  await world.evaluate(element => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "roots" } })));
  await expect(overlay(page)).toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await expect(overlayTitle(page)).toHaveText("The Roots");
  await expect(overlayTitle(page)).toBeFocused();
  await expect(overlay(page).getByText("Under construction")).toBeVisible({ timeout: 10_000 });
  await expect(overlay(page).getByRole("link", { name: "Quick Portfolio" })).toHaveAttribute("href", "/en/quick/");

  await overlay(page).getByRole("button", { name: "× Close" }).click();
  await expect(overlay(page)).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  expect((await events(page)).closed).toEqual(["roots"]);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("§6.1 overlay and menu never stack: Esc with the overlay open closes the overlay only; menu still opens afterwards", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await page.keyboard.press("e");
  await expect(overlay(page)).toHaveAttribute("open", "");
  // A second open request while open is ignored.
  await world.evaluate(element => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "workshop" } })));
  await expect(overlayTitle(page)).toHaveText("The First Light");
  await closeWithEscape(page, world, "first-light");

  await page.keyboard.press("Escape");
  await expect(page.locator(".world-menu dialog")).toHaveAttribute("open", "");
  await expect(overlay(page)).not.toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".world-menu dialog")).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  expect(errors, errors.join("\n")).toEqual([]);
});
