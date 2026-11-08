// Final UI review against a locally served static export; no asset regeneration.
// node tools/review/ux-audit.mjs <outputDir> [http://127.0.0.1:4410]
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const [outputDir, base = "http://127.0.0.1:4410"] = process.argv.slice(2);
if (!outputDir || !["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Use an output directory and local export URL");
await mkdir(outputDir, { recursive: true });
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const results = [];
const errors = [];
const browser = await chromium.launch({ channel: "msedge" });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { window.__tqaSkipIntro = true; window.__tqaJourney = true; });
  await page.goto(`${base}/vi/`);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ timeout: 120000 });
  const canvas = world.locator("canvas");

  async function capture(name, dialog) {
    await dialog.waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    const axe = await new AxeBuilder({ page }).analyze();
    const violations = axe.violations.filter(v => ["critical", "serious"].includes(v.impact));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const bounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    const clipped = bounds.x < -1 || bounds.y < -1 || bounds.x + bounds.width > viewport.width + 1 || bounds.y + bounds.height > viewport.height + 1;
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("Tab");
      if (!(await dialog.evaluate(el => el.contains(document.activeElement)))) throw new Error(`${name}: keyboard focus escaped dialog`);
    }
    await dialog.evaluate(el => { el.querySelector("h2")?.focus(); el.scrollTop = 0; });
    const file = `${name}.webp`;
    const png = await page.screenshot();
    await sharp(png).webp({ quality: 82 }).toFile(path.join(outputDir, file));
    results.push({ name, viewport, violations: violations.map(v => ({ id: v.id, nodes: v.nodes })), overflow, clipped, focusTrap: "PASS", file });
    if (violations.length || overflow || clipped) throw new Error(`${name}: accessibility/reflow audit failed`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }

  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await canvas.focus();
    await page.keyboard.press("Escape");
    await capture(`menu-${width}`, page.locator(".world-menu dialog"));
    await canvas.focus();
    await page.keyboard.press("j");
    await capture(`journal-${width}`, page.getByRole("dialog", { name: "Sổ Atlas" }));
    await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from: "first-light" } })));
    await capture(`teleport-${width}`, page.getByRole("dialog", { name: "Đi tới…" }));
  }
  for (const locale of ["vi", "en"]) for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/${locale}/quick/`);
    await page.evaluate(() => document.fonts.ready);
    const axe = await new AxeBuilder({ page }).analyze();
    const violations = axe.violations.filter(v => ["critical", "serious"].includes(v.impact));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const name = `quick-${locale}-${width}`;
    const file = `${name}.webp`;
    await sharp(await page.screenshot()).webp({ quality: 82 }).toFile(path.join(outputDir, file));
    results.push({ name, viewport: page.viewportSize(), violations: violations.map(v => v.id), overflow, file });
    if (violations.length || overflow) throw new Error(`${name}: accessibility/reflow audit failed`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await writeFile(path.join(outputDir, "ux-audit.json"), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
const panels = [];
for (const result of results.filter(r => !r.name.startsWith("quick") || r.name === "quick-vi-390" || r.name === "quick-vi-1366")) {
  panels.push(await sharp(path.join(outputDir, result.file)).resize(550, 400, { fit: "contain", background: "#EEE8D8" }).toBuffer());
}
const height = Math.ceil(panels.length / 2) * 400;
await sharp({ create: { width: 1100, height, channels: 3, background: "#EEE8D8" } }).composite(panels.map((input, index) => ({ input, left: index % 2 * 550, top: Math.floor(index / 2) * 400 }))).webp({ quality: 85 }).toFile(path.join(outputDir, "ui-contact.webp"));
console.log(`PASS: ${results.length} UI accessibility/reflow audits; no critical/serious violations, overflow or page errors`);
