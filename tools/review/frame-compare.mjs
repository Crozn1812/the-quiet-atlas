// Lead review: rAF frame-interval p50/p95 at 3 zones under 6x CPU throttle. Usage: node tools/review/frame-compare.mjs <baseUrl>
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const base = process.argv[2];
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
await page.goto(`${base}/vi/`);
await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
await page.locator("canvas").first().focus();
const res = [];
for (const zone of ["first-light", "roots", "workshop"]) {
  if (zone !== "first-light") await page.evaluate(z => document.querySelector("[data-world-build]").__tqaJourney.goTo(z), zone);
  await page.keyboard.down("w");
  const ms = await page.evaluate(() => new Promise(r => { const t = []; let last = performance.now(); const f = now => { t.push(now - last); last = now; if (t.length < 150) requestAnimationFrame(f); else { t.sort((a, b) => a - b); r([t[75], t[142]]); } }; requestAnimationFrame(f); }));
  await page.keyboard.up("w");
  res.push(`${zone}: p50 ${ms[0].toFixed(1)} p95 ${ms[1].toFixed(1)}`);
}
console.log(base, res.join(" | "));
await browser.close();
