// B2-043a — Atlas Journal in the running world (spec §7.2: J opens, 8 rows, stamps for visited zones; §6.2 no persistence).
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";
import { expect, test } from "./test";

test("J opens the journal and pauses the world; a visited zone is stamped; J closes", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: no WebGL2");
  await ensureWindowFocus(page);
  await expect(world!).toHaveAttribute("data-world-paused", "false");

  // Visit The Workshop through the world's own content event, as walking to it would.
  await world!.evaluate(node => node.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: "workshop" } })));
  const overlay = page.locator("dialog[open]");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.locator("canvas").first().focus();
  await page.keyboard.press("j");
  const journal = page.getByRole("dialog", { name: "Atlas Journal" });
  await expect(journal).toBeVisible();
  await expect(world!).toHaveAttribute("data-world-paused", "true");
  await expect(journal.getByRole("button")).toHaveCount(9); // 8 zones + Close
  await expect(journal.getByRole("button", { name: "The Workshop, visited" })).toBeVisible();
  await expect(journal.getByRole("button", { name: "The Roots", exact: true })).toBeVisible();

  await page.keyboard.press("j");
  await expect(journal).toHaveCount(0);
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  expect(errors).toEqual([]);
});

test("the journal starts empty on every Enter World (no stored progress)", async ({ page }) => {
  const world = await enterWorld(page, "vi");
  test.skip(!world, "NOT RUN: no WebGL2");
  await page.locator("canvas").first().focus();
  await page.keyboard.press("j");
  const journal = page.getByRole("dialog", { name: "Sổ Atlas" });
  await expect(journal).toBeVisible();
  await expect(journal.getByRole("button", { name: /đã ghé/ })).toHaveCount(0);
});
