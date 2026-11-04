// L1-012 — keep client code and bold font subsets off the first-load path (spec §8 Quick web UX, lighthouserc.cjs).
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

it("keeps the Welcome heading at the regular weight so Welcome needs no 700 font subset", () => {
  const css = source("src/app/portfolio.css");
  const rule = css.match(/\.welcome-card h1\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/font-weight:\s*400/);
});

it("renders the same Quick markup through Portfolio and QuickPortfolio", () => {
  for (const locale of ["en", "vi"] as const) {
    expect(renderToStaticMarkup(createElement(Portfolio, { locale, quick: true })))
      .toBe(renderToStaticMarkup(createElement(QuickPortfolio, { locale })));
  }
});
