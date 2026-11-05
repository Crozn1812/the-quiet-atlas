// B2-043b: the world now opens with a 22 s cinematic that locks input. Existing world specs exercise
// gameplay, so this fixture sets the read-only `__tqaSkipIntro` hook before any page script runs.
// Specs that test the cinematic itself opt in with `test.use({ playIntro: true })`.
import { test as base } from "@playwright/test";

export * from "@playwright/test";

export const test = base.extend<{ playIntro: boolean }>({
  playIntro: [false, { option: true }],
  page: async ({ page, playIntro }, provide) => {
    if (!playIntro) await page.addInitScript(() => { (window as unknown as { __tqaSkipIntro: boolean }).__tqaSkipIntro = true; });
    await provide(page);
  },
});
