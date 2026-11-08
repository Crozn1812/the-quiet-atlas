// Lead review: Welcome, zone overlays, journal, menu, Quick (vi). Usage: node tools/review/ux-shots.mjs <outDir>
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const out = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__tqaSkipIntro = true; window.__tqaJourney = true; });
await page.goto("http://127.0.0.1:4180/vi/");
await page.screenshot({ path: `${out}/ux-welcome.png` });
await page.getByRole("button", { name: /Vào thế giới|Enter World/ }).click();
const world = page.locator("[data-world-build]");
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 120000 });
await world.locator("canvas").focus();
await page.keyboard.press("e"); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/ux-overlay-first-light.png` });
await page.keyboard.press("Escape"); await page.waitForTimeout(800);
await world.locator("canvas").focus();
await page.keyboard.press("j"); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/ux-journal.png` });
await page.keyboard.press("j"); await page.waitForTimeout(800);
await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/ux-menu.png` });
await page.keyboard.press("Escape"); await page.waitForTimeout(800);
for (const zone of ["workshop", "quiet-shore"]) {
  await world.evaluate((el, z) => el.__tqaJourney.goTo(z), zone); await page.waitForTimeout(2500);
  await world.locator("canvas").focus(); await page.keyboard.press("e"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/ux-overlay-${zone}.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
}
await page.goto("http://127.0.0.1:4180/vi/quick/");
await page.screenshot({ path: `${out}/ux-quick.png`, fullPage: false });
await browser.close();
