import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { content } from "@/content";
import Page, { generateStaticParams } from "@/app/[locale]/projects/[slug]/page";
import { SourceLink, ProjectEvidence } from "@/components/portfolio/ProjectLinks";
import { publicPaths, pageMetadata } from "@/app/seo";
import { Portfolio } from "@/components/portfolio/Portfolio";
import { messages } from "@/i18n/messages";

it("keeps Welcome readable without JS and moves long content to Quick", () => {
  for (const locale of ["en", "vi"] as const) {
    const profile = content.profiles.find(p => p.locale === locale)!;
    const html = renderToStaticMarkup(createElement(Portfolio, { locale }));
    expect(html).toContain(profile.name);
    expect(html).toContain(profile.introduction);
    expect(html).toContain(messages[locale].world.unavailable);
    expect(html).toMatch(/<button disabled=""[^>]*>Enter World<\/button>/);
    expect(html).toContain(`href="mailto:${profile.email}"`);
    expect(html).toContain('href="/cv/"');
    expect(html).not.toContain('<section');
    expect(html.match(/>Quick Portfolio<\/span>/g)).toHaveLength(1);
    expect(html.indexOf('class="world-viewport"')).toBeLessThan(html.indexOf('class="world-hud"'));
    const quick = renderToStaticMarkup(createElement(Portfolio, { locale, quick: true }));
    expect(quick).toContain('id="projects"');
    expect(quick).toContain('id="contact"');
    expect(quick).not.toContain('class="welcome-shell"');
  }
});

it("renders every slug in both locales and lists each URL in the sitemap", async () => {
  expect(generateStaticParams()).toHaveLength(8);
  for (const p of content.projects) {
    expect(generateStaticParams()).toContainEqual({ locale: p.locale, slug: p.slug });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve(p) }));
    expect(html).toContain(p.title);
    expect(html).not.toContain("Draft");
    expect(html).toContain("TBD");
    expect(html.match(/<h2/g)).toHaveLength(11);
    expect(publicPaths()).toContain(`/${p.locale}/projects/${p.slug}/`);
  }
});

it("shows source links only for real repo URLs", () => {
  for (const p of content.projects) {
    const html = renderToStaticMarkup(createElement(SourceLink, { project: p }));
    if (p.repoUrl === "TBD") expect(html).toBe("");
    else expect(html).toContain(`href="${p.repoUrl}"`);
    expect(renderToStaticMarkup(createElement(SourceLink, { project: { ...p, repoUrl: "TBD" } }))).toBe("");
  }
});

it("labels the Partner Gateway evidence as a Lab demo with its public URL", () => {
  const p = content.projects.find(p => p.slug === "partner-data-gateway-azure")!;
  const html = renderToStaticMarkup(createElement(ProjectEvidence, { project: p }));
  expect(html).toContain("Lab · demo");
  expect(html).toContain(content.evidence.find(e => e.id === p.evidence[0])!.publicUrl);
});

it("provides matching canonical and bilingual alternates", () => {
  for (const locale of ["en", "vi"] as const) {
    const metadata = pageMetadata(locale, "privacy/");
    expect(metadata.alternates?.canonical).toBe(`/${locale}/privacy/`);
    expect(metadata.alternates?.languages).toEqual({ en: "/en/privacy/", vi: "/vi/privacy/" });
    expect(publicPaths()).toContain(`/${locale}/privacy/`);
    expect(publicPaths()).toContain(`/${locale}/quick/`);
  }
});


it("escapes less-than characters in rendered JSON-LD without changing the data", async () => {
  const name = "Example </script><script>alert(1)</script>";
  vi.resetModules();
  vi.doMock("@/content", () => ({
    content: {
      ...content,
      profiles: content.profiles.map(p => ({ ...p, name })),
    },
  }));
  try {
    const { Portfolio } = await import("@/components/portfolio/Portfolio");
    for (const locale of ["en", "vi"] as const) {
      for (const quick of [false, true]) {
        const html = renderToStaticMarkup(createElement(Portfolio, { locale, quick }));
        const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
        expect(json).toBeDefined();
        expect(json).not.toContain("<");
        expect(json).toContain("\\u003c");
        expect(JSON.parse(json!).mainEntity.name).toBe(name);
      }
    }
  } finally {
    vi.doUnmock("@/content");
    vi.resetModules();
  }
});
