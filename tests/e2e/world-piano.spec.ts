// QF-06 (Duy, 20/11): the Quiet Shore overlay opens a piano played with the computer keyboard.
import { expect, test } from "./test";
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
test.describe.configure({ timeout: 90_000 });

test("QF-06: Play the piano from Quiet Shore; keys sound notes, movement is held, Esc returns to the world", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable in this browser");
  await ensureWindowFocus(page);
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  await world!.evaluate(element => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "quiet-shore" } })));
  const play = page.locator("dialog.world-content [data-world-piano-open]");
  await expect(play).toBeVisible();
  await play.click();
  const piano = page.locator("dialog.tqa-piano");
  await expect(piano).toHaveAttribute("data-world-piano", "open");
  await expect(page.locator("dialog.world-content")).not.toHaveAttribute("open", "");
  await expect(world!).toHaveAttribute("data-world-paused", "true");

  await page.keyboard.down("a");
  await expect(piano.locator('[data-code="KeyA"]')).toHaveAttribute("aria-pressed", "true");
  await expect(piano).toHaveAttribute("data-piano-active", "C4");
  await page.keyboard.down("e");
  await expect(piano).toHaveAttribute("data-piano-active", "C4 D♯4");
  await page.keyboard.up("e");
  await page.keyboard.up("a");
  await expect(piano).toHaveAttribute("data-piano-active", "");
  await page.keyboard.press("x");
  await expect(piano).toHaveAttribute("data-piano-octave", "1");
  await page.keyboard.down("a");
  await expect(piano).toHaveAttribute("data-piano-active", "C5");
  await page.keyboard.up("a");
  // W is a note here, never movement; J never opens the journal.
  await page.keyboard.press("w");
  await page.keyboard.press("j");
  await expect(world!).toHaveAttribute("data-world-paused", "true");
  await expect(page.locator(".world-menu dialog")).not.toHaveAttribute("open", "");

  await page.keyboard.press("Escape");
  await expect(piano).toHaveAttribute("data-world-piano", "closed");
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  await expect(page.locator(".world-menu dialog")).not.toHaveAttribute("open", "");
  expect(errors, errors.join("\n")).toEqual([]);
});
