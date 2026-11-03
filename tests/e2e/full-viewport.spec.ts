// L3-008 — full-viewport Welcome + bottom-left HUD (ADR 0009; spec §2, §3.1, §9, §13 T01/T11).
//   1. Welcome at 1366×800: no vertical scrollbar, the corner card is inside the viewport, in the bottom-left half.
//   2. After Enter World: the canvas covers the viewport exactly; the HUD has 6 controls with accessible names, each ≥ 24×24.
//   3. Exit world (HUD button): no canvas, the full card is back, focus on Enter World.
//   4. axe on Welcome and inside the world: 0 violations (critical/serious; KNOWN_ISSUES.axeRules stays empty).
// World checks need WebGL2 (SwiftShader in headless Edge); skipped as NOT RUN without it.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { enterWorld, HUD, KNOWN_ISSUES, LOCALES, settle, trackConsoleErrors } from "./helpers";

const VIEWPORT = { width: 1366, height: 800 };
test.use({ viewport: VIEWPORT });
// Enter World with software WebGL takes ~15–20 s under parallel load (see world-menu.spec.ts).
test.describe.configure({ timeout: 90_000 });

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** HUD controls in world mode (ADR 0009 §3), by accessible name. */
const hudControls = (leave: string) => [
  { role: "link", name: "Quick Portfolio" },
  { role: "link", name: "CV" },
  { role: "link", name: "Email" },
  { role: "button", name: "Sound" },
  { role: "button", name: "Menu" },
  { role: "button", name: leave },
] as const;

