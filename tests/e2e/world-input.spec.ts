// L3-006 — world input while paused, Q13 (automatable part) and Q21 (page change part).
// Needs WebGL2 (SwiftShader in headless Edge); skipped as NOT RUN without it.
// If the window has no focus (headless/CI), `ensureWindowFocus` emulates it (annotated) so pause assertions see
// only the menu's `overlay` reason. Run headed to exercise real window focus.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
// Enter World with software WebGL takes ~15–20 s under parallel load; leave headroom over the 30 s default.
test.describe.configure({ timeout: 90_000 });

const dialog = (page: Page) => page.locator(".world-menu dialog");

async function setup(page: Page) {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  const focusMode = await ensureWindowFocus(page);
  test.info().annotations.push({ type: "window-focus", description: focusMode });
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  return world!;
}

/** Screenshot of the canvas area, after the camera spring arm / crown fade have settled. */
async function canvasShot(page: Page, world: Locator) {
  await page.waitForTimeout(600);
  return world.locator("canvas").screenshot({ animations: "disabled", caret: "hide" });
}

test("Q13 (automatable part): W/A/S/D/E typed in the menu <select> neither close the menu nor change pause/quality", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  // Adaptive quality (L2-007) may already have stepped down under load; the menu pauses it from here on.
  const initial = (await world.getAttribute("data-world-quality")) ?? "";
  const select = dialog(page).getByRole("combobox", { name: "Quality" });
  await select.focus();
  await expect(select).toBeFocused();

  for (const key of ["w", "a", "s", "d", "e", "W", "A", "S", "D", "E"]) {
    await page.keyboard.press(key);
    await expect(dialog(page), `"${key}" closed the menu`).toHaveAttribute("open", "");
    await expect(world, `"${key}" changed paused`).toHaveAttribute("data-world-paused", "true");
  }
  await expect(select).toBeFocused();
  await expect(select).toHaveValue(initial);
  await expect(world).toHaveAttribute("data-world-quality", initial);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("§6.1 camera input is blocked while the menu pauses the world (ArrowLeft held); control: it rotates once resumed", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);

  await page.keyboard.press("Escape");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  const before = await canvasShot(page, world);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(800);
  await page.keyboard.up("ArrowLeft");
  const whilePaused = await canvasShot(page, world);
  expect(whilePaused.equals(before), "camera moved while the menu was open").toBe(true);

  // Control: the same input rotates the camera after the menu closes (proves the check can fail).
  await page.keyboard.press("Escape");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  const resumed = await canvasShot(page, world);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(800);
  await page.keyboard.up("ArrowLeft");
  const rotated = await canvasShot(page, world);
  expect(rotated.equals(resumed), "control failed: ArrowLeft did not rotate the running world").toBe(false);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Q21 (page change): menu → Quick Portfolio, then Back → Welcome in its initial state (no world, no canvas)", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => {
    const shows: boolean[] = [];
    (window as unknown as { __tqaPageshow: boolean[] }).__tqaPageshow = shows;
    window.addEventListener("pageshow", event => shows.push(event.persisted));
  });
  await setup(page);

  await page.keyboard.press("Escape");
  await dialog(page).getByRole("link", { name: "Open Quick Portfolio" }).click();
  await expect(page).toHaveURL(/\/en\/quick\/$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/en\/$/);
  const restore = await page.evaluate(() => ({
    pageshow: (window as unknown as { __tqaPageshow?: boolean[] }).__tqaPageshow ?? [],
    navigation: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
  }));
  test.info().annotations.push({
    type: "back-navigation",
    description: restore.pageshow.includes(true) ? "restored from bfcache" : `fresh load (navigation type: ${restore.navigation})`,
  });

  await expect(page.locator("[data-app-mode='world']")).toHaveCount(0);
  await expect(page.locator("[data-app-mode]")).toHaveAttribute("data-app-mode", "welcome");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
  await expect(page.locator(".world-menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter World" })).toBeEnabled();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Q21 (reload): reloading while in the world starts a new session on Welcome", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await setup(page);
  await page.reload();
  await expect(page.locator("[data-app-mode]")).toHaveAttribute("data-app-mode", "welcome");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter World" })).toBeEnabled();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("Q21 (language switch inside the world keeps position/secret)", () => {
  test.skip(true, "NOT RUN: switching language from inside the world is not implemented yet (no control in the world UI)");
});
