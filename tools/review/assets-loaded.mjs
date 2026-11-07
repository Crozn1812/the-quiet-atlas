// Lead review: lists world assets fetched after Enter World at High (textures, foliage, props GLB/KTX2) + console errors. Usage: node tools/review/assets-loaded.mjs <baseUrl>
import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text().slice(0, 200)); });
await page.addInitScript(() => { window.__tqaSkipIntro = true; });
await page.goto(process.argv[2] + "/vi/");
await page.getByRole("button", { name: /Enter World|Vào thế giới/ }).click();
await page.waitForFunction(() => document.querySelector("[data-world-build]")?.getAttribute("data-world-build") === "done", null, { timeout: 90000 });
await page.keyboard.press("Escape"); await page.locator('.world-menu dialog input[value="high"]').check(); await page.keyboard.press("Escape");
await page.waitForTimeout(8000);
console.log(JSON.stringify(await page.evaluate(() => performance.getEntriesByType("resource").map(e => e.name).filter(n => /textures|foliage|props|\.glb|\.ktx2|basis|transcoder/.test(n)))));
console.log(errs.slice(0, 8).join("\n"));
await browser.close();
