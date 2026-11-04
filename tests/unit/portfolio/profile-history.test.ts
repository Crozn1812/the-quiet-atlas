import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { content } from "@/content";
import { ProfileHistory } from "@/components/portfolio/ProfileHistory";
import { QuickPortfolio } from "@/components/portfolio/QuickPortfolio";
import { EvidenceView } from "@/components/portfolio/ProjectLinkViews";

it("renders localized experience and education in Quick without a TBD summary", () => {
  for (const locale of ["en", "vi"] as const) {
    const html = renderToStaticMarkup(createElement(QuickPortfolio, { locale }));
    expect(html).toContain(`<h2 id="experience-title">${locale === "vi" ? "Kinh nghiệm" : "Experience"}</h2>`);
    expect(html).toContain(`<h2 id="education-title">${locale === "vi" ? "Học vấn" : "Education"}</h2>`);
    expect(html).toContain(`07/2026 – ${locale === "vi" ? "nay" : "present"}`);
    const profile = content.profiles.find(p => p.locale === locale)!;
    const history = renderToStaticMarkup(createElement(ProfileHistory, { profile, locale }));
    expect(history).toContain("HPT");
    expect(history).toContain("(PTIT)");
    expect(history).toContain("2027");
    expect(history).toContain(locale === "vi" ? "Dự kiến tốt nghiệp" : "Expected graduation");
    expect(history).not.toContain("TBD");
  }
});

it("handles closed dates, unknown ends, real summaries, graduates and empty lists", () => {
  const p = content.profiles[0]!;
  for (const end of ["2026-10", "TBD"]) {
    const profile = {
      ...p,
      experience: [{ ...p.experience[0]!, end, summary: "Supported cloud deployments" }],
      education: [{ ...p.education[0]!, status: "graduated" as const }],
    };
    for (const locale of ["en", "vi"] as const) {
      const html = renderToStaticMarkup(createElement(ProfileHistory, { profile, locale }));
      expect(html).toContain(`07/2026 – ${end === "TBD" ? "TBD" : "10/2026"}`);
      expect(html).toContain("Supported cloud deployments");
      expect(html).toContain(locale === "vi" ? "Đã tốt nghiệp: 2027" : "Graduated: 2027");
    }
  }
  expect(renderToStaticMarkup(createElement(ProfileHistory, {
    profile: { ...p, experience: [], education: [] }, locale: "en",
  }))).toBe("");
});

it("selects evidence translations per field and falls back when translations are absent", () => {
  const base = { level: "Lab", publicUrl: "https://github.com/example/demo", claim: "Bản gốc", scope: "Phạm vi gốc" };
  for (const locale of ["en", "vi"] as const) {
    for (const translation of [{}, { claimEn: "English claim" }, { scopeEn: "English scope" }, { claimEn: "English claim", scopeEn: "English scope" }]) {
      const html = renderToStaticMarkup(createElement(EvidenceView, { evidence: [{ ...base, ...translation }], locale }));
      expect(html).toContain(locale === "en" ? translation.claimEn ?? base.claim : base.claim);
      expect(html).toContain(locale === "en" ? translation.scopeEn ?? base.scope : base.scope);
      expect(html).toContain("Lab · demo");
      expect(html).toContain(`href="${base.publicUrl}"`);
      if (locale === "vi") expect(html).not.toContain("English");
    }
    expect(renderToStaticMarkup(createElement(EvidenceView, { evidence: [], locale }))).toContain("Evidence: TBD");
  }
});
