import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { content } from "@/content";
import { projectStatusLabel } from "@/content/schema";
import { OverlayProject, ZoneContent } from "@/components/portfolio/ZoneContent";
import type { WorldContentData } from "@/components/portfolio/worldContentData";
import type { Locale } from "@/i18n/locales";

const zones = ["first-light", "roots", "workshop", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"];
const optional = [
  ["roots", "skills"], ["milestones", "certificates"], ["horizon", "direction"], ["quiet-shore", "hobbies"],
] as const;

function fixture(locale: Locale): WorldContentData {
  const profile = content.profiles.find(p => p.locale === locale)!;
  return {
    profile: {
      name: profile.name, role: profile.role, level: profile.level, introduction: profile.introduction,
      email: profile.email, githubUrl: profile.githubUrl, linkedinUrl: profile.linkedinUrl,
      experience: profile.experience, education: profile.education,
    },
    projects: content.projects.filter(p => p.locale === locale).map(project => ({
      ...project, statusLabel: projectStatusLabel(project), evidence: [],
    })),
  };
}

function render(locale: Locale, zoneId: string, data = fixture(locale)) {
  return renderToStaticMarkup(createElement(ZoneContent, { locale, zoneId, data }));
}

function escaped(value: string) {
  return renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
}

describe.each(["en", "vi"] as const)("zone magazine (%s)", locale => {
  it.each(zones)("renders %s as an article with one h1 and decorative art", zoneId => {
    const html = render(locale, zoneId);
    expect(html).toMatch(/^<article\b/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*id="zone-content-title"[^>]*tabindex="-1"/);
    const svg = html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)!;
    expect(svg).toHaveLength(1);
    expect(svg[0]).toContain('aria-hidden="true"');
    expect(svg[0]).toContain('focusable="false"');
    expect(new TextEncoder().encode(svg[0]).byteLength).toBeLessThanOrEqual(4096);
    expect(svg[0]).not.toMatch(/<image\b|<foreignObject\b|<filter\b/);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1]!;
    expect(header.match(/<h[12]\b/g)).toHaveLength(1);
    const kicker = header.match(/<p[^>]*>(.*?)<\/p>/)![1];
    const title = header.match(/<h1[^>]*>(.*?)<\/h1>/)![1];
    expect(title).not.toBe(kicker);
    expect(html).not.toMatch(/Under construction|Đang xây dựng|TBD|<h3\b|<img\b|target=/);
  });

  it("keeps the public introduction and offers Quick and the CV page", () => {
    const data = fixture(locale);
    const html = render(locale, "first-light", data);
    for (const value of Object.values(data.profile).filter(value => typeof value === "string").slice(0, 4)) {
      expect(html).toContain(escaped(value));
    }
    expect(html).toContain(`href="/${locale}/quick/"`);
    expect(html).toContain('href="/cv/"');
    expect(html).toContain(locale === "vi" ? "Tải CV" : "Download CV");
  });

  it("renders every real project once and adds no fictional making-of", () => {
    const data = fixture(locale);
    const html = render(locale, "workshop", data);
    expect(html.match(/<h2\b/g)).toHaveLength(data.projects.length);
    for (const project of data.projects) {
      expect(html).toContain(escaped(project.title));
      expect(html).toContain(escaped(project.summary));
      expect(html).toContain(`href="/${locale}/projects/${project.slug}/"`);
    }
    expect(html).not.toContain("The Making of The Quiet Atlas");
  });

  it("places a supplied making-of case study last without duplicating it", () => {
    const data = fixture(locale);
    const making = {
      ...data.projects[0]!, id: "making", slug: "the-making-of-the-quiet-atlas", title: "The Making of The Quiet Atlas",
    };
    data.projects.unshift(making);
    const html = render(locale, "workshop", data);
    expect(html.match(/The Making of The Quiet Atlas/g)).toHaveLength(1);
    expect(html.lastIndexOf(making.title)).toBeGreaterThan(html.lastIndexOf(data.projects.at(-1)!.title));
    expect(data.projects[0]).toBe(making);
  });

  it("keeps all journey records and source ordering, wording and dates", () => {
    const data = fixture(locale);
    // Two records per group catch accidental reversal or interleaving.
    data.profile.experience = [...data.profile.experience!, {
      employer: "Test employer", title: "Test role", start: "2024-01", end: "2024-06", summary: "Test summary",
    }];
    data.profile.education = [...data.profile.education!, {
      institution: "Test school", program: "Test program", expectedGraduation: "2023", status: "graduated",
    }];
    const html = render(locale, "old-trail", data);
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(match => match[1]);
    expect(html.match(/<li\b/g)).toHaveLength(data.profile.experience.length + data.profile.education.length);
    expect(headings).toEqual([
      ...data.profile.experience.map(item => escaped(`${item.employer} · ${item.title}`)),
      ...data.profile.education.map(item => escaped(item.institution)),
    ]);
    for (const item of data.profile.experience) expect(html).toContain(escaped(item.summary));
    for (const item of data.profile.education) expect(html).toContain(escaped(item.program));
    expect(html).toContain(locale === "vi" ? "07/2026 – nay" : "07/2026 – present");
    expect(html).toContain("01/2024 – 06/2024");
    expect(html).toContain(locale === "vi" ? "Dự kiến tốt nghiệp: 2027" : "Expected graduation: 2027");
  });

  // Q-04: Duy chose to show the phone on the web as well as the CV (spec §4.4 lets the owner choose).
  it("shows the permitted contact links, including the phone Duy chose to publish", () => {
    const data = fixture(locale);
    const profile = content.profiles.find(p => p.locale === locale)!;
    Object.assign(data.profile, { phone: profile.phone, cvUrl: "TBD" });
    const html = render(locale, "last-postcard", data);
    for (const href of [`mailto:${profile.email}`, `tel:${profile.phone.replaceAll(" ", "")}`, profile.githubUrl, profile.linkedinUrl, "/cv/"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("<address");
    expect(html).not.toMatch(/TBD|target=/);
  });

  it.each(optional)("shows honest copy for %s when %s is absent or empty", (zoneId, field) => {
    const data = fixture(locale);
    for (const items of [undefined, []]) {
      data[field] = items;
      const html = render(locale, zoneId, data);
      expect(html).toContain(locale === "vi" ? "Duy đang viết phần này." : "Duy is still writing this page.");
      expect(html).toContain(`href="/${locale}/quick/"`);
    }
  });

  it.each(optional)("renders supplied %s data from %s without inventing copy", (zoneId, field) => {
    const data = fixture(locale);
    data[field] = [{ title: "Mục thử nghiệm", description: "Mô tả thử nghiệm có đủ dấu." }];
    const html = render(locale, zoneId, data);
    expect(html).toContain("<h2>Mục thử nghiệm</h2>");
    expect(html).toContain("Mô tả thử nghiệm có đủ dấu.");
    expect(html).not.toContain("Duy is still writing this page.");
    expect(html).not.toContain("Duy đang viết phần này.");
  });

  it("hides draft markers in optional entries, projects and contacts", () => {
    const data = fixture(locale);
    data.skills = [{ title: "TBD", description: "TBD" }, { title: "Draft skill", description: "Details: TBD." }];
    data.profile.githubUrl = "TBD";
    data.profile.linkedinUrl = "TBD";
    data.profile.email = "TBD";
    data.projects[0]!.summary = "Scope: TBD.";
    data.projects[0]!.statusLabel = "TBD";
    for (const zoneId of ["roots", "workshop", "last-postcard"]) {
      expect(render(locale, zoneId, data)).not.toContain("TBD");
    }
    expect(renderToStaticMarkup(createElement(OverlayProject, { locale, project: data.projects[0]! }))).not.toContain("TBD");
  });
});

it("draws a distinct illustration for each zone", () => {
  const drawings = zones.map(zoneId => render("en", zoneId).match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)![0]);
  expect(new Set(drawings).size).toBe(zones.length);
});
