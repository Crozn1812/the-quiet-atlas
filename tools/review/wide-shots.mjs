import { createRequire } from "node:module";
const require = createRequire("D:/the-quiet-atlas/package.json");
const { chromium } = require("@playwright/test");
const [base, zone, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
await page.goto(base + "/en/");
await page.getByRole("button", { name: "Enter World", exact: true }).click();
const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
await world.waitFor({ state: "visible", timeout: 120000 });
await page.keyboard.press("Escape"); await page.locator('.world-menu dialog input[value="high"]').check(); await page.keyboard.press("Escape");
await world.locator("canvas").focus();
await world.evaluate((el, z) => el.__tqaJourney.goTo(z), zone);
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 600);
await page.keyboard.down("s"); await page.waitForTimeout(3500); await page.keyboard.up("s");
await page.waitForTimeout(1200); await page.screenshot({ path: out + "-a.png" });
await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(900); await page.keyboard.up("ArrowLeft");
await page.waitForTimeout(800); await page.screenshot({ path: out + "-b.png" });
// No cameraPitch hook exists in this build. Use the opt-in review camera at
// the actual arrival on the path, looking up toward the road-facing forks.
await world.evaluate((el, z) => el.__tqaJourney.goTo(z), zone);
await world.evaluate(el => {
  const p = el.__tqaJourney.position(), yaw = el.__tqaJourney.cameraYaw();
  const forward = [-Math.sin(yaw), -Math.cos(yaw)];
  const right = [-Math.cos(yaw), Math.sin(yaw)];
  el.dispatchEvent(new CustomEvent("tqa:postcard", { detail: {
    position: [p.x, p.y + 0.05, p.z],
    target: [p.x + forward[0] * 8 + right[0] * 6, p.y + 15, p.z + forward[1] * 8 + right[1] * 6],
  } }));
});
await page.waitForTimeout(1800);
await page.screenshot({ path: out + "-path-up.png" });
console.log("High wide shots and path-up captured:", out);
await browser.close();
