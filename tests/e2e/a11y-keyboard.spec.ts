// L3-005 — T11 (spec §9, §13) parts that can be automated on the HTML pages:
//   1. Keyboard: Tab / Shift+Tab reach every interactive element in DOM order, no focus trap; Enter follows links.
//   2. Focus visible (WCAG 2.4.7): every focused element shows an outline/box-shadow it does not have unfocused.
//   3. Headings: exactly one h1, no skipped level going down (e.g. h2 → h4).
//   4. Zoom / reflow (WCAG 1.4.10, 1.4.4): 320 CSS px (= 1280 px at 400 %) and 640 CSS px (≈ 200 %) wide:
//      no horizontal scrollbar; name, CV and contact stay visible on Welcome/Quick.
//   5. Reduced motion (spec §9): with prefers-reduced-motion: reduce, no running animation/transition > 0 s
//      on visible elements.
//   6. Skip link (spec §13 T11 "Skip"): the first Tab stop is a link to the main content.
// Not covered here (needs a person): screen reader (NVDA/Narrator/VoiceOver), real browser zoom UI, contrast of
// the focus ring against every background, the world canvas. Results → docs/evidence/A1/a11y-keyboard-2026-11-04.md.
import { expect, test, type Page } from "@playwright/test";
import { htmlPagesToAudit, settle } from "./helpers";

/** Pages named by ticket L3-005 for the keyboard checks (one case study is enough: same renderer). */
const KEYBOARD_PAGES = ["/en/", "/vi/", "/en/quick/", "/en/projects/cms-devops-platform-aws-eks/", "/en/privacy/", "/404.html"];
/** Every HTML page in out/ (headings, reflow, reduced motion). */
const ALL_PAGES = [...htmlPagesToAudit(), "/404.html"];

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

async function open(page: Page, route: string) {
  const response = await page.goto(route);
  expect(response?.status(), `${route} status`).toBe(200);
  await settle(page);
  // Welcome: wait until the capability check has decided (Enter World enabled, or the Editorial fallback shown),
  // so the set of focusable elements no longer changes during the traversal.
  await page.waitForFunction(() => {
    const mode = document.querySelector("[data-app-mode]");
    if (!mode) return true;
    const enter = mode.querySelector("nav button");
    return mode.getAttribute("data-app-mode") === "editorial" || (enter instanceof HTMLButtonElement && !enter.disabled);
  });
}

/** Marks every element that should be in the sequential focus order with data-kb=<DOM index>; returns descriptions. */
async function markTabStops(page: Page) {
  return page.evaluate(selector => {
    const describe = (el: Element) => {
      const name = (el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const href = el.getAttribute("href");
      return `${el.tagName.toLowerCase()}${href ? `[href="${href}"]` : ""} "${name}"`;
    };
    const stops = [...document.querySelectorAll(selector)].filter(el => {
      const html = el as HTMLElement;
      if (html.tabIndex < 0) return false;
      if (html.closest("[hidden], [inert]")) return false;
      return html.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions);
    });
    const positive = stops.filter(el => (el as HTMLElement).tabIndex > 0).map(describe);
    stops.forEach((el, i) => el.setAttribute("data-kb", String(i)));
    return { stops: stops.map(describe), positive };
  }, FOCUSABLE);
}

const activeIndex = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const kb = el.getAttribute("data-kb");
    return kb === null ? `unexpected:${el.tagName.toLowerCase()}` : Number(kb);
  });

type FocusStyle = { outline: string; outlineWidth: number; outlineStyle: string; outlineColor: string; boxShadow: string };

