// T01 — Welcome (spec §13.1): name, role, Quick Portfolio link, Enter World, Sound, Contact & CV; 0 console errors.
// Layout per ADR 0009: everything above sits in the bottom-left corner card (see full-viewport.spec.ts).
import { expect, test } from "./test";
import { hasWebGL2, LOCALES, settle, trackConsoleErrors } from "./helpers";

for (const profile of LOCALES) {
  const { locale } = profile;
  test(`T01 /${locale}/ shows name, role, Quick, Enter World, Sound, Contact & CV with 0 console errors`, async ({ page }) => {
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
    // Round 1 routes contact and CV access through Quick Portfolio.
    const contact = page.locator(".corner-panel").getByRole("link", {
      name: locale === "vi" ? "Li\u00ean h\u1ec7 & CV" : "Contact & CV", exact: true,
    });
    await expect(contact).toBeVisible();
    await expect(contact).toHaveAttribute("href", `/${locale}/quick/#contact`);
    await expect(page.locator(".corner-panel a[href^='https://mail.google.com/mail/?view=cm']")).toBeVisible();
    await contact.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/quick/#contact$`));
    const cv = page.locator("section[aria-labelledby='contact'] a[href='/cv/']");
    await expect(cv).toBeVisible();
    await cv.click();
    await expect(page).toHaveURL(/\/cv\/$/);

    await settle(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
