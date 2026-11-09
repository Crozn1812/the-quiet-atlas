// Headed Edge visual evidence. Zoom and orbit use real wheel/keyboard input.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const [out, base = "http://127.0.0.1:4185"] = process.argv.slice(2);
if (!out) throw new Error("Usage: rc-camera.mjs <outDir> [localBase]");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
const manifest = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(90_000);
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(`${base}/vi/`);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor();
  await page.bringToFront();
  await world.locator("canvas").focus();
  await page.keyboard.press("Escape");
  await page.locator('.world-menu input[value="high"]').check();
  await page.keyboard.press("Escape");
  for (const zone of ["first-light", "workshop", "roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"]) {
    await world.evaluate((el, id) => el.__tqaJourney.goTo(id), zone);
    await world.locator("canvas").focus();
    const panels = [];
    for (const [zoom, delta] of [["near", -3000], ["far", 3000]]) {
      await page.mouse.move(800, 450);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(700);
      for (let orbit = 0; orbit < 4; orbit++) {
        await expect(world).toHaveAttribute("data-world-paused", "false");
        await expect(world).toHaveAttribute("data-world-quality", "high");
        const file = `${zone}-${zoom}-${orbit}.webp`;
        const pixels = await page.screenshot();
        await sharp(pixels).webp({ quality: 82 }).toFile(path.join(out, file));
        panels.push(await sharp(pixels).resize(800, 450).png().toBuffer());
        const cameraDistance = await world.evaluate(el => el.__tqaJourney.cameraDistance());
        manifest.push({ zone, zoom, orbit, file, cameraDistance,
          yaw: await world.evaluate(el => el.__tqaJourney.cameraYaw()), visualReview: "pending" });
        expect(cameraDistance, `${zone}/${zoom}/${orbit}: camera stays outside the character at the signpost`).toBeGreaterThan(2.5);
        await page.keyboard.down("ArrowLeft");
        try { await page.waitForTimeout(1050); } finally { await page.keyboard.up("ArrowLeft"); }
        await page.waitForTimeout(250);
      }
    }
    await sharp({ create: { width: 1600, height: 1800, channels: 3, background: "#eee8d8" } })
      .composite(panels.map((input, i) => ({ input, left: i % 2 * 800, top: Math.floor(i / 2) * 450 })))
      .webp({ quality: 85 }).toFile(path.join(out, `${zone}-contact.webp`));
    console.log(`${zone}: 8 zoom/orbit frames captured; visual review pending`);
  }
} finally {
  await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
}
