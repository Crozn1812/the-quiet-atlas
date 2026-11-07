// Lead review: spawn, journal, menu, secrets, bike ride (needs window.__tqaJourney). Usage: node tools/review/extras-shots.mjs <outDir>
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const out = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
await page.goto("http://127.0.0.1:4180/vi/");
await page.getByRole("button", { name: /Vào thế giới|Enter World/ }).click();
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
const J = (fn, ...a) => page.evaluate(([fn, a]) => document.querySelector("[data-world-build]").__tqaJourney[fn](...a), [fn, a]);
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
const canvas = page.locator("canvas").first();
await canvas.focus();
// Mascot near spawn, then journal and menu.
await page.waitForTimeout(1500); await shot("x01-spawn");
await page.keyboard.press("j"); await page.waitForTimeout(800); await shot("x02-journal");
await page.keyboard.press("j"); await page.waitForTimeout(500);
await page.keyboard.press("Escape"); await page.waitForTimeout(800); await shot("x03-menu");
await page.keyboard.press("Escape"); await page.waitForTimeout(500);
// Secrets (3 required ones + one not-yet page check order: page first => "not yet").
console.log("page early", await J("visitSecret", "unwritten-page"));
await page.waitForTimeout(1200); await shot("x04-page-not-yet");
let i = 5;
for (const id of ["reflection", "forgotten-sound", "unmarked-road"]) {
  console.log(id, await J("visitSecret", id));
  await page.waitForTimeout(2500); await shot(`x0${i++}-secret-${id}`);
}
// Ride.
await J("nearVehicle"); await page.waitForTimeout(1200); await shot("x08-near-bike");
await canvas.focus(); await page.keyboard.press("e"); await page.waitForTimeout(1500); await shot("x09-mounted");
await page.keyboard.down("w"); await page.waitForTimeout(3500); await shot("x10-riding"); await page.waitForTimeout(3000); await shot("x11-riding2"); await page.keyboard.up("w");
await page.keyboard.press("c"); await page.waitForTimeout(4000); await shot("x12-cruise");
await page.keyboard.press("s"); await page.waitForTimeout(1500); await page.keyboard.press("e"); await page.waitForTimeout(1500); await shot("x13-dismount");
await browser.close();