/** Waits until the capability check has decided (Enter World enabled). */
async function openWelcome(page: Page, locale: string) {
  const response = await page.goto(`/${locale}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Enter World" })).toBeEnabled();
}

async function axe(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations.filter(v => v.impact === "critical" || v.impact === "serious");
  const other = results.violations.filter(v => !blocking.includes(v));
  const describe = (v: (typeof results.violations)[number]) =>
    `${where} ${v.impact} ${v.id}: ${v.help} → ${v.nodes.map(n => n.target.join(" ")).join(", ")}`;
  test.info().annotations.push({
    type: `axe ${where}`,
    description: `${results.passes.length} rules passed; violations: ${results.violations.map(v => `${v.id} (${v.impact})`).join(", ") || "none"}`,
  });
  expect(KNOWN_ISSUES.axeRules, "L3-008 keeps KNOWN_ISSUES.axeRules empty").toEqual({});
  expect(blocking.map(describe), `critical/serious axe violations ${where}`).toEqual([]);
  // Moderate/minor findings are not part of T11's gate but must also be 0 per ticket L3-008 check 4.
  expect(other.map(describe), `moderate/minor axe violations ${where}`).toEqual([]);
}

for (const { locale } of LOCALES) {
  test(`L3-008 #1 /${locale}/ 1366×800: one screen (no vertical scroll), corner card inside the viewport, bottom-left half`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openWelcome(page, locale);
    await settle(page);

    const layout = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      return {
        innerWidth,
        innerHeight,
        docScrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        overflowY: getComputedStyle(document.documentElement).overflowY,
        hasVerticalScrollbar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        panel: box(".corner-panel"),
        card: box("#content"),
        hud: box(".world-hud"),
      };
    });
    test.info().annotations.push({ type: "layout", description: JSON.stringify(layout) });

    expect(layout.docScrollHeight, "document scrollHeight ≤ innerHeight").toBeLessThanOrEqual(layout.innerHeight);
    expect(layout.bodyScrollHeight, "body scrollHeight ≤ innerHeight").toBeLessThanOrEqual(layout.innerHeight);
    expect(layout.hasVerticalScrollbar, "no vertical scrollbar").toBe(false);

    const { panel, innerWidth: vw, innerHeight: vh } = layout;
    // Inside the viewport.
    expect(panel.left, "card left ≥ 0").toBeGreaterThanOrEqual(0);
    expect(panel.top, "card top ≥ 0").toBeGreaterThanOrEqual(0);
    expect(panel.right, "card right ≤ viewport width").toBeLessThanOrEqual(vw);
    expect(panel.bottom, "card bottom ≤ viewport height").toBeLessThanOrEqual(vh);
    // Bottom-left half: entirely in the left half, anchored to the bottom-left corner, centre below the middle.
    expect(panel.right, "card is in the left half").toBeLessThanOrEqual(vw / 2);
    expect(panel.left, "card is near the left edge").toBeLessThanOrEqual(48);
    expect(vh - panel.bottom, "card is near the bottom edge").toBeLessThanOrEqual(48);
    expect((panel.top + panel.bottom) / 2, "card centre is in the lower half").toBeGreaterThan(vh / 2);
    // Everything the 30-second rule needs is visible without scrolling (ADR 0009 §1).
    for (const locator of [
      page.getByRole("heading", { level: 1 }),
      page.getByRole("button", { name: "Enter World" }),
      page.locator(`${HUD} a[href='/${locale}/quick/']`),
      page.locator(`${HUD} a[href='/cv/']`),
      page.locator(`${HUD} a[href^='mailto:']`),
      page.locator(HUD).getByRole("button", { name: "Sound" }),
    ]) {
      await expect(locator).toBeInViewport({ ratio: 1 });
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("L3-008 #2 Enter World: canvas = viewport (0, 0, 1366×800); HUD has 6 named controls, each ≥ 24×24", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  const leave = LOCALES[0].leave;

  const canvas = world!.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const box = await canvas.boundingBox();
  test.info().annotations.push({ type: "canvas-box", description: `${JSON.stringify(box)} / viewport ${JSON.stringify(viewport)}` });
  expect(box, "canvas has a box").not.toBeNull();
  expect(box!.x).toBeCloseTo(0, 0);
  expect(box!.y).toBeCloseTo(0, 0);
  expect(Math.abs(box!.width - viewport.width), `canvas width ${box!.width} = viewport ${viewport.width}`).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.height - viewport.height), `canvas height ${box!.height} = viewport ${viewport.height}`).toBeLessThanOrEqual(1);
  // The world container itself is fixed to the viewport (ADR 0009: position: fixed; inset: 0).
  const container = await page.locator(".world-entry").evaluate(el => {
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top, right: s.right, bottom: s.bottom, left: s.left };
  });
  expect(container).toEqual({ position: "fixed", top: "0px", right: "0px", bottom: "0px", left: "0px" });

  // Name/role are not shown permanently in the world (ADR 0009 §3).
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();

  const hud = page.locator(HUD);
  await expect(hud).toHaveAttribute("data-compact", "true");
  const visible = await hud.locator("a, button").evaluateAll(els => els.filter(el => (el as HTMLElement).checkVisibility()).length);
  expect(visible, "HUD shows exactly 6 controls").toBe(6);
  const sizes: string[] = [];
  for (const { role, name } of hudControls(leave)) {
    const control = hud.getByRole(role, { name, exact: true });
    await expect(control, `HUD ${role} "${name}"`).toBeVisible();
    await expect(control).toBeInViewport({ ratio: 1 });
    const b = (await control.boundingBox())!;
    sizes.push(`${name} ${b.width}×${b.height}`);
    expect(b.width, `${name} width ≥ 24`).toBeGreaterThanOrEqual(24);
    expect(b.height, `${name} height ≥ 24`).toBeGreaterThanOrEqual(24);
  }
  test.info().annotations.push({ type: "hud-targets", description: sizes.join(" | ") });
  // HUD sits in the bottom-left half too.
  const hudBox = (await hud.boundingBox())!;
  expect(hudBox.x + hudBox.width).toBeLessThanOrEqual(viewport.width / 2);
  expect(hudBox.y).toBeGreaterThan(viewport.height / 2);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("L3-008 #3 Exit world (HUD): no canvas, the full card is back, focus on Enter World", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  const { leave, name, role } = LOCALES[0];

  await page.locator(HUD).getByRole("button", { name: leave, exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
  await expect(page.locator("[data-app-mode='welcome']")).toHaveCount(1);
  const enter = page.getByRole("button", { name: "Enter World" });
  await expect(enter).toBeFocused();

  // Full card again: name, role, intro, Enter World, Quick Portfolio, CV, e-mail address, Sound.
  await expect(page.locator("#content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.locator("#content").getByText(role, { exact: false })).toBeVisible();
  await expect(enter).toBeEnabled();
  const hud = page.locator(HUD);
  await expect(hud).toHaveAttribute("data-compact", "false");
  await expect(hud.getByRole("link", { name: "Quick Portfolio", exact: true })).toBeVisible();
  await expect(hud.getByRole("link", { name: "CV", exact: true })).toBeVisible();
  await expect(hud.locator("a[href^='mailto:']")).toHaveText(/@/);
  await expect(hud.getByRole("button", { name: "Sound" })).toBeVisible();
  await expect(hud.getByRole("button", { name: "Menu" })).toBeHidden();
  await expect(hud.getByRole("button", { name: leave })).toBeHidden();
  await expect(page.locator(".corner-panel")).toBeInViewport({ ratio: 1 });
  expect(errors, errors.join("\n")).toEqual([]);
});

for (const { locale } of LOCALES) {
  test(`L3-008 #4 axe /${locale}/ Welcome 1366×800: 0 violations`, async ({ page }) => {
    await openWelcome(page, locale);
    await settle(page);
    await axe(page, `/${locale}/ Welcome`);
  });
}

test("L3-008 #4 axe inside the world (/en/, HUD compact, menu closed): 0 violations", async ({ page }) => {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  await expect(page.locator(HUD)).toHaveAttribute("data-compact", "true");
  await axe(page, "/en/ world");
});
