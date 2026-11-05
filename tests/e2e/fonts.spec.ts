// L4-010 — self-hosted Noto Serif (spec §7.3, §13 T11; L1-010): Vietnamese glyphs come from the self-hosted
// subset, no font is requested from another origin, and /en/ does not pull the Vietnamese 700 subset it does not use.
// @font-face declarations: src/app/portfolio.css (latin/vietnamese × 400/700, unicode-range split);
// preload of latin-400: src/app/[locale]/layout.tsx.
import { expect, test, type Page, type Request } from "./test";
import { settle, trackConsoleErrors } from "./helpers";

const FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

function trackFonts(page: Page) {
  const fonts: Request[] = [];
  page.on("request", request => {
    if (request.resourceType() === "font" || FONT_FILE.test(request.url())) fonts.push(request);
  });
  return {
    urls: () => fonts.map(request => request.url()),
    paths: () => fonts.map(request => new URL(request.url()).pathname),
    external: (origin: string) => fonts.map(request => request.url()).filter(url => new URL(url).origin !== origin),
  };
}

async function loadedFaces(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(face => face.status === "loaded").map(face => `${face.family} ${face.weight} ${face.unicodeRange.slice(0, 12)}`);
  });
}

test("T11 /vi/: Noto Serif (self-hosted Vietnamese 400 subset) is loaded and used; no font from another origin", async ({ page, baseURL }) => {
  const errors = trackConsoleErrors(page);
  const fonts = trackFonts(page);
  const fontCss = new Set<string>();
  page.on("request", request => {
    if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/i.test(request.url())) fontCss.add(request.url());
  });
  await page.goto("/vi/");
  await settle(page);

  const check = await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px "Noto Serif"', "Tiếng Việt");
    return {
      check: document.fonts.check('16px "Noto Serif"', "Tiếng Việt"),
      h1Family: getComputedStyle(document.querySelector("h1")!).fontFamily,
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  test.info().annotations.push({ type: "fonts /vi/", description: `requests: ${fonts.paths().join(", ")}; loaded: ${(await loadedFaces(page)).join(" | ")}` });
  expect(check.check, 'document.fonts.check(\'16px "Noto Serif"\', "Tiếng Việt")').toBe(true);
  expect(check.bodyFamily).toMatch(/^"?Noto Serif"?/);
  expect(fonts.paths()).toContain("/fonts/noto-serif-vietnamese-400-normal.woff2");
  expect(fonts.external(new URL(baseURL!).origin), "font requested from another origin").toEqual([]);
  expect([...fontCss], "third-party font CSS/service requested").toEqual([]);
  for (const path of fonts.paths()) expect(path, "font outside /fonts/").toMatch(/^\/fonts\/noto-serif-[a-z]+-(400|700)-normal\.woff2$/);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("T11 /en/: latin Noto Serif loaded from /fonts/, Vietnamese 700 subset not requested (unused), no font from another origin", async ({ page, baseURL }) => {
  const errors = trackConsoleErrors(page);
  const fonts = trackFonts(page);
  await page.goto("/en/");
  await settle(page);
  // Does the page render any bold Vietnamese-range glyph? Only then would the vietnamese-700 subset be legitimate.
  const usesBoldVietnamese = await page.evaluate(() => {
    const viRange = /[ĂăĐđĨĩŨũƠơƯừ-̣̄̈̉Ạ-ỹ₫]/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !viRange.test(node.textContent ?? "")) continue;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Number(style.fontWeight) >= 600 && /Noto Serif/.test(style.fontFamily)) return parent.outerHTML.slice(0, 120);
    }
    return null;
  });
  const check = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Noto Serif"', "Quiet Atlas");
  });
  test.info().annotations.push({ type: "fonts /en/", description: `requests: ${fonts.paths().join(", ")}; bold Vietnamese text: ${usesBoldVietnamese ?? "none"}` });
  expect(check).toBe(true);
  expect(fonts.paths()).toContain("/fonts/noto-serif-latin-400-normal.woff2");
  expect(usesBoldVietnamese, "control: /en/ has visible bold Vietnamese text, so the 700 subset would be legitimate").toBeNull();
  expect(fonts.paths(), "/en/ requested the unused Vietnamese 700 subset").not.toContain("/fonts/noto-serif-vietnamese-700-normal.woff2");
  expect(fonts.external(new URL(baseURL!).origin), "font requested from another origin").toEqual([]);
  expect(errors, errors.join("\n")).toEqual([]);
});