const focusStyleOf = (page: Page, index: number) =>
  page.evaluate(i => {
    const el = document.querySelector(`[data-kb="${i}"]`)!;
    const s = getComputedStyle(el);
    return {
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}`,
      outlineWidth: parseFloat(s.outlineWidth) || 0,
      outlineStyle: s.outlineStyle,
      outlineColor: s.outlineColor,
      boxShadow: s.boxShadow,
    } satisfies FocusStyle;
  }, index);

/**
 * Presses `key` until focus leaves the page or comes back to an element already visited.
 * Returns the visited data-kb indices in order (null = focus left the document content).
 */
async function traverse(page: Page, key: "Tab" | "Shift+Tab", max: number, onStop?: (index: number) => Promise<void>) {
  const order: (number | string)[] = [];
  for (let i = 0; i < max + 2; i++) {
    await page.keyboard.press(key);
    const index = await activeIndex(page);
    if (index === null) break;
    if (order.includes(index)) break; // wrapped around
    order.push(index);
    if (typeof index === "number" && onStop) await onStop(index);
  }
  return order;
}

for (const route of KEYBOARD_PAGES) {
  test(`T11 keyboard ${route}: Tab and Shift+Tab reach every interactive element in DOM order, no trap`, async ({ page }) => {
    await open(page, route);
    const { stops, positive } = await markTabStops(page);
    expect(stops.length, `${route} has interactive elements`).toBeGreaterThan(0);
    test.info().annotations.push({ type: "tab-stops", description: `${stops.length}: ${stops.join(" | ")}` });
    expect(positive, "no positive tabindex (it breaks the logical order)").toEqual([]);

    const forward = await traverse(page, "Tab", stops.length);
    const expected = stops.map((_, i) => i);
    expect(forward, `Tab order on ${route}; stops: ${stops.join(" | ")}`).toEqual(expected);
    // Focus is not trapped: after the last element, Tab leaves the page content (to the browser) or wraps to the first.
    const after = await activeIndex(page);
    expect(after === null || after === 0, `Tab after the last element leaves the page or wraps (got ${after})`).toBe(true);

    // Reverse: from the last element Shift+Tab walks back to the first.
    await page.locator(`[data-kb="${stops.length - 1}"]`).focus();
    const backward = await traverse(page, "Shift+Tab", stops.length);
    expect([stops.length - 1, ...backward], `Shift+Tab order on ${route}`).toEqual([...expected].reverse());
  });
}

/** Tabs from the top of the page until the focused element matches `selector`, then presses Enter. */
async function tabToAndEnter(page: Page, selector: string) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate(el => el === document.activeElement)) {
      await page.keyboard.press("Enter");
      return;
    }
  }
  throw new Error(`${selector} never received focus with Tab`);
}

const ENTER_CASES = [
  { from: "/en/", selector: "a[href='/en/quick/']:text-is('Quick Portfolio')", to: /\/en\/quick\/$/ },
  { from: "/vi/", selector: "a[href='/vi/quick/']:text-is('Quick Portfolio')", to: /\/vi\/quick\/$/ },
  { from: "/en/quick/", selector: "main article h3 a[href^='/en/projects/']", to: /\/en\/projects\/[^/]+\/$/ },
  { from: "/en/projects/cms-devops-platform-aws-eks/", selector: "a[href='/en/quick/']", to: /\/en\/quick\/$/ },
  { from: "/en/privacy/", selector: "a[href='/en/quick/']", to: /\/en\/quick\/$/ },
  { from: "/404.html", selector: "a[href='/en/']", to: /\/en\/$/ },
];

for (const { from, selector, to } of ENTER_CASES) {
  test(`T11 keyboard ${from}: Enter on ${selector} navigates to ${to}`, async ({ page }) => {
    await open(page, from);
    await tabToAndEnter(page, selector);
    await expect(page).toHaveURL(to);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

for (const route of KEYBOARD_PAGES) {
  test(`T11 focus visible ${route}: every Tab stop gets an outline/box-shadow (WCAG 2.4.7)`, async ({ page }) => {
    await open(page, route);
    const { stops } = await markTabStops(page);
    const unfocused = new Map<number, FocusStyle>();
    for (let i = 0; i < stops.length; i++) unfocused.set(i, await focusStyleOf(page, i));

    const invisible: string[] = [];
    const checked: string[] = [];
    await traverse(page, "Tab", stops.length, async index => {
      const before = unfocused.get(index)!;
      const now = await focusStyleOf(page, index);
      const outline = now.outlineStyle !== "none" && now.outlineWidth > 0 && !/rgba\(.*,\s*0\)$/.test(now.outlineColor);
      const outlineChanged = outline && now.outline !== before.outline;
      const shadowChanged = now.boxShadow !== "none" && now.boxShadow !== before.boxShadow;
      if (!outlineChanged && !shadowChanged) invisible.push(`${stops[index]} — focused: ${now.outline}, shadow ${now.boxShadow}`);
      checked.push(`${index}: ${before.outlineStyle} → ${now.outline}`);
    });
    test.info().annotations.push({ type: "focus-styles", description: checked.join(" | ") });
    expect(checked, "every Tab stop was focused and measured").toHaveLength(stops.length);
    expect(invisible, `elements without a visible focus indicator on ${route}`).toEqual([]);
  });
}

for (const route of ALL_PAGES) {
  test(`T11 headings ${route}: exactly one h1, no skipped levels`, async ({ page }) => {
    await open(page, route);
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']")]
        .filter(el => !el.closest("[hidden]") && (el as HTMLElement).checkVisibility())
        .map(el => ({
          level: Number(el.getAttribute("aria-level") ?? el.tagName.slice(1)),
          text: (el.textContent ?? "").trim().slice(0, 40),
        })),
    );
    expect(headings.filter(h => h.level === 1).map(h => h.text), `one h1 on ${route}`).toHaveLength(1);
    expect(headings[0]?.level, `first heading on ${route} is the h1`).toBe(1);
    const skips: string[] = [];
    headings.forEach((h, i) => {
      const prev = headings[i - 1];
      if (prev && h.level > prev.level + 1) skips.push(`h${prev.level} "${prev.text}" → h${h.level} "${h.text}"`);
    });
    test.info().annotations.push({ type: "headings", description: headings.map(h => `h${h.level}`).join(" ") });
    expect(skips, `heading level skips on ${route}`).toEqual([]);
  });
}

const PROFILE_PAGES = new Set(["/en/", "/vi/", "/en/quick/", "/vi/quick/"]);

for (const width of [320, 640]) {
  for (const route of ALL_PAGES) {
    test(`T11 reflow ${width}px ${route}: no horizontal scroll${PROFILE_PAGES.has(route) ? ", name/CV/contact visible" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      await open(page, route);
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const vw = root.clientWidth;
        const wide = [...document.body.querySelectorAll("*")]
          .filter(el => (el as HTMLElement).checkVisibility?.() !== false)
          .filter(el => el.getBoundingClientRect().right > vw + 1)
          .map(el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} right=${Math.round(el.getBoundingClientRect().right)}`)
          .slice(0, 10);
        return { scrollWidth: root.scrollWidth, clientWidth: vw, bodyScrollWidth: document.body.scrollWidth, wide };
      });
      test.info().annotations.push({ type: "reflow", description: `scrollWidth ${overflow.scrollWidth} / clientWidth ${overflow.clientWidth}` });
      expect(
        overflow.scrollWidth,
        `${route} at ${width}px: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}; overflowing: ${overflow.wide.join(", ")}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(h1 && h1.x >= 0 && h1.x + h1.width <= width + 1, `h1 inside the viewport on ${route}`).toBe(true);
      if (PROFILE_PAGES.has(route)) {
        await expect(page.getByRole("heading", { name: "CV", level: 2 })).toBeVisible();
        const mail = page.locator("main a[href^='mailto:']");
        await mail.scrollIntoViewIfNeeded();
        await expect(mail).toBeVisible();
        const box = await mail.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width + 1, `contact e-mail inside the viewport on ${route}`).toBe(true);
      }
    });
  }
}

