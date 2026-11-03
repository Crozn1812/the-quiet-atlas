// Q12 (local, tools/serve-out emulating CloudFront rules from spec §5): direct URLs, missing slash, unknown routes.
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/en/", "/vi/", "/en/quick/", "/vi/quick/"];

test("Q12 direct URLs of every route return 200 HTML", async ({ request }) => {
  for (const route of ROUTES) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(200);
    expect(response.headers()["content-type"], route).toContain("text/html");
  }
});

test("Q12 /vi/quick (missing slash) → 301 to /vi/quick/", async ({ request }) => {
  for (const [from, to] of [
    ["/vi/quick", "/vi/quick/"],
    ["/en", "/en/"],
    ["/en/quick?ref=x", "/en/quick/?ref=x"],
  ]) {
    const response = await request.get(from!, { maxRedirects: 0 });
    expect(response.status(), from).toBe(301);
    expect(response.headers()["location"], from).toBe(to);
  }
});

test("Q12 unknown URLs → 404 page with HTTP 404 (never home with 200)", async ({ request }) => {
  const home = await (await request.get("/en/")).text();
  for (const url of ["/does-not-exist/", "/en/projects/no-such-case-study/", "/vi/nope/", "/missing.js", "/en/quick/extra/"]) {
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(404);
    const body = await response.text();
    expect(body, url).toContain('href="/en/"');
    expect(body, url).not.toBe(home);
  }
});

test("Q12 unknown URL in the browser shows a way back to the portfolio", async ({ page }) => {
  const response = await page.goto("/en/this-page-does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const back = page.locator("main a[href='/en/']");
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.getByRole("link", { name: "Quick Portfolio" })).toBeVisible();
});

test("Q12 reload of a direct deep URL keeps the page", async ({ page }) => {
  await page.goto("/vi/quick/");
  await page.reload();
  await expect(page).toHaveURL(/\/vi\/quick\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});
