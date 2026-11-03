import { describe, expect, it } from "vitest";
import { content } from "@/content";
import { validateContent, projectSchema, projectStatusLabel, publicUrlSchema } from "@/content/schema";

describe("content build contract", () => {
  it("accepts the placeholder dataset", () => expect(() => validateContent(content)).not.toThrow());
  it("rejects duplicate slugs within a locale", () => {
    const data = structuredClone(content); data.projects.push(data.projects[0]!);
    expect(() => validateContent(data)).toThrow("Duplicate slug");
  });
  it("rejects missing required fields", () => {
    const data = structuredClone(content); Reflect.deleteProperty(data.projects[0]!, "context");
    expect(() => validateContent(data)).toThrow();
  });
  it("rejects missing project translations", () => {
    const data = structuredClone(content); data.projects.pop();
    expect(() => validateContent(data)).toThrow("Missing project locale key");
  });
  it("rejects missing profile locale", () => {
    const data = structuredClone(content); data.profiles.pop();
    expect(() => validateContent(data)).toThrow("profile locale");
  });
  it("rejects a missing key in one translation", () => {
    const data = structuredClone(content); Reflect.deleteProperty(data.profiles[1]!, "introduction");
    expect(() => validateContent(data)).toThrow();
  });
  it("rejects unknown evidence references", () => {
    const data = structuredClone(content); data.projects[0]!.evidence.push("missing");
    expect(() => validateContent(data)).toThrow("Unknown evidence ID");
  });
  it("rejects invalid statuses", () => {
    const data = structuredClone(content); Reflect.set(data.projects[0]!, "status", "finished");
    expect(() => validateContent(data)).toThrow();
    expect(() => projectSchema.parse(content.projects[0])).toThrow();
  });
  it.each(["http://github.com/example", "https://example.com", "https://github.com.evil.test", "javascript:alert(1)", "https://user:pass@github.com", "//github.com"])("rejects URL %s", url => {
    const data = structuredClone(content); data.profiles[0]!.cvUrl = url;
    expect(() => validateContent(data)).toThrow();
  });
  it.each(["https://github.com", "https://linkedin.com", "mailto:duybao09012004@gmail.com", "TBD"])("accepts allowed URL %s", url => expect(publicUrlSchema.safeParse(url).success).toBe(true));
  it("never labels unapproved content completed", () => {
    expect(projectStatusLabel({ reviewStatus: "draft", status: "completed" })).toBe("Draft");
    expect(projectStatusLabel({ reviewStatus: "in-review", status: "completed" })).toBe("Draft");
  });
  it("rejects approval of a TBD status", () => {
    const data = structuredClone(content); data.projects[0]!.reviewStatus = "approved";
    expect(() => validateContent(data)).toThrow();
  });
});
