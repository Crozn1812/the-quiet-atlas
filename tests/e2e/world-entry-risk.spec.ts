// L4-011 — e2e for the L1-011 risks (src/components/portfolio/WorldEntry.tsx, capabilities.ts):
//   (a) Enter World fails → Retry → fails again → focus lands on Enter World (focus moved into an effect).
//   (b) language switched inside the world, then Exit world from the MENU → full navigation to /vi/ (the HUD path is
//       covered in world-input.spec.ts "exit after switching en → vi").
//   (c) viewport < 1024 at load (no WebGL probe) → resize ≥ 1024 → the probe runs on resize, Enter World is enabled;
//       the probe result is cached (a further resize does not probe again).
//   (d) coarse pointer → Editorial, no WebGL context created on load.
// WebGL contexts are counted by an init script around HTMLCanvasElement.prototype.getContext (as in world-input.spec.ts).
import { expect, test, type Browser, type Page } from "./test";
import { enterWorld, ensureWindowFocus, LOCALES, MENU_TRIGGER, trackConsoleErrors } from "./helpers";

test.describe.configure({ timeout: 90_000 });

/**
 * Counts getContext calls per WebGL type (every call, including the capability probe on a throwaway canvas).
 * `window.__tqaFailWebgl = true` makes webgl/webgl2 return null from then on (simulated GPU loss after load).
 */
const COUNT_WEBGL = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  const w = window as unknown as { __tqaGetContext: Record<string, number>; __tqaFailWebgl: boolean };
  w.__tqaGetContext = {};
  w.__tqaFailWebgl = false;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (/webgl/i.test(type)) {
      w.__tqaGetContext[type] = (w.__tqaGetContext[type] ?? 0) + 1;
      if (w.__tqaFailWebgl) return null;
    }
    return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
};
const contexts = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __tqaGetContext: Record<string, number> }).__tqaGetContext }));
const webglCalls = async (page: Page) => Object.values(await contexts(page)).reduce((sum, n) => sum + n, 0);

/** WebGL2 availability checked on a separate page, so the page under test keeps an untouched counter. */
async function browserHasWebGL2(browser: Browser) {
  const probe = await browser.newPage();
  try {
    await probe.goto("about:blank");
    return await probe.evaluate(() => {
      try {
        return document.createElement("canvas").getContext("webgl2") !== null;
      } catch {
        return false;
      }
    });
  } finally {
    await probe.close();
  }
}

