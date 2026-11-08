// Lead review: main-thread ScriptDuration/TaskDuration per second while walking at 3 zones (CDP). Usage: node tools/review/cpu-compare.mjs <baseUrl>
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const base = process.argv[2];
const quality = process.env.TQA_QUALITY ?? "balanced";
if (!["low", "balanced", "high"].includes(quality)) throw new Error("TQA_QUALITY must be low, balanced or high");
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
await page.goto(`${base}/vi/`);
await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
await page.waitForSelector("[data-world-quality]");
await page.evaluate(q => document.querySelector("[data-world-quality]").dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: q } })), quality);
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await page.locator("canvas").first().focus();
const out = [];
for (const zone of ["first-light", "roots", "workshop"]) {
  if (zone !== "first-light") await page.evaluate(z => document.querySelector("[data-world-build]").__tqaJourney.goTo(z), zone);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const actualQuality = await page.locator("[data-world-quality]").getAttribute("data-world-quality");
  if (actualQuality !== quality) throw new Error(`${zone}: expected ${quality}, got ${actualQuality}`);
  const get = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const a = await get();
  await page.keyboard.down("w"); await page.waitForTimeout(4000); await page.keyboard.up("w");
  const b = await get();
  // Use the actual CDP interval, not the nominal timeout (a busy renderer can delay key delivery).
  const seconds = b.Timestamp - a.Timestamp;
  out.push(`${zone} [${actualQuality}, ${seconds.toFixed(2)}s]: script ${((b.ScriptDuration - a.ScriptDuration) * 1000 / seconds).toFixed(0)} ms/s task ${((b.TaskDuration - a.TaskDuration) * 1000 / seconds).toFixed(0)} ms/s`);
}
console.log(base.slice(-4), out.join(" | "));
await browser.close();
