// B2-043b — opening cinematic (spec §2 "có Skip", §6.2 every Enter World, §9 reduced motion).
import { enterWorld } from "./helpers";
import { expect, test } from "./test";

test.use({ playIntro: true });
// enterWorld() itself may wait 45 s + 30 s under parallel software-WebGL load; the default 30 s test
// timeout made these flaky (2026-11-06: 2 timeouts in one full run, 151/151 on rerun).
test.describe.configure({ timeout: 90_000 });

test("plays on Enter World, offers a focused Skip, and hands control back on Skip", async ({ page }) => {
  const world = await enterWorld(page, "vi");
  test.skip(!world, "NOT RUN: no WebGL2");
  await expect(world!).toHaveAttribute("data-world-intro", "playing");
  const skip = page.locator("[data-world-intro-skip]");
  await expect(skip).toHaveText("Bỏ qua");
  await expect(page.locator("[data-world-letterbox]")).toHaveCount(2);
  await skip.click();
  await expect(world!).toHaveAttribute("data-world-intro", "done");
  await expect(skip).toHaveCount(0);
  await expect(page.locator("[data-world-letterbox]")).toHaveCount(0);
});

test("Escape skips the cinematic", async ({ page }) => {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: no WebGL2");
  await expect(world!).toHaveAttribute("data-world-intro", "playing");
  await page.locator("[data-world-intro-skip]").focus();
  await page.keyboard.press("Escape");
  await expect(world!).toHaveAttribute("data-world-intro", "done");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("finishes with a short paper fade instead of the flight", async ({ page }) => {
    const world = await enterWorld(page, "en");
    test.skip(!world, "NOT RUN: no WebGL2");
    // The fade is frame-paced; under parallel load (Codex workers) 5 s was flaky (2026-11-06: 2/9 runs).
    await expect(world!).toHaveAttribute("data-world-intro", "done", { timeout: 15_000 });
  });
});
