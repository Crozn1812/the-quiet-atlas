// Lead review: loading, intro, after-intro, zone card. Existing CLI timings are unchanged.
// Usage: node tools/review/intro-shots.mjs <outDir> [baseUrl]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export async function captureIntro({ outDir, baseUrl = "http://127.0.0.1:4180", showcase } = {}) {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await showcase?.onPage(page);
    await page.addInitScript(() => { window.__tqaJourney = true; });
    await page.goto(`${baseUrl}/vi/`);
    await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
    if (!showcase) for (const ms of [300, 1200]) {
      await page.waitForTimeout(ms === 300 ? 300 : 900);
      await page.screenshot({ path: `${outDir}/m-load-${ms}.png` });
    }
    const world = page.locator("[data-world-intro]");
    await world.waitFor({ timeout: 60000 });
    await showcase?.onReady(page, world);
    const t0 = Date.now();
    const times = showcase ? Array.from({ length: 12 }, (_, i) => i * 3000) : [1500, 4000, 7000, 10000];
    for (const at of times) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      if (showcase) await showcase.capture(page, `intro-${String(at).padStart(5, "0")}`, at);
      else await page.screenshot({ path: `${outDir}/m-intro-${at}.png` });
    }
    if (showcase) await showcase.onComplete(page);
    else {
      await page.waitForFunction(() => document.querySelector("[data-world-intro]")?.getAttribute("data-world-intro") === "done", null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${outDir}/m-after-intro.png` });
      await world.evaluate(el => el.__tqaJourney.goTo("horizon"));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${outDir}/m-zonecard.png` });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outDir, baseUrl] = process.argv.slice(2);
  await captureIntro({ outDir, baseUrl });
}
