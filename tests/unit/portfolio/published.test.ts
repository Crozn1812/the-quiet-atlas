import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { content } from "@/content";
import { CaseStudy } from "@/components/portfolio/CaseStudy";
import { QuickPortfolio } from "@/components/portfolio/QuickPortfolio";
import { EvidenceView, SourceLinkView } from "@/components/portfolio/ProjectLinkViews";
import { published } from "@/components/portfolio/published";

it("keeps supplied sentences verbatim and removes only unfinished draft sentences", () => {
  const known = "A real result. The environment no longer exists, so nothing can be re-run.";
  expect(published(known)).toBe(known);
  expect(published("A real result. Personal reflection: TBD. The environment no longer exists, so nothing can be re-run."))
    .toBe(known);
  expect(published("Ngân sách: TBD. Giới hạn context 512 token."))
    .toBe("Giới hạn context 512 token.");
  expect(published("Budget TBD; date TBD.")).toBe("");
});

describe.each(["en", "vi"] as const)("public portfolio %s", locale => {
  it("renders Quick and every supplied case study without placeholders while preserving known sentences", () => {
    const quick = renderToStaticMarkup(createElement(QuickPortfolio, { locale }));
    expect(quick).not.toMatch(/\bTBD\b/i);
    for (const project of content.projects.filter(p => p.locale === locale)) {
      const html = renderToStaticMarkup(createElement(CaseStudy, { project }));
      expect(html).not.toMatch(/\bTBD\b/i);
      // Architecture and results contain approved source qualifications; retain every supplied character.
      for (const value of [project.title, project.architecture, project.results]) {
        const escaped = renderToStaticMarkup(createElement("span", null, value)).slice(6, -7);
        expect(html).toContain(escaped);
      }
      if (project.repoUrl === "TBD") expect(html).not.toContain('>Source</a>');
      else expect(html).toContain(`href="${project.repoUrl}"`);
    }
  });

  it("omits unknown evidence and source links while retaining supplied Lab qualifications", () => {
    expect(renderToStaticMarkup(createElement(SourceLinkView, { repoUrl: "TBD", locale }))).toBe("");
    expect(renderToStaticMarkup(createElement(EvidenceView, { evidence: [], locale }))).toBe("");
    expect(renderToStaticMarkup(createElement(EvidenceView, { evidence: [{ level: "TBD", publicUrl: "TBD" }], locale }))).toBe("");
    const lab = content.evidence.find(e => e.level === "Lab")!;
    const html = renderToStaticMarkup(createElement(EvidenceView, { evidence: [lab], locale }));
    expect(html).toContain("Lab · demo");
    expect(html).toContain(`href="${lab.publicUrl}"`);
    const scope = locale === "en" ? lab.scopeEn : lab.scope;
    expect(html).toContain(scope);
    const unlinked = renderToStaticMarkup(createElement(EvidenceView, {
      evidence: [{ ...lab, publicUrl: "TBD" }], locale,
    }));
    expect(unlinked).toContain("Lab · demo");
    expect(unlinked).toContain(scope);
    expect(unlinked).toContain(locale === "en" ? lab.claimEn : lab.claim);
    expect(unlinked).not.toMatch(/\bTBD\b|<a\b/);
  });
});
