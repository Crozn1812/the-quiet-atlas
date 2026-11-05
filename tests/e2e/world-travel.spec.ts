// Batch 18–20: teleport chooser round trip (B2-041), parked GD110 (B2-042), Sound toggle (B2-081).
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";
import { expect, test } from "./test";

// The world only accepts tqa:teleport-to after its own E-at-signpost choosing state (unit: teleport-wiring.test.ts
// covers E -> choose -> fade -> arrival). Here the UI side: the chooser opens, sends the choice, and releases the pause.
test("teleport chooser: opens on the world event, disables the current zone, closes and unpauses on a choice", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const world = await enterWorld(page, "vi");
  test.skip(!world, "NOT RUN: no WebGL2");
  await ensureWindowFocus(page);
  await expect(world!).toHaveAttribute("data-world-teleport", "idle");
  await world!.evaluate(node => {
    const sent: string[] = [];
    (window as unknown as { __sent: string[] }).__sent = sent;
    node.addEventListener("tqa:teleport-to", event => sent.push((event as CustomEvent).detail.to));
    // Same event the world sends when E is pressed at the First Light signpost.
    node.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from: "first-light" } }));
  });
  const chooser = page.getByRole("dialog", { name: "Đi tới…" });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("button", { name: /The First Light/ })).toBeDisabled();
  await chooser.getByRole("button", { name: /The Workshop/ }).click();
  await expect(chooser).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __sent: string[] }).__sent)).toEqual(["workshop"]);
  await expect(world!).toHaveAttribute("data-world-teleport", "idle");
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  expect(errors).toEqual([]);
});

test("teleport: Escape closes the chooser without travelling", async ({ page }) => {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: no WebGL2");
  await world!.evaluate(node => node.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from: "roots" } })));
  const chooser = page.getByRole("dialog", { name: "Travel to…" });
  await expect(chooser).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);
  await expect(world!).toHaveAttribute("data-world-teleport", "idle");
});

test("the GD110 waits parked beside First Light", async ({ page }) => {
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: no WebGL2");
  await expect(world!).toHaveAttribute("data-world-vehicle", "parked");
});

test("Sound is a real toggle on Welcome (no audio before the press)", async ({ page }) => {
  await page.goto("/en/");
  const sound = page.getByRole("button", { name: "Sound" });
  await expect(sound).toBeEnabled();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
});
