// Enter World lifecycle (spec §3.4, §5; T02 counterpart, T07 HTML part: focus returns after leaving).
// Needs WebGL2 in the test browser; skipped with a reason (NOT RUN) when the headless browser has none.
import { expect, test } from "@playwright/test";
import { hasWebGL2, HUD, LOCALES, settle, trackConsoleErrors, trackNetwork, WORLD_MARKER } from "./helpers";

test.use({ viewport: { width: 1366, height: 800 } });
// Same headroom as the other world specs: Enter World with software WebGL under parallel load takes ~15–20 s.
test.describe.configure({ timeout: 90_000 });

for (const { locale, leave } of LOCALES) {
  test(`World /${locale}/: Enter World loads the world chunk; ${leave} tears it down`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const network = trackNetwork(page);
    await page.goto(`/${locale}/`);
    test.skip(!(await hasWebGL2(page)), "NOT RUN: WebGL2 unavailable in this headless browser");

    const enter = page.getByRole("button", { name: "Enter World" });
    await expect(enter).toBeEnabled();
    await settle(page);
    expect(await network.worldChunks(), "no world chunk before Enter World").toEqual([]);

    await enter.click();
    const scene = page.locator(`[data-world-chunk="${WORLD_MARKER}"]`);
    await expect(scene).toBeVisible({ timeout: 20_000 });
    await expect(scene.locator("canvas")).toHaveCount(1);
    await expect(page.locator("[data-app-mode='world']")).toHaveCount(1);
    await settle(page);
    expect((await network.worldChunks()).length, "world chunk downloaded after Enter World").toBeGreaterThan(0);

    // ADR 0009: the HUD "Exit world" button replaces "Back to Welcome".
    await page.locator(HUD).getByRole("button", { name: leave, exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-world-chunk]")).toHaveCount(0);
    await expect(page.locator("[data-app-mode='welcome']")).toHaveCount(1);
    await expect(enter).toBeFocused();
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
