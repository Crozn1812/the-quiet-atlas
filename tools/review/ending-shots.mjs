// Lead review: ending cinematic (needs window.__tqaJourney).
// Usage: node tools/review/ending-shots.mjs <outDir> [baseUrl]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export async function captureEnding({ outDir, baseUrl = "http://127.0.0.1:4180", showcase } = {}) {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await showcase?.onPage(page);
    await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
    await page.goto(`${baseUrl}/vi/`);
    await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
    await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
    const world = page.locator("[data-world-build]");
    await showcase?.onReady(page, world);
    const visits = await page.evaluate(() => {
      const j = document.querySelector("[data-world-build]").__tqaJourney;
      return ["reflection", "forgotten-sound", "unmarked-road", "unwritten-page"].map(id => j.visitSecret(id));
    });
    console.log("visits", visits);
    if (showcase && visits.some(value => !value)) throw new Error("Ending secrets did not unlock");
    const t0 = Date.now();
    const times = showcase ? Array.from({ length: 12 }, (_, i) => 500 + i * 3100) : [500, 4000, 9000, 14000, 20000, 26000, 31000, 34500];
    for (const at of times) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      if (showcase) await showcase.capture(page, `ending-${String(at).padStart(5, "0")}`, at);
      else await page.screenshot({ path: `${outDir}/e-${String(at).padStart(5, "0")}.png` });
    }
    if (showcase) await showcase.onComplete(page);
    else {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `${outDir}/e-after.png` });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outDir, baseUrl] = process.argv.slice(2);
  await captureEnding({ outDir, baseUrl });
}
