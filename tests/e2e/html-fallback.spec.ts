// T02 — standalone HTML (spec §3.3, §3.4, §5, §13.1; also Q15/Q18 HTML side).
import { expect, test } from "@playwright/test";
import { DISABLE_WEBGL, LOCALES, settle, trackNetwork } from "./helpers";

test.describe("T02-a JavaScript disabled: content still readable", () => {
  test.use({ javaScriptEnabled: false });

  for (const { locale } of LOCALES) {
    for (const route of [`/${locale}/`, `/${locale}/quick/`]) {
      test(`T02-a ${route} without JS`, async ({ page }) => {
        const profile = LOCALES.find(l => l.locale === locale)!;
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(profile.name);
        await expect(page.getByText(profile.role, { exact: false }).first()).toBeVisible();
        await expect(page.getByRole("heading", { name: "CV", level: 2 })).toBeVisible();
        await expect(page.locator("main a[href^='mailto:']")).toBeVisible();
        if (route.endsWith("/quick/")) {
          await expect(page.locator("main article h3").first()).toBeVisible();
        } else {
          await expect(page.getByRole("link", { name: "Quick Portfolio" })).toHaveAttribute("href", `/${locale}/quick/`);
        }
      });
    }
  }

  test("T02-a / (entry) without JS links to both locales", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("a[href='/en/']").first()).toBeVisible();
    await expect(page.locator("a[href='/vi/']").first()).toBeVisible();
  });
});

for (const { locale } of LOCALES) {
  test(`T02-b /${locale}/ before Enter World: no 3D files, no world chunk`, async ({ page }) => {
    const network = trackNetwork(page);
    await page.goto(`/${locale}/`);
    // Quiet window of 2 s so idle-time prefetch has a chance to fire before asserting nothing 3D was fetched.
    await settle(page, 2_000);
    expect(await network.scriptCount(), "JS responses were inspected").toBeGreaterThan(0);
    expect(network.forbidden3d()).toEqual([]);
    expect(await network.worldChunks()).toEqual([]);
  });

  test(`T02-c /${locale}/ at 800px width: Editorial link replaces Enter World, no world chunk`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    const network = trackNetwork(page);
    await page.goto(`/${locale}/`);
    const editorial = page.getByRole("link", { name: LOCALES.find(l => l.locale === locale)!.editorial });
    await expect(editorial).toBeVisible();
    await expect(editorial).toHaveAttribute("href", `/${locale}/quick/`);
    await expect(page.getByRole("button", { name: "Enter World" })).toBeHidden();
    await settle(page);
    expect(network.forbidden3d()).toEqual([]);
    expect(await network.worldChunks()).toEqual([]);
  });

  test(`T02-d /${locale}/ without WebGL2: no 3D chunk, Quick path available`, async ({ page }) => {
    await page.addInitScript(DISABLE_WEBGL);
    const network = trackNetwork(page);
    await page.goto(`/${locale}/`);
    const editorial = page.getByRole("link", { name: LOCALES.find(l => l.locale === locale)!.editorial });
    await expect(editorial).toBeVisible();
    await expect(editorial).toHaveAttribute("href", `/${locale}/quick/`);
    await expect(page.getByRole("button", { name: "Enter World" })).toBeHidden();
    await expect(page.locator("[data-app-mode='editorial']")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Quick Portfolio" })).toHaveAttribute("href", `/${locale}/quick/`);
    await settle(page);
    expect(network.forbidden3d()).toEqual([]);
    expect(await network.worldChunks()).toEqual([]);

    await editorial.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/quick/$`));
    await expect(page.locator("main article").first()).toBeVisible();
  });
}
