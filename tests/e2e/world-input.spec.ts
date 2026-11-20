// L3-006 — world input while paused, Q13 (automatable part) and Q21 (page change part).
// Needs WebGL2 (SwiftShader in headless Edge); skipped as NOT RUN without it.
// If the window has no focus (headless/CI), `ensureWindowFocus` emulates it (annotated) so pause assertions see
// only the menu's `overlay` reason. Run headed to exercise real window focus.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "./test";
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
  // QF-01: quality is two toggle buttons; focus the pressed one (the control a keyboard user lands on).
  const select = dialog(page).getByRole("group", { name: "Quality" }).locator(`button[value="${initial}"]`);
  await select.focus();
  await expect(select).toBeFocused();

  for (const key of ["w", "a", "s", "d", "e", "W", "A", "S", "D", "E"]) {
    await page.keyboard.press(key);
    await expect(dialog(page), `"${key}" closed the menu`).toHaveAttribute("open", "");
    await expect(world, `"${key}" changed paused`).toHaveAttribute("data-world-paused", "true");
  }
  await expect(select).toBeFocused();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(world).toHaveAttribute("data-world-quality", initial);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("§6.1 camera input is blocked while the menu pauses the world (ArrowLeft held); control: it rotates once resumed", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await setup(page);
  // Since QF-01 the default is High, which keeps streaming detail in for a while; a pixel comparison
  // must start from a finished, stable world. Low + build done isolates the input check.
  await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "low" } })));
  await expect(world).toHaveAttribute("data-world-build", "done", { timeout: 90_000 });

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

