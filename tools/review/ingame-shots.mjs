// Lead-only browser run: node tools/review/ingame-shots.mjs <outDir> [baseUrl] [locale]
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const [outDir, baseUrl = "http://127.0.0.1:4180", locale = "en"] = process.argv.slice(2);
if (!outDir || !["en", "vi"].includes(locale)) {
  console.error("Usage: node tools/review/ingame-shots.mjs <outDir> [baseUrl=http://127.0.0.1:4180] [locale=en|vi]");
  process.exit(1);
}

const zones = ["first-light", "workshop", "roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"];
let browser;
const pageErrors = [];
try {
  await mkdir(path.resolve(outDir), { recursive: true });
  browser = await chromium.launch({
    headless: false,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", error => { pageErrors.push(error); console.error(`pageerror: ${error.message}`); });
  await page.addInitScript(() => {
    window.__tqaJourney = true;
    window.__tqaSkipIntro = true;
  });
  await page.goto(new URL(`/${locale}/`, baseUrl).href);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: "visible" });
  await page.bringToFront();
  await world.locator("canvas").focus();
  // Optional TQA_QUALITY=low|balanced|high: set it through the menu (adaptive quality may otherwise step down).
  const wanted = process.env.TQA_QUALITY;
  if (wanted) {
    await page.keyboard.press("Escape");
    await page.locator(`.world-menu dialog input[value="${wanted}"]`).check();
    await page.keyboard.press("Escape");
    await world.locator("canvas").focus();
    await page.waitForTimeout(4000);
  }
  console.log(`quality: ${await world.getAttribute("data-world-quality")}`);
  for (const [index, zone] of zones.entries()) {
    if (index > 0) {
      await world.evaluate(async (element, target) => {
        if (!element.__tqaJourney?.goTo) throw new Error("Missing QA goTo hook; rebuild the app first");
        await element.__tqaJourney.goTo(target);
      }, zone);
    }
    await page.waitForTimeout(3000);
    if (pageErrors.length) throw new Error("Page errors occurred; aborting screenshots");
    const output = path.resolve(outDir, `ingame-${zone}.png`);
    await page.screenshot({ path: output });
    console.log(output);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (pageErrors.length) process.exitCode = 1;
}
