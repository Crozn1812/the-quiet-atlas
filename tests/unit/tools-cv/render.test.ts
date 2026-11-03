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