// Q21 / ADR 0016: Menu language changes the page URL, metadata and outgoing page links.
// World copy stays English, with the same canvas, WebGL context and player position.
// Position is checked through the frozen scene after walking away from spawn, plus the resumed hint.
test.describe("Q21 language switch inside the world", () => {
  const world = (page: Page) => page.locator(`[data-world-chunk]`);
  // B2-230 adds a quality fieldset; the language fieldset is the one with the locale buttons.
  const languages = (page: Page) => dialog(page).locator("fieldset").filter({ has: page.getByRole("button", { name: "Tiếng Việt" }) });
  const overlay = (page: Page) => page.locator("dialog.world-content");
  /** Hide UI so the frozen canvas comparison checks only the player's scene. */
  const SCENE_ONLY =
    ".corner-panel, .world-hud, .world-menu dialog, [aria-live], [data-world-chunk] > p { visibility: hidden !important; }";

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

  test("en → vi: URL /vi/ via replaceState, page lang/title in Vietnamese, English menu/HUD, same Canvas, 0 errors; axe on the open menu", async ({ page }) => {
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
    await expect(dialog(page).getByRole("button", { name: en.leave, exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "× Close", exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("group", { name: "Quality" })).toBeVisible();
    await expect(dialog(page).getByRole("link", { name: "Open Quick Portfolio" })).toHaveAttribute("href", "/vi/quick/");
    await expect(languages(page).locator("legend")).toHaveText("Language");
    await expect(page.locator(HUD)).toHaveAttribute("aria-label", "World actions");
    await expect(page.locator(HUD).getByRole("button", { name: en.sound, exact: true })).toBeAttached();
    await expect(page.locator(HUD).getByRole("button", { name: en.leave, exact: true })).toBeAttached();
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

    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    // The hint is cleared while paused (interaction disabled); once resumed it must be the same target as before.
    if (hint === null) await expect(entered).not.toHaveAttribute("data-world-hint", /.*/);
    else await expect(entered).toHaveAttribute("data-world-hint", hint);
    await expectSameWorld(page, webgl2Before);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("vi → en: URL /en/ via replaceState, page lang/title in English, English HUD, same Canvas, 0 errors", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await enter(page, "vi");
    const [en, vi] = LOCALES;
    await expect(page).toHaveTitle("Chào mừng · The Quiet Atlas");
    await expect(page.locator(HUD)).toHaveAttribute("aria-label", "World actions");
    const webgl2Before = await webgl2Count(page);

    await switchLanguage(page, vi, en, "English");
    await expect(page).toHaveTitle("Welcome · The Quiet Atlas");
    await expect(dialog(page).getByRole("button", { name: en.leave, exact: true })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "× Close", exact: true })).toBeVisible();
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
    // Deferred dressing/ground (B2-179, B2-217) may still land while paused; compare only a finished world.
    test.setTimeout(180_000);
    // Idle desktop: done ~6 s after control (2026-11-06); allow parallel e2e load.
    await expect(entered).toHaveAttribute("data-world-build", "done", { timeout: 90_000 });
    await page.locator(MENU_TRIGGER).click();
    const atSpawn = await pausedShot();
    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
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

    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    if (hint === null) await expect(entered).not.toHaveAttribute("data-world-hint", /.*/);
    else await expect(entered).toHaveAttribute("data-world-hint", hint);
    test.info().annotations.push({ type: "position", description: `hint after walking: ${hint ?? "none"}; frozen scene frame identical before/after the switch` });
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("ADR 0016: overlay stays English after changing the page language to vi", async ({ page }) => {
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
    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");

    await openFirstLight();
    await expect(overlay(page)).toHaveAttribute("open", "");
    await expect(overlay(page).getByRole("button", { name: "× Close", exact: true })).toBeVisible();
    await expect(overlay(page).getByRole("heading", { level: 1, name: en.name })).toBeVisible({ timeout: 10_000 });
    await expect(overlay(page).getByRole("heading", { level: 1, name: vi.name })).toHaveCount(0);
    await overlay(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(overlay(page)).not.toHaveAttribute("open", "");
    await expect(entered).toHaveAttribute("data-world-paused", "false");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("exit after switching en → vi: full navigation to the /vi/ Welcome (no world, no canvas)", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await enter(page, "en");
    const [en, vi] = LOCALES;
    await switchLanguage(page, en, vi, "Tiếng Việt");
    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");

    // A full navigation drops the in-page tag set on window by this test.
    await page.evaluate(() => void ((window as unknown as { __tqaSameDocument: boolean }).__tqaSameDocument = true));
    await page.locator(HUD).getByRole("button", { name: en.leave, exact: true }).click();
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

// Q21 / ADR 0016 supersedes ADR 0008: world copy stays English on both page locales.
// Contract: `data-world-locale` on the container, `canvas[aria-label]`, hint text "E — …" (src/features/world/copy.ts).
// Expected strings mirror src/features/world/copy.ts (kept literal here so a copy regression is caught).
test.describe("Q21 world copy stays English (ADR 0016)", () => {
  const CANVAS_LABEL = {
    en: "A riverside journey through eight places. WASD to walk, Shift to run, ←→ or drag to orbit, +/− or wheel to zoom, E to interact, J for journal, Esc for menu. Click a nearby object to open its story.",
    vi: "Hành trình qua tám khu bên dòng sông. WASD để đi bộ, Shift để chạy, ←→ hoặc kéo để xoay, +/− hoặc cuộn để thu phóng, E để tương tác, J mở sổ, Esc mở menu. Bấm vật thể ở gần để mở câu chuyện.",
  } as const;
  // B2-100/B2-150: the First Light notebook is hinted at the spawn.
  const HINT = { en: "E — A first hello", vi: "E — Lời chào đầu" } as const;

  test("Enter World on /vi/: English world locale, canvas aria-label and spawn hint", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const entered = await enterWorld(page, "vi");
    test.skip(!entered, "NOT RUN: WebGL2 unavailable in this browser");
    test.info().annotations.push({ type: "window-focus", description: await ensureWindowFocus(page) });
    await expect(entered!).toHaveAttribute("data-world-paused", "false");
    await expect(entered!).toHaveAttribute("data-world-locale", "en");
    await expect(entered!.locator("canvas")).toHaveAttribute("aria-label", CANVAS_LABEL.en);
    // Spawn (0, 4) is within reach of the First Light signpost (world-content.spec.ts T07).
    await expect(entered!).toHaveAttribute("data-world-hint", "first-light");
    await expect(entered!.getByText(HINT.en, { exact: true })).toBeAttached();
    await expect(entered!.getByText(HINT.vi, { exact: true })).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("/en/ → menu Tiếng Việt: page changes, English world locale, canvas label and hint stay on the same canvas", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const entered = await enterWorld(page, "en");
    test.skip(!entered, "NOT RUN: WebGL2 unavailable in this browser");
    test.info().annotations.push({ type: "window-focus", description: await ensureWindowFocus(page) });
    await expect(entered!).toHaveAttribute("data-world-paused", "false");
    await expect(entered!).toHaveAttribute("data-world-locale", "en");
    const canvas = entered!.locator("canvas");
    await expect(canvas).toHaveAttribute("aria-label", CANVAS_LABEL.en);
    await expect(entered!).toHaveAttribute("data-world-hint", "first-light");
    await expect(entered!.getByText(HINT.en, { exact: true })).toBeAttached();
    await canvas.evaluate(element => void ((element as unknown as { __tqaTag: string }).__tqaTag = "L4-010"));

    await page.locator(MENU_TRIGGER).click();
    await expect(dialog(page)).toHaveAttribute("open", "");
    await dialog(page).getByRole("button", { name: "Tiếng Việt" }).click();
    await expect(page).toHaveURL(/\/vi\/$/);
    await expect(entered!).toHaveAttribute("data-world-locale", "en");
    await expect(canvas).toHaveAttribute("aria-label", CANVAS_LABEL.en);
    await expect(page.locator("canvas")).toHaveCount(1);
    expect(await canvas.evaluate(element => (element as unknown as { __tqaTag?: string }).__tqaTag), "canvas element was replaced (remount)").toBe("L4-010");

    await dialog(page).getByRole("button", { name: "× Close", exact: true }).click();
    await expect(dialog(page)).not.toHaveAttribute("open", "");
    await expect(entered!).toHaveAttribute("data-world-paused", "false");
    // Position unchanged → the same First Light hint reappears once resumed, still in English.
    await expect(entered!).toHaveAttribute("data-world-hint", "first-light");
    await expect(entered!.getByText(HINT.en, { exact: true })).toBeAttached();
    await expect(entered!.getByText(HINT.vi, { exact: true })).toHaveCount(0);
    await expect(entered!).toHaveAttribute("data-world-locale", "en");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