test.describe("desktop (fine pointer)", () => {
  test.use({ viewport: { width: 1366, height: 800 } });

  test("(a) Enter World fails → Retry → fails again: focus on Enter World, Retry gone, Enter World aria-disabled, 0 errors", async ({ page, browser }) => {
    test.skip(!(await browserHasWebGL2(browser)), "NOT RUN: WebGL2 unavailable in this browser");
    // Regression guard (L4-011 bug, fixed by Lead): a synchronous second failure batches "loading" → "recoverableError";
    // the focus effect now also depends on a failure counter, so focus returns to Enter World.
    const errors = trackConsoleErrors(page);
    await page.addInitScript(COUNT_WEBGL);
    await page.goto("/en/");
    const enter = page.getByRole("button", { name: "Enter World" });
    await expect(enter).toBeEnabled();
    await expect(page.locator("[data-app-mode]")).toHaveAttribute("data-app-mode", "welcome");

    // GPU lost after the load-time probe: onEnterWorld re-reads capabilities and fails (recoverableError).
    await page.evaluate(() => void ((window as unknown as { __tqaFailWebgl: boolean }).__tqaFailWebgl = true));
    await enter.click();
    const mode = page.locator("[data-app-mode]");
    await expect(mode).toHaveAttribute("data-app-mode", "recoverableError");
    await expect(page.locator("#world-reason")).toHaveText("The world could not load. Retry once or open Quick Portfolio.");
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await expect(enter).toBeFocused();
    await expect(enter).toHaveAttribute("aria-disabled", "false");

    await retry.click();
    await expect(mode).toHaveAttribute("data-app-mode", "recoverableError");
    await expect(retry).toHaveCount(0);
    await expect(enter).toBeVisible();
    await expect(enter).toHaveAttribute("aria-disabled", "true");
    test.info().annotations.push({
      type: "activeElement after 2nd failure",
      description: await page.evaluate(() => `${document.activeElement?.tagName ?? "null"} ${document.activeElement?.textContent?.trim().slice(0, 40) ?? ""}`),
    });
    await expect(enter).toBeFocused();
    await expect(page.locator("#world-reason")).toHaveText("The world could not load. Retry once or open Quick Portfolio.");
    // No third attempt: Enter World is inert after the retry failed.
    const callsBefore = await webglCalls(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await expect(mode).toHaveAttribute("data-app-mode", "recoverableError");
    expect(await webglCalls(page), "a third attempt probed WebGL again").toBe(callsBefore);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("(a2) world chunk fails to load (network) → Retry → fails again: focus on Enter World, Retry gone, 0 page errors", async ({ page, browser }) => {
    test.skip(!(await browserHasWebGL2(browser)), "NOT RUN: WebGL2 unavailable in this browser");
    await page.goto("/en/");
    const enter = page.getByRole("button", { name: "Enter World" });
    await expect(enter).toBeEnabled();
    // Every JS chunk requested after the Welcome has loaded (the lazy world/menu chunks) fails at the network level.
    const aborted: string[] = [];
    await page.route(/\/_next\/static\/.*\.js(\?|$)/, route => {
      aborted.push(route.request().url());
      return route.abort("internetdisconnected");
    });
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const mode = page.locator("[data-app-mode]");

    await enter.click();
    await expect(mode).toHaveAttribute("data-app-mode", "recoverableError", { timeout: 30_000 });
    expect(aborted.length, "no lazy chunk was requested (failure not exercised)").toBeGreaterThan(0);
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await expect(enter).toBeFocused();

    await retry.click();
    await expect(retry).toHaveCount(0, { timeout: 30_000 });
    await expect(mode).toHaveAttribute("data-app-mode", "recoverableError", { timeout: 30_000 });
    await expect(enter).toBeFocused();
    await expect(enter).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("canvas")).toHaveCount(0);
    test.info().annotations.push({ type: "aborted chunks", description: [...new Set(aborted)].map(u => new URL(u).pathname).join(", ") });
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("(b) en → menu Tiếng Việt → menu “Thoát world”: full navigation to the /vi/ Welcome, no world", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const world = await enterWorld(page, "en");
    test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
    test.info().annotations.push({ type: "window-focus", description: await ensureWindowFocus(page) });
    const vi = LOCALES[1];
    const dialog = page.locator(".world-menu dialog");
    await page.locator(MENU_TRIGGER).click();
    await expect(dialog).toHaveAttribute("open", "");
    await dialog.locator("fieldset").getByRole("button", { name: "Tiếng Việt" }).click();
    await expect(page).toHaveURL(/\/vi\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");

    await page.evaluate(() => void ((window as unknown as { __tqaSameDocument: boolean }).__tqaSameDocument = true));
    await dialog.getByRole("button", { name: vi.leave, exact: true }).click();
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

test.describe("narrow viewport at load", () => {
  test.use({ viewport: { width: 800, height: 800 } });

  test("(c) width 800 at load: Editorial, no WebGL probe; resize to 1280 → probe runs, Enter World enabled and enters; result cached", async ({ page, browser }) => {
    test.skip(!(await browserHasWebGL2(browser)), "NOT RUN: WebGL2 unavailable in this browser");
    const errors = trackConsoleErrors(page);
    await page.addInitScript(COUNT_WEBGL);
    await page.goto("/en/");
    const mode = page.locator("[data-app-mode]");
    const enter = page.getByRole("button", { name: "Enter World" });
    await expect(mode).toHaveAttribute("data-app-mode", "editorial");
    await expect(page.getByRole("link", { name: LOCALES[0].editorial })).toBeVisible();
    await expect(enter).toBeHidden();
    await page.waitForTimeout(500);
    expect(await contexts(page), "WebGL probed below 1024 px").toEqual({});

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(mode).toHaveAttribute("data-app-mode", "welcome");
    await expect(enter).toBeVisible();
    await expect(enter).toBeEnabled();
    expect(await contexts(page), "probe on resize").toEqual({ webgl2: 1 });

    // Cached: further resizes above 1024 px do not probe again.
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.waitForTimeout(300);
    expect(await contexts(page), "probe re-ran although the result is cached").toEqual({ webgl2: 1 });

    // The re-enabled button really enters the world.
    await enter.click();
    await expect(page.locator("[data-app-mode='world']")).toHaveCount(1, { timeout: 45_000 });
    await expect(page.locator("[data-world-chunk] canvas")).toHaveCount(1);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("coarse pointer (touch device, 1366×1024)", () => {
  test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true });

  test("(d) coarse pointer: Editorial with the pointer reason, no WebGL context created on load", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.addInitScript(COUNT_WEBGL);
    await page.goto("/en/");
    const pointer = await page.evaluate(() => ({ fine: matchMedia("(pointer: fine)").matches, coarse: matchMedia("(pointer: coarse)").matches, width: innerWidth }));
    test.info().annotations.push({ type: "emulation", description: JSON.stringify(pointer) });
    expect(pointer.fine, "emulation did not produce a coarse pointer").toBe(false);
    expect(pointer.width).toBeGreaterThanOrEqual(1024);

    await expect(page.locator("[data-app-mode]")).toHaveAttribute("data-app-mode", "editorial");
    await expect(page.getByRole("link", { name: LOCALES[0].editorial })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter World" })).toBeHidden();
    await expect(page.locator("#world-reason")).not.toHaveText("");
    await page.waitForTimeout(800);
    expect(await contexts(page), "WebGL context created on a coarse-pointer device").toEqual({});
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
