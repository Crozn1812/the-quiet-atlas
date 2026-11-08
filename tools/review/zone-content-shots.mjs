// Lead-only: node tools/review/zone-content-shots.mjs <reviewDir> [baseUrl] [locale]
// Run against a fresh export in a browser-capable review environment.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const [reviewDir, baseUrl = "http://127.0.0.1:4402", locale = "vi"] = process.argv.slice(2);
if (!reviewDir || !["vi", "en"].includes(locale)) throw new Error("Usage: zone-content-shots.mjs <reviewDir> [baseUrl] [vi|en]");
const zones = ["first-light", "roots", "workshop", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"];
// Review-only camera contract: Lead installs tqa:postcard in the engine.
// Offsets are relative to the QA arrival point, in world metres. They are
// starting compositions; inspect all eight full-size renders before approval.
const views = [
  [3, 2.5, 9, 0, 0, -6], [10, 2.3, 6, 4, 1.1, 0],
  [3, 2, 9, 4, 1.2, -2], [-8, 2.8, 8, -3, 2.2, -3],
  [4, 2.5, 8, 0, 0, -12], [-6, 2, 7, 4, 0, -10],
  [6, 2, 6, -3, 0, -12], [-7, 2, 6, 2, 0, -9],
];
await mkdir(reviewDir, { recursive: true });
await mkdir("public/zones", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1067 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error));
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(new URL(`/${locale}/`, baseUrl).href);
  await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: "visible" });
  if (await world.getAttribute("data-world-postcard") !== "ready") {
    throw new Error("Missing review-only tqa:postcard camera hook; refusing gameplay-camera captures. See zone-content-shots.md.");
  }
  const canvas = world.locator("canvas");
  const manifest = [];
  for (const [index, zone] of zones.entries()) {
    if (process.env.TQA_ZONES && !process.env.TQA_ZONES.split(",").includes(zone)) continue;
    await world.evaluate((element, id) => element.__tqaJourney.goTo(id), zone);
    await canvas.focus();
    await page.keyboard.press("Escape");
    await page.locator('.world-menu dialog input[value="high"]').check();
    await page.keyboard.press("Escape");
    await canvas.focus();
    await world.evaluate((element, view) => {
      const origin = element.__tqaJourney.position();
      const [x, y, z, tx, ty, tz] = view;
      element.dispatchEvent(new CustomEvent("tqa:postcard", { detail: {
        position: [origin.x + x, origin.y + y, origin.z + z],
        target: [origin.x + tx, origin.y + ty, origin.z + tz],
      } }));
    }, views[index]);
    // Hide every DOM overlay inside the viewport, including interaction chips
    // nested beside the canvas. Screenshot the page region rather than canvas:
    // locator.screenshot may advance a frame with a cleared WebGL backbuffer.
    const clean = await page.addStyleTag({ content: `
      body *:not(canvas):not(:has(canvas)),
      .world-hud, [data-hud-keys] { visibility: hidden !important; }
    ` });
    await page.waitForTimeout(1500);
    if (await world.getAttribute("data-world-quality") !== "high") throw new Error(`${zone}: quality dropped below High`);
    if (errors.length) throw errors[0];
    const clip = await canvas.boundingBox();
    if (!clip) throw new Error(`${zone}: canvas has no visible bounds`);
    const pixels = await page.screenshot({ clip });
    await clean.evaluate(element => element.remove());
    let output;
    for (let quality = 82; quality >= 20; quality -= 2) {
      output = await sharp(pixels).resize(960, 640, { fit: "cover" }).webp({ quality }).toBuffer();
      if (output.length <= 60_000) break;
    }
    if (output.length > 60_000) throw new Error(`${zone}: exceeds 60 KB`);
    await writeFile(`public/zones/${zone}.webp`, output);
    manifest.push({ zone, bytes: output.length, width: 960, height: 640, quality: "high", view: views[index], source: baseUrl, visualApproval: "pending" });
    // Review the overlay at four representative locations, with image responses
    // served from the just-created files rather than the earlier static export.
    if (["first-light", "workshop", "old-trail", "quiet-shore"].includes(zone)) {
      await page.route(`**/zones/${zone}.webp`, route => route.fulfill({ path: path.resolve(`public/zones/${zone}.webp`), contentType: "image/webp" }));
      await world.evaluate((element, id) => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: id } })), zone);
      await page.locator("dialog.world-content img").evaluate(img => img.decode());
      await page.screenshot({ path: path.join(reviewDir, `overlay-${zone}.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      const dialog = page.locator("dialog.world-content");
      await page.waitForTimeout(250);
      if (await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1)) {
        throw new Error(`${zone}: mobile overlay overflows horizontally`);
      }
      await page.screenshot({ path: path.join(reviewDir, `overlay-${zone}-mobile.png`) });
      const audit = await new AxeBuilder({ page }).include("dialog.world-content")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const blocking = audit.violations.filter(item => ["critical", "serious"].includes(item.impact));
      if (blocking.length) throw new Error(`${zone}: overlay a11y ${JSON.stringify(blocking)}`);
      await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await page.screenshot({ path: path.join(reviewDir, `overlay-${zone}-mobile-end.png`) });
      await dialog.getByRole("button", { name: /× (Đóng|Close)/ }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.setViewportSize({ width: 1600, height: 1067 });
    }
  }
  await writeFile(path.join(reviewDir, "zone-renders.json"), JSON.stringify(manifest, null, 2));
  let licenses = await readFile("assets/LICENSES.csv", "utf8");
  for (const zone of zones) {
    const prefix = `public/zones/${zone}.webp,`;
    licenses = licenses.split("\n").map(line => line.startsWith(prefix)
      ? `${prefix}The Quiet Atlas (project-original),Project-owned,yes,yes,yes,none,"In-engine capture of current build via tools/review/zone-content-shots.mjs; Edge High; ${new Date().toISOString()}; no third-party pixels",960x640,-,-,-`
      : line).join("\n");
  }
  await writeFile("assets/LICENSES.csv", licenses);
  console.log(manifest);
} finally {
  await browser.close();
}
