import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base = "http://127.0.0.1:4512", out = "test-results/vh-02/vh"] = process.argv.slice(2);
await mkdir(path.dirname(path.resolve(out)), { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(new URL("/en/", base).href);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: "visible", timeout: 120000 });
  await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "high" } })));
  await page.bringToFront();
  await world.locator("canvas").focus();
  const journey = fn => world.evaluate((el, name) => el.__tqaJourney[name](), fn);
  // Anchor all captures to the same start; screenshot encoding time is included.
  const captures = async (kind, times) => {
    const start = Date.now();
    for (const t of times) {
      await page.waitForTimeout(Math.max(0, t - (Date.now() - start)));
      await page.screenshot({ path: `${out}-${kind}-${t}.png` });
      console.log(kind, t, JSON.stringify(await journey("rider")));
    }
  };
  await journey("nearVehicle");
  await page.waitForTimeout(800);
  await page.keyboard.press("e");
  await captures("mount", [250, 700, 1500]);
  await page.waitForFunction(() => !document.querySelector("[data-world-build]").__tqaJourney.rider().transitioning);
  const p0 = await journey("position");
  await page.keyboard.down("w");
  await page.waitForTimeout(1500);
  const p1 = await journey("position");
  await page.keyboard.down("d");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}-turnD.png` });
  await page.waitForTimeout(900);
  await page.keyboard.up("d");
  const p2 = await journey("position");
  await page.keyboard.up("w");
  const fwd = { x: p1.x - p0.x, z: p1.z - p0.z }, move = { x: p2.x - p1.x, z: p2.z - p1.z };
  console.log("cross(fwd,move) y =", (fwd.z * move.x - fwd.x * move.z).toFixed(3));
  await page.keyboard.down("s");
  let stopped = false;
  for (let i = 0; i < 40; i++) {
    const before = await journey("position");
    await page.waitForTimeout(250);
    const after = await journey("position");
    if (Math.hypot(before.x - after.x, before.z - after.z) < .002) { stopped = true; break; }
  }
  await page.keyboard.up("s");
  assert(stopped, "S never brought the bike to rest");
  console.log("stopped");
  await page.keyboard.press("e");
  await captures("dismount", [300, 900, 1800]);
  const mode = await world.getAttribute("data-world-vehicle");
  console.log("vehicle", mode);
  assert.equal(mode, "parked");
  const rider = await journey("rider");
  assert(!rider.transitioning && rider.rootUp > .99 && rider.torsoUp > .95, "Rider must stand upright");
  assert(rider.distanceToBike > .8 && rider.distanceToBike < 1.7, "Rider must stand beside bike");
  assert.equal(await world.getAttribute("data-world-quality"), "high");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
