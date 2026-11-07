// Lead review: loading, intro 1.5/4/7/10 s, after-intro, zone card. Usage: node tools/review/intro-shots.mjs <outDir> [baseUrl]
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const out = process.argv[2];
const base = process.argv[3] ?? "http://127.0.0.1:4180";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__tqaJourney = true; });
await page.goto(`${base}/vi/`);
await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
for (const ms of [300, 1200]) { await page.waitForTimeout(ms === 300 ? 300 : 900); await page.screenshot({ path: `${out}/m-load-${ms}.png` }); }
const world = page.locator("[data-world-intro]");
await world.waitFor({ timeout: 60000 });
const t0 = Date.now();
for (const at of [1500, 4000, 7000, 10000]) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  await page.screenshot({ path: `${out}/m-intro-${at}.png` });
}
await page.waitForFunction(() => document.querySelector("[data-world-intro]")?.getAttribute("data-world-intro") === "done", null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/m-after-intro.png` });
await world.evaluate(el => el.__tqaJourney.goTo("horizon"));
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/m-zonecard.png` });
await browser.close();
