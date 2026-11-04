// T01 — Welcome (spec §13.1): name, role, Quick Portfolio link, Enter World, Sound, CV; 0 console errors.
// Layout per ADR 0009: everything above sits in the bottom-left corner card (see full-viewport.spec.ts).
import { expect, test } from "@playwright/test";
import { hasWebGL2, LOCALES, settle, trackConsoleErrors } from "./helpers";

for (const profile of LOCALES) {
  const { locale } = profile;
  test(`T01 /${locale}/ shows name, role, Quick, Enter World, Sound, CV with 0 console errors`, async ({ page }) => {
    const errors = trackConsoleErrors(page);

    const response = await page.goto(`/${locale}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(profile.name);
    await expect(page.getByText(profile.role, { exact: false }).first()).toBeVisible();

    const quick = page.getByRole("link", { name: "Quick Portfolio" });
    await expect(quick).toBeVisible();
    await expect(quick).toHaveAttribute("href", `/${locale}/quick/`);

    // Desktop project (1280×720, fine pointer, WebGL2 via SwiftShader): the capability check enables the button.
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable in this headless browser: Enter World is replaced by the Editorial link (covered by T02-d)");
    const enter = page.getByRole("button", { name: "Enter World" });
    await expect(enter).toBeVisible();
    await expect(enter).toBeEnabled();

    await expect(page.getByRole("button", { name: profile.sound, exact: true })).toBeVisible();
    // ADR 0009: the CV section (h2) moved to Quick Portfolio; Welcome keeps a CV link in the corner card.
    // Every CV link must point to /cv/, and the card must show at least one.
    const cvLinks = page.getByRole("link", { name: /CV/ });
    await expect(cvLinks.first()).toBeVisible();
    for (const link of await cvLinks.all()) await expect(link).toHaveAttribute("href", "/cv/");
    await expect(page.locator(".corner-panel a[href='/cv/']").getByText("CV", { exact: true })).toBeVisible();
    // Contact (e-mail) is part of the Welcome card (ADR 0009 §1).
    await expect(page.locator(".corner-panel a[href^='mailto:']")).toBeVisible();

    await settle(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
