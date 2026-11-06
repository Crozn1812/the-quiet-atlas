// Lead review: shoots the ending cinematic (needs window.__tqaJourney). Usage: node tools/review/ending-shots.mjs <outDir> [baseUrl]
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const out = process.argv[2];
const base = process.argv[3] ?? "http://127.0.0.1:4180";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
await page.goto(`${base}/vi/`);
await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
const r = await page.evaluate(() => {
  const j = document.querySelector("[data-world-build]").__tqaJourney;
  return ["reflection", "forgotten-sound", "unmarked-road", "unwritten-page"].map(id => j.visitSecret(id));
});
console.log("visits", r);
const t0 = Date.now();
for (const at of [500, 4000, 9000, 14000, 20000, 26000, 31000, 34500]) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  await page.screenshot({ path: `${out}/e-${String(at).padStart(5, "0")}.png` });
}
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/e-after.png` });
await browser.close();
