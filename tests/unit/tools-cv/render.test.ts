import { expect, it } from "vitest";
import { content } from "@/content";
// @ts-expect-error Node tool is JavaScript, executed directly without a build step.
import { cvHtml, cleanMetadata } from "../../../tools/cv/render.mjs";
import { listenWorldError } from "@/components/portfolio/worldError";

it("renders public bilingual drafts, escapes text, and omits TBD phone", () => {
  for (const locale of ["en", "vi"]) {
    const html = cvHtml(content, locale);
    expect(html).toContain("Draft");
    expect(html).toContain("TBD");
    expect(html).not.toContain("<p>TBD</p>\n    <p>GitHub");
    expect(html).toContain(content.profiles.find(p => p.locale === locale)!.name);
  }
  const data = structuredClone(content);
  data.profiles[0]!.phone = "<phone>";
  expect(cvHtml(data, "en")).toContain("&lt;phone&gt;");
});

it("renders the CV phone and Intern level from public content in both locales", () => {
  for (const locale of ["en", "vi"]) {
    const profile = content.profiles.find(p => p.locale === locale)!;
    expect(profile.phone).toBe("083 418 4916");
    const html = cvHtml(content, locale);
    expect(html).toContain("<p>083 418 4916</p>");
    expect(html).toContain("Cloud &amp; DevOps Engineer · Intern");
  }
});

it("clears metadata without changing PDF offsets", () => {
  const input = Buffer.from("/Title (CV) /Author (machine) /Creator (path) /Producer (browser) /CreationDate (date)");
  const result = cleanMetadata(input);
  expect(result.length).toBe(input.length);
  expect(result.toString()).not.toMatch(/machine|path|browser|date/);
  expect(result.toString()).toContain("/Title (CV)");
});

it("Q15 recovers immediately on the container and removes its listener", () => {
  const container = new EventTarget();
  let mode = "world";
  let mounted = true;
  const generation = { current: 1 };
  const teardown: { current: (() => void) | undefined } = {
    current: () => { mounted = false; },
  };
  const remove = listenWorldError(container, {
    generation,
    teardown,
    recover: () => { mode = "recoverableError"; },
  });
  container.dispatchEvent(new Event("tqa:world-error"));
  expect(mounted).toBe(false);
  expect(mode).toBe("recoverableError");
  expect(generation.current).toBe(2);
  expect(teardown.current).toBeUndefined();
  remove();
  mode = "welcome";
  container.dispatchEvent(new Event("tqa:world-error"));
  expect(mode).toBe("welcome");
});

it("marks only projects referencing Lab evidence as demo in both CV locales", () => {
  for (const locale of ["en", "vi"]) {
    const data = structuredClone(content);
    const project = data.projects.find(p => p.locale === locale)!;
    const evidence = data.evidence[0]!;
    evidence.level = "Lab";
    project.evidence = [evidence.id];
    data.projects = [project];
    expect(cvHtml(data, locale)).toContain('Repository: ' + project.repoUrl + ' · demo</p>');
    evidence.level = "Verified";
    expect(cvHtml(data, locale)).not.toContain('· demo');
    project.evidence = [];
    evidence.level = "Lab";
    expect(cvHtml(data, locale)).not.toContain('· demo');
  }
});

it("renders LinkedIn, the new PDG title, the HPT summary and no course code in both CV locales", () => {
  for (const locale of ["en", "vi"]) {
    const html = cvHtml(content, locale);
    expect(html).toContain("LinkedIn: https://www.linkedin.com/in/nguyenhuubaoduy");
    expect(html).toContain("Secure Partner Data Sharing Portal");
    expect(html).not.toContain("Partner Data Gateway Azure");
    expect(html).not.toContain("DO2603");
    expect(html).toContain("Microsoft Fabric");
  }
});

it("renders experience and education with the period in both CV locales", () => {
  const en = cvHtml(content, "en");
  expect(en).toContain("<h2>Experience</h2>");
  expect(en).toContain("Cloud &amp; DevOps Intern · HPT");
  expect(en).toContain("<p>07/2026 – present</p>");
  expect(en).toContain("<h2>Education</h2>");
  expect(en).toContain("Posts and Telecommunications Institute of Technology (PTIT)");
  expect(en).toContain("Network and Systems Engineer");
  expect(en).toContain("Expected graduation: 2027 · in progress");
  const vi = cvHtml(content, "vi");
  expect(vi).toContain("<h2>Kinh nghiệm</h2>");
  expect(vi).toContain("<p>07/2026 – nay</p>");
  expect(vi).toContain("<h2>Học vấn</h2>");
  expect(vi).toContain("Kỹ sư Mạng và Hệ thống");
  expect(vi).toContain("Dự kiến tốt nghiệp: 2027 · đang học");
  expect(vi).not.toMatch(/6 tháng|6 months/);
});

it("omits experience and education sections when empty and escapes values", () => {
  const data = structuredClone(content);
  data.profiles[0]!.experience = [];
  data.profiles[0]!.education = [];
  const locale = data.profiles[0]!.locale;
  expect(cvHtml(data, locale)).not.toMatch(/<h2>(Experience|Kinh nghiệm|Education|Học vấn)<\/h2>/);
  data.profiles[0]!.education = [{ institution: "<i>", program: "p", expectedGraduation: "2027", status: "graduated" }];
  expect(cvHtml(data, locale)).toContain("&lt;i&gt;");
});