for (const route of ALL_PAGES) {
  test(`T11 reduced motion ${route}: no animation/transition on visible elements`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, route);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    // Focus each element once so focus-triggered transitions would also be caught.
    const moving = await page.evaluate(() => {
      const seconds = (list: string) => Math.max(...list.split(",").map(v => (v.trim().endsWith("ms") ? parseFloat(v) / 1000 : parseFloat(v)) || 0));
      const found: string[] = [];
      for (const el of [document.documentElement, ...document.body.querySelectorAll("*")]) {
        if (!(el as HTMLElement).checkVisibility?.()) continue;
        const s = getComputedStyle(el);
        const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`;
        if (s.animationName !== "none" && seconds(s.animationDuration) > 0) found.push(`${label} animation ${s.animationName} ${s.animationDuration}`);
        if (s.transitionProperty !== "none" && seconds(s.transitionDuration) > 0) found.push(`${label} transition ${s.transitionProperty} ${s.transitionDuration}`);
      }
      if (getComputedStyle(document.documentElement).scrollBehavior === "smooth") found.push("html scroll-behavior: smooth");
      for (const a of document.getAnimations()) found.push(`running ${a.constructor.name} ${(a as CSSAnimation).animationName ?? ""}`);
      return found;
    });
    expect(moving, `motion with prefers-reduced-motion: reduce on ${route}`).toEqual([]);
  });
}

// Spec §13 T11 lists "Skip": a skip link as the first Tab stop, pointing at the main content (added in L1-006).
for (const route of ["/en/", "/en/quick/", "/en/projects/cms-devops-platform-aws-eks/"]) {
  test(`T11 skip link ${route}: first Tab stop skips to the main content`, async ({ page }) => {
    await open(page, route);
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => {
      const el = document.activeElement;
      const href = el?.getAttribute("href") ?? "";
      const target = href.startsWith("#") && href.length > 1 ? document.getElementById(href.slice(1)) : null;
      return { href, targetIsMain: Boolean(target && (target.tagName === "MAIN" || target.closest("main") === target || target.querySelector("h1"))) };
    });
    expect(first.href, "first Tab stop is an in-page link").toMatch(/^#./);
    expect(first.targetIsMain, "it targets the main content").toBe(true);
  });
}
