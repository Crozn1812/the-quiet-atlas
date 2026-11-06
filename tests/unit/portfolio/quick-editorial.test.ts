import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { content } from "@/content";
import { messages } from "@/i18n/messages";
import { QuickPortfolio } from "@/components/portfolio/QuickPortfolio";
import { ProfileJsonLd } from "@/components/portfolio/ProfileJsonLd";
import { ProjectsContent } from "@/components/portfolio/ServerZoneContent";

it.each(["en", "vi"] as const)("preserves the Quick heading outline and public project content in %s", locale => {
  const profile = content.profiles.find(p => p.locale === locale)!;
  const html = renderToStaticMarkup(createElement(QuickPortfolio, { locale }));
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/g)];
  expect(headings.filter(h => h[1] === "1")).toHaveLength(1);
  expect(headings[0]![2]).toBe(profile.name);
  for (let i = 1; i < headings.length; i++) {
    expect(Number(headings[i]![1]) - Number(headings[i - 1]![1])).toBeLessThanOrEqual(1);
  }
  expect(headings.filter(h => h[1] === "2").map(h => h[2])).toEqual([
    locale === "vi" ? "Kinh nghiệm" : "Experience",
    locale === "vi" ? "Học vấn" : "Education",
    messages[locale].projects, "CV", messages[locale].contact,
  ]);
  expect(html).toContain(renderToStaticMarkup(createElement(ProjectsContent, { locale })));
  expect(html).toContain(renderToStaticMarkup(createElement(ProfileJsonLd, { locale })));
  expect(html.match(/<script\b/g)).toHaveLength(1);
  expect(html).not.toMatch(/<canvas|<button/);
});

it.each(["en", "vi"] as const)("keeps welcome, CV, email and both language links in the static %s header", locale => {
  const profile = content.profiles.find(p => p.locale === locale)!;
  const html = renderToStaticMarkup(createElement(QuickPortfolio, { locale }));
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1]!;
  for (const href of [`/${locale}/`, "/cv/", `mailto:${profile.email}`, "/en/quick/", "/vi/quick/"]) {
    expect(header).toContain(`href="${href}"`);
  }
  expect(header).toContain("The Quiet Atlas · Quick Portfolio");
  expect(header).toContain(`href="/${locale}/quick/" hrefLang="${locale}" aria-current="page"`);
});
