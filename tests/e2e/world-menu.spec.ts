// L3-006 — world menu e2e (spec §6.2, §6.4, §13 T07 menu part; ADR 0008 pause/quality/return-to-path).
// Needs WebGL2 (SwiftShader in headless Edge, see playwright.config.ts); skipped as NOT RUN without it.
// Pause assertions: a window without focus (headless/CI) makes the world start with a `windowBlur` reason.
// `ensureWindowFocus` emulates window focus first (annotated per test) so `data-world-paused` reflects
// only the menu's `overlay` reason; run headed (`--headed`) to exercise real window focus.
import { expect, test, type Page } from "@playwright/test";
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
// Enter World with software WebGL takes ~15–20 s under parallel load; leave headroom over the 30 s default.
test.describe.configure({ timeout: 90_000 });

const dialog = (page: Page) => page.locator(".world-menu dialog");
const title = (page: Page) => page.locator("#world-menu-title");
const trigger = (page: Page) => page.locator(".world-menu > button[aria-haspopup='dialog']");

async function setup(page: Page) {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  const focusMode = await ensureWindowFocus(page);
  test.info().annotations.push({ type: "window-focus", description: focusMode });
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  return world!;
}

async function focusIsInsideDialog(page: Page) {
  return page.evaluate(() => Boolean(document.activeElement?.closest(".world-menu dialog")));
}

test("T07 menu: Esc opens (paused, focus on title), Tab/Shift+Tab stay inside, Esc closes (resumed, focus back to world)", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await expect(title(page)).toBeFocused();

  // 6 focusable items (× Close, select, Return to path, Quick link, summary, Close): go around twice.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await focusIsInsideDialog(page), `Tab #${i + 1} left the dialog`).toBe(true);
  }
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusIsInsideDialog(page), `Shift+Tab #${i + 1} left the dialog`).toBe(true);
  }

  await page.getByRole("button", { name: "× Close" }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("§6.2.7 quality: <select> changes data-world-quality and emits tqa:world-state on the same canvas (no remount)", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);
  await expect(world).toHaveAttribute("data-world-quality", "balanced");
  const canvasBefore = await world.locator("canvas").elementHandle();
  await world.evaluate(element => {
    const log: unknown[] = [];
    (window as unknown as { __tqaStates: unknown[] }).__tqaStates = log;
    element.addEventListener("tqa:world-state", event => log.push((event as CustomEvent).detail));
  });

  await page.keyboard.press("Escape");
  const select = dialog(page).getByRole("combobox", { name: "Quality" });
  await expect(select).toHaveValue("balanced");
  for (const quality of ["low", "high", "balanced"] as const) {
    await select.selectOption(quality);
    await expect(world).toHaveAttribute("data-world-quality", quality);
  }

  await expect(world.locator("canvas")).toHaveCount(1);
  const canvasAfter = await world.locator("canvas").elementHandle();
  expect(await page.evaluate(([a, b]) => a === b, [canvasBefore, canvasAfter]), "canvas element was replaced").toBe(true);
  const states = await page.evaluate(() => (window as unknown as { __tqaStates: unknown[] }).__tqaStates);
  // Opening the menu (overlay pause), then one event per quality change; paused stays true throughout.
  expect(states).toEqual([
    { paused: true, quality: "balanced" },
    { paused: true, quality: "low" },
    { paused: true, quality: "high" },
    { paused: true, quality: "balanced" },
  ]);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("T07 menu: corner button opens the menu; × Close closes it and returns focus to the button", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await expect(trigger(page)).toBeVisible();
  await trigger(page).click();
  await expect(dialog(page)).toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await expect(title(page)).toBeFocused();

  await page.getByRole("button", { name: "× Close" }).click();
  await expect(dialog(page)).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(trigger(page)).toBeFocused();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("ADR 0008 return to path: menu button dispatches tqa:return-to-path, closes the menu, world keeps running without console errors", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);
  await world.evaluate(element => {
    (window as unknown as { __tqaReturns: number }).__tqaReturns = 0;
    element.addEventListener("tqa:return-to-path", () => void (window as unknown as { __tqaReturns: number }).__tqaReturns++);
  });

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveAttribute("open", "");
  await dialog(page).getByRole("button", { name: "Return to path" }).click();
  await expect(dialog(page)).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => (window as unknown as { __tqaReturns: number }).__tqaReturns)).toBe(1);
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  // Let the world simulate/render a few frames after recovering.
  await page.waitForTimeout(750);
  await expect(world.locator("canvas")).toHaveCount(1);
  await expect(page.locator("[data-app-mode='world']")).toHaveCount(1);
  expect(errors, errors.join("\n")).toEqual([]);
});
