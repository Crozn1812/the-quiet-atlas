// Keep Quick server-rendered and avoid preloading the Q-22 bold font subsets.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Portfolio } from "@/components/portfolio/Portfolio";
import { QuickPortfolio } from "@/components/portfolio/QuickPortfolio";

const source = (path: string) => readFileSync(path, "utf8");

it("does not let the Quick route import WorldEntry (its client chunk would ship on Quick)", () => {
  expect(source("src/app/[locale]/quick/page.tsx")).not.toMatch(/components\/portfolio\/(Portfolio|WorldEntry)"/);
  expect(source("src/components/portfolio/QuickPortfolio.tsx")).not.toMatch(/from "\.\/(Portfolio|WorldEntry)"/);
});

it("does not use next/link in the not-found boundary that is part of every route's tree", () => {
  expect(source("src/app/not-found.tsx")).not.toMatch(/from\s+["']next\/link["']/);
});

it("uses bold for the Welcome heading without preloading its font subsets", () => {
  const css = source("src/app/portfolio.css");
  const rule = css.match(/\.welcome-card h1\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/font-weight:\s*700/);
  expect(source("src/app/[locale]/layout.tsx")).not.toContain("700-normal.woff2");
});

it("serves a decorative responsive Welcome image in the HTML without client image code", () => {
  const html = renderToStaticMarkup(createElement(Portfolio, { locale: "en" }));
  const picture = html.match(/<picture>([\s\S]*?)<\/picture>/)?.[1];
  expect(picture).toBeDefined();
  expect(picture).toMatch(/<source[^>]*media="\(max-width: 900px\)"[^>]*srcSet="\/welcome\/hero-coast-960.webp"[^>]*width="960"[^>]*height="540"/);
  expect(picture).toMatch(/<img[^>]*src="\/welcome\/hero-coast-1920.webp"[^>]*width="1920"[^>]*height="1080"[^>]*fetchPriority="high"[^>]*alt=""/i);
  expect(picture).not.toContain('loading="lazy"');
  expect(html).not.toContain('<canvas');
  expect(html).not.toContain('id="pine"');
  expect(source("src/components/portfolio/ForestBackdrop.tsx")).not.toContain('"use client"');
});

it("renders the same Quick markup through Portfolio and QuickPortfolio", () => {
  for (const locale of ["en", "vi"] as const) {
    expect(renderToStaticMarkup(createElement(Portfolio, { locale, quick: true })))
      .toBe(renderToStaticMarkup(createElement(QuickPortfolio, { locale })));
  }
});
