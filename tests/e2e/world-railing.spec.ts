import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";
import { expect, test } from "./test";

type Point = { x: number; y: number; z: number };
type Journey = { goTo(zone: string): Promise<void>; position(): Point; cameraYaw(): number; lookoutPosition(): Point };

for (const locale of ["vi", "en"]) test(`coastal railing: keyboard approach, E / Escape / movement exits (${locale})`, async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.addInitScript(() => { window.__tqaJourney = true; });
  const world = await enterWorld(page, locale);
  expect(world, "WebGL2 is required for railing acceptance").toBeDefined();
  await ensureWindowFocus(page);
  await world!.evaluate(async node => {
    await (node as HTMLElement & { __tqaJourney: Journey }).__tqaJourney.goTo("last-postcard");
    node.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "high" } }));
  });
  await world!.locator("canvas").focus();
  // Read-only QA coordinates; every metre of the approach uses real keyboard input.
  for (let i = 0; i < 120; i++) {
    const delta = await world!.evaluate(node => {
      const j = (node as HTMLElement & { __tqaJourney: Journey }).__tqaJourney;
      const p = j.position(), t = j.lookoutPosition(), yaw = j.cameraYaw();
      const dx = t.x - p.x, dz = t.z - p.z;
      return { distance: Math.hypot(dx, dz), x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) };
    });
    if (delta.distance < .65) break;
    const key = Math.abs(delta.x) > Math.abs(delta.z) ? delta.x > 0 ? "d" : "a" : delta.z > 0 ? "s" : "w";
    await page.keyboard.down(key); await page.waitForTimeout(100); await page.keyboard.up(key);
  }
  await expect(world!.locator("[data-world-interaction-hint]")).toHaveText("E — Look out to sea");
  await page.screenshot({ path: `test-results/rd01/${locale}-terminal-gameplay.png` });
  for (const exit of ["e", "Escape", "w"]) {
    await page.keyboard.press("e");
    await expect(world!).toHaveAttribute("data-world-lean", "on");
    await expect(page.locator(".world-hud")).toBeHidden();
    await page.waitForTimeout(1200);
    if (exit === "e") await page.screenshot({ path: `test-results/rd01/${locale}-lean-high.png` });
    await page.keyboard.press(exit);
    await expect(world!).not.toHaveAttribute("data-world-lean", "on");
    await expect(world!).toHaveAttribute("data-world-paused", "false");
    await expect(page.locator(".world-menu dialog")).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});
