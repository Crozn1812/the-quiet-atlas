// L3-006 — world input while paused, Q13 (automatable part) and Q21 (page change part).
// Needs WebGL2 (SwiftShader in headless Edge); skipped as NOT RUN without it.
// If the window has no focus (headless/CI), `ensureWindowFocus` emulates it (annotated) so pause assertions see
// only the menu's `overlay` reason. Run headed to exercise real window focus.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld, ensureWindowFocus, HUD, LOCALES, MENU_TRIGGER, trackConsoleErrors, trackNetwork, WORLD_MARKER } from "./helpers";

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

// L3-009 — Q21 language switch inside the world (spec §6.3, L1-009): the menu's "English" / "Tiếng Việt" buttons swap
// the dictionary and overlay content in place, replace the URL /en/ ↔ /vi/ (history.replaceState), keep the Canvas
// (no remount) and the player's position. There is no public position API: position is checked through
// `data-world-hint` / `data-world-quality` and through canvas pixels of the frame frozen by the open menu (the player
// is walked away from spawn first, so a remount, which respawns at (0, 4) with the initial camera, would change it).
// The running scene is not pixel-stable while idle, so position after resuming is only checked via `data-world-hint`.
test.describe("Q21 language switch inside the world", () => {
  const world = (page: Page) => page.locator(`[data-world-chunk]`);
  const languages = (page: Page) => dialog(page).locator("fieldset");
  const overlay = (page: Page) => page.locator("dialog.world-content");
  /** HUD/corner card text changes with the language; hide it so canvas pixels compare only the 3D scene. */
  const SCENE_ONLY = ".corner-panel, .world-hud, .world-menu dialog, [aria-live] { visibility: hidden !important; }";

  async function sceneShot(page: Page) {
    await page.waitForTimeout(800);
    return world(page).locator("canvas").screenshot({ animations: "disabled", caret: "hide", style: SCENE_ONLY });
  }

  /** Counts WebGL2 contexts created on <canvas> elements (a world remount creates a new one). */
  const COUNT_WEBGL2 = () => {
    const original = HTMLCanvasElement.prototype.getContext;
    const w = window as unknown as { __tqaWebgl2: number };
    w.__tqaWebgl2 = 0;
    const seen = new WeakSet<HTMLCanvasElement>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const context = (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      if (type === "webgl2" && context && !seen.has(this)) {
        seen.add(this);
        w.__tqaWebgl2++;
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
  };
  const webgl2Count = (page: Page) => page.evaluate(() => (window as unknown as { __tqaWebgl2: number }).__tqaWebgl2);

  async function enter(page: Page, locale: "en" | "vi") {
    await page.addInitScript(COUNT_WEBGL2);
    const entered = await enterWorld(page, locale);
    test.skip(!entered, "NOT RUN: WebGL2 unavailable in this browser");
    const focusMode = await ensureWindowFocus(page);
    test.info().annotations.push({ type: "window-focus", description: focusMode });
    await expect(entered!).toHaveAttribute("data-world-paused", "false");
    // Tag the live canvas: a remount would replace the element and lose the tag.
    await entered!.locator("canvas").evaluate(canvas => void ((canvas as unknown as { __tqaTag: string }).__tqaTag = "L3-009"));
    return entered!;
  }

  async function switchLanguage(page: Page, from: (typeof LOCALES)[number], to: (typeof LOCALES)[number], label: string) {
    if ((await dialog(page).getAttribute("open")) === null) await page.locator(MENU_TRIGGER).click();
    await expect(dialog(page)).toHaveAttribute("open", "");
    await expect(languages(page).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    const historyLength = await page.evaluate(() => history.length);
    await languages(page).getByRole("button", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`/${to.locale}/$`));
    expect(await page.evaluate(() => history.length), "language switch must replace, not push, the history entry").toBe(historyLength);
    await expect(page.locator("html")).toHaveAttribute("lang", to.locale);
    await expect(languages(page).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    await expect(languages(page).getByRole("button", { name: from.locale === "vi" ? "Tiếng Việt" : "English" })).toHaveAttribute("aria-pressed", "false");
    await expect(dialog(page)).toHaveAttribute("open", "");
  }

  async function expectSameWorld(page: Page, webgl2Before: number) {
    await expect(world(page)).toHaveCount(1);
    await expect(page.locator("canvas")).toHaveCount(1);
    expect(await world(page).locator("canvas").evaluate(canvas => (canvas as unknown as { __tqaTag?: string }).__tqaTag), "canvas element was replaced (remount)").toBe("L3-009");
    expect(await webgl2Count(page), "a new WebGL2 context was created (remount)").toBe(webgl2Before);
    await expect(page.locator("[data-app-mode='world']")).toHaveCount(1);
  }

  test("en → vi: URL /vi/ via replaceState, lang/title/menu/HUD in Vietnamese, same Canvas, 0 errors; axe on the open menu", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const network = trackNetwork(page);
    const entered = await enter(page, "en");
    const [en, vi] = LOCALES;
    await expect(page).toHaveTitle("Welcome · The Quiet Atlas");
    const webgl2Before = await webgl2Count(page);
    const chunksBefore = (await network.worldChunks()).length;
    const hint = await entered.getAttribute("data-world-hint");

    await switchLanguage(page, en, vi, "Tiếng Việt");
    await expect(page).toHaveTitle("Chào mừng · The Quiet Atlas");
    await expect(dialog(page).getByRole("button", { name: vi.leave, exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Đóng", exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "× Đóng", exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("combobox", { name: "Chất lượng" })).toBeVisible();
    await expect(dialog(page).getByRole("link", { name: "Mở Quick Portfolio" })).toHaveAttribute("href", "/vi/quick/");
    await expect(languages(page).locator("legend")).toHaveText("Ngôn ngữ");
    await expect(page.locator(HUD)).toHaveAttribute("aria-label", "Thao tác world");
    await expect(page.locator(HUD).getByRole("button", { name: vi.sound, exact: true })).toBeAttached();
    await expect(page.locator(HUD).getByRole("button", { name: vi.leave, exact: true })).toBeAttached();
    await expect(page.locator(HUD).getByRole("link", { name: "Quick Portfolio" })).toHaveAttribute("href", "/vi/quick/");

    await test.step("axe on the open menu (vi): 0 critical/serious", async () => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      const blocking = results.violations.filter(v => v.impact === "critical" || v.impact === "serious");
      test.info().annotations.push({ type: "axe vi menu", description: `violations: ${results.violations.map(v => `${v.id} (${v.impact})`).join(", ") || "none"}` });
      expect(blocking.map(v => `${v.impact} ${v.id}: ${v.help} → ${v.nodes.map(n => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });

    await expectSameWorld(page, webgl2Before);
    expect((await network.worldChunks()).length, "world chunk re-requested").toBe(chunksBefore);
    await expect(entered).toHaveAttribute("data-world-chunk", WORLD_MARKER);

    await dialog(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    // The hint is cleared while paused (interaction disabled); once resumed it must be the same target as before.
    if (hint === null) await expect(entered).not.toHaveAttribute("data-world-hint", /.*/);
    else await expect(entered).toHaveAttribute("data-world-hint", hint);
    await expectSameWorld(page, webgl2Before);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("vi → en: URL /en/ via replaceState, lang/title/HUD in English, same Canvas, 0 errors", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await enter(page, "vi");
    const [en, vi] = LOCALES;
    await expect(page).toHaveTitle("Chào mừng · The Quiet Atlas");
    await expect(page.locator(HUD)).toHaveAttribute("aria-label", "Thao tác world");
    const webgl2Before = await webgl2Count(page);

    await switchLanguage(page, vi, en, "English");
    await expect(page).toHaveTitle("Welcome · The Quiet Atlas");
    await expect(dialog(page).getByRole("button", { name: en.leave, exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeVisible();
    await expect(languages(page).locator("legend")).toHaveText("Language");
    await expect(page.locator(HUD)).toHaveAttribute("aria-label", "World actions");
    await expect(page.locator(HUD).getByRole("button", { name: en.sound, exact: true })).toBeAttached();
    await expect(page.locator(HUD).getByRole("link", { name: "Quick Portfolio" })).toHaveAttribute("href", "/en/quick/");
    await expectSameWorld(page, webgl2Before);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("position kept: walk away from spawn, switch en → vi, the scene frame is unchanged (control: walking changed it)", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const entered = await enter(page, "en");
    const [en, vi] = LOCALES;
    const webgl2Before = await webgl2Count(page);

    // The running scene is not pixel-stable while idle, so every frame is taken with the menu open (world paused,
    // frame frozen — see the §6.1 test above). Menu/HUD text is hidden by SCENE_ONLY.
    async function pausedShot() {
      await expect(entered).toHaveAttribute("data-world-paused", "true");
      return sceneShot(page);
    }
    await page.locator(MENU_TRIGGER).click();
    const atSpawn = await pausedShot();
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    await entered.focus();
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1_200);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(800);
    const hint = await entered.getAttribute("data-world-hint");

    await page.locator(MENU_TRIGGER).click();
    const walked = await pausedShot();
    // Control: the frame depends on the position, so a respawn (remount at (0, 4)) would be visible.
    expect(walked.equals(atSpawn), "control failed: walking did not change the frame").toBe(false);
    const quality = await entered.getAttribute("data-world-quality");

    // Same menu session (no resume in between, so idle settling of the running world cannot change the frame).
    await switchLanguage(page, en, vi, "Tiếng Việt");
    const switched = await pausedShot();
    expect(switched.equals(walked), "scene frame changed across the language switch (position/camera not kept)").toBe(true);
    await expect(entered).toHaveAttribute("data-world-quality", quality ?? "");
    await expectSameWorld(page, webgl2Before);

    await dialog(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    if (hint === null) await expect(entered).not.toHaveAttribute("data-world-hint", /.*/);
    else await expect(entered).toHaveAttribute("data-world-hint", hint);
    test.info().annotations.push({ type: "position", description: `hint after walking: ${hint ?? "none"}; frozen scene frame identical before/after the switch` });
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("overlay content follows the language: en shows Close / Nguyen Huu Bao Duy; after switching to vi, Đóng / Nguyễn Hữu Bảo Duy", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const entered = await enter(page, "en");
    const [en, vi] = LOCALES;
    const openFirstLight = () =>
      entered.evaluate(element => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "first-light" } })));

    await openFirstLight();
    await expect(overlay(page)).toHaveAttribute("open", "");
    await expect(overlay(page).getByRole("button", { name: "× Close", exact: true })).toBeVisible();
    await expect(overlay(page).getByRole("heading", { level: 1, name: en.name })).toBeVisible({ timeout: 10_000 });
    await overlay(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(overlay(page)).not.toHaveAttribute("open", "");

    await switchLanguage(page, en, vi, "Tiếng Việt");
    await dialog(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");

    await openFirstLight();
    await expect(overlay(page)).toHaveAttribute("open", "");
    await expect(overlay(page).getByRole("button", { name: "× Đóng", exact: true })).toBeVisible();
    await expect(overlay(page).getByRole("heading", { level: 1, name: vi.name })).toBeVisible({ timeout: 10_000 });
    await expect(overlay(page).getByRole("heading", { level: 1, name: en.name })).toHaveCount(0);
    await overlay(page).getByRole("button", { name: "× Đóng", exact: true }).click();
    await expect(overlay(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("exit after switching en → vi: full navigation to the /vi/ Welcome (no world, no canvas)", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await enter(page, "en");
    const [en, vi] = LOCALES;
    await switchLanguage(page, en, vi, "Tiếng Việt");
    await dialog(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");

    // A full navigation drops the in-page tag set on window by this test.
    await page.evaluate(() => void ((window as unknown as { __tqaSameDocument: boolean }).__tqaSameDocument = true));
    await page.locator(HUD).getByRole("button", { name: vi.leave, exact: true }).click();
    await expect(page).toHaveURL(/\/vi\/$/);
    await expect(page.getByRole("heading", { level: 1, name: vi.name })).toBeVisible();
    await expect(page.locator("[data-app-mode]")).toHaveAttribute("data-app-mode", "welcome");
    expect(await page.evaluate(() => (window as unknown as { __tqaSameDocument?: boolean }).__tqaSameDocument ?? false), "exit was not a full navigation").toBe(false);
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
    await expect(page.locator(".world-menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enter World" })).toBeEnabled();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
