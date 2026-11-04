import { describe, expect, it } from "vitest";
import { content } from "@/content";
import { validateContent, projectSchema, projectStatusLabel, publicUrlSchema } from "@/content/schema";

describe("content build contract", () => {
  it("accepts the shipped dataset", () => expect(() => validateContent(content)).not.toThrow());
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
    expect(() => projectSchema.parse({ ...content.projects[0]!, status: "TBD" })).toThrow();
  });
  it.each(["http://github.com/example", "https://example.com", "https://github.com.evil.test", "javascript:alert(1)", "https://user:pass@github.com", "//github.com"])("rejects URL %s", url => {
    const data = structuredClone(content); data.profiles[0]!.cvUrl = url;
    expect(() => validateContent(data)).toThrow();
  });
  it.each(["https://github.com", "https://linkedin.com", "https://www.linkedin.com/in/nguyenhuubaoduy", "mailto:duybao09012004@gmail.com", "TBD"])("accepts allowed URL %s", url => expect(publicUrlSchema.safeParse(url).success).toBe(true));
  it("never labels unapproved content completed", () => {
    expect(projectStatusLabel({ reviewStatus: "draft", status: "completed" })).toBe("Draft");
    expect(projectStatusLabel({ reviewStatus: "in-review", status: "completed" })).toBe("Draft");
  });
  it("rejects approval of a TBD status", () => {
    const data = structuredClone(content); Reflect.set(data.projects[0]!, "status", "TBD"); data.projects[0]!.reviewStatus = "approved";
    expect(() => validateContent(data)).toThrow();
  });
});

describe("profile experience and education (ADR 0010)", () => {
  it("ships HPT and PTIT in both locales", () => {
    for (const p of content.profiles) {
      expect(p.experience).toEqual([expect.objectContaining({ employer: "HPT", start: "2026-07", end: "present", evidence: [] })]);
      expect(p.experience[0]!.summary).not.toBe("TBD");
      expect(p.education).toEqual([expect.objectContaining({ expectedGraduation: "2027", status: "in-progress" })]);
    }
  });
  it.each(["2026-7", "2026/07", "2026-13", "2026-00", "07/2026", ""])("rejects start %s", start => {
    const data = structuredClone(content); data.profiles[0]!.experience[0]!.start = start;
    expect(() => validateContent(data)).toThrow();
  });
  it.each(["now", "Present", "2026", "2026-1"])("rejects end %s", end => {
    const data = structuredClone(content); Reflect.set(data.profiles[0]!.experience[0]!, "end", end);
    expect(() => validateContent(data)).toThrow();
  });
  it.each(["present", "TBD", "2026-12"])("accepts end %s", end => {
    const data = structuredClone(content); Reflect.set(data.profiles[0]!.experience[0]!, "end", end);
    expect(() => validateContent(data)).not.toThrow();
  });
  it("rejects end before start and unknown evidence", () => {
    const data = structuredClone(content); Reflect.set(data.profiles[0]!.experience[0]!, "end", "2026-01");
    expect(() => validateContent(data)).toThrow("ends before");
    const other = structuredClone(content); other.profiles[0]!.experience[0]!.evidence = ["missing"];
    expect(() => validateContent(other)).toThrow("Unknown evidence ID");
  });
  it("rejects bad graduation year and status, defaults missing arrays", () => {
    const data = structuredClone(content); data.profiles[0]!.education[0]!.expectedGraduation = "27";
    expect(() => validateContent(data)).toThrow();
    const status = structuredClone(content); Reflect.set(status.profiles[0]!.education[0]!, "status", "dropped");
    expect(() => validateContent(status)).toThrow();
    const bare = structuredClone(content); Reflect.deleteProperty(bare.profiles[0]!, "experience"); Reflect.deleteProperty(bare.profiles[0]!, "education");
    const parsed = validateContent(bare);
    expect(parsed.profiles[0]!.experience).toEqual([]);
    expect(parsed.profiles[0]!.education).toEqual([]);
  });
});

describe("L2-012 content from Duy's answers", () => {
  it("ships the LinkedIn URL, a Cloud DevOps Engineer intro of at most 25 words, and the HPT services", () => {
    for (const p of content.profiles) {
      expect(p.linkedinUrl).toBe("https://www.linkedin.com/in/nguyenhuubaoduy");
      expect(p.introduction).toContain("Cloud DevOps Engineer");
      expect(p.introduction.split(/s+/).length).toBeLessThanOrEqual(25);
      expect(p.level).toBe("Intern");
      expect(p.reviewStatus).toBe("draft");
      expect(p.experience[0]!.summary).toMatch(/API Management/);
      expect(p.experience[0]!.summary).toMatch(/Microsoft Fabric/);
      expect(p.experience[0]!.summary).toMatch(/Power Automate/);
    }
  });
  it("marks every project completed but still draft, and renames only the PDG title", () => {
    expect(content.projects).toHaveLength(8);
    for (const p of content.projects) {
      expect(p.status).toBe("completed");
      expect(p.reviewStatus).toBe("draft");
    }
    const pdg = content.projects.filter(p => p.slug === "partner-data-gateway-azure");
    expect(pdg.map(p => p.title)).toEqual(["Secure Partner Data Sharing Portal", "Secure Partner Data Sharing Portal"]);
  });
  it("never mentions the course code, the upstream repo or the fictional dataset name", () => {
    const text = JSON.stringify(content);
    expect(text).not.toMatch(/DO2603|congdinh2008|Shopmart/i);
  });
  it("describes the AWS pipeline trigger as EventBridge on fictional sample data (Q-16)", () => {
    for (const p of content.projects.filter(p => p.slug === "aws-sales-data-pipeline")) {
      expect(p.architecture).toContain("EventBridge");
      expect(p.context).toMatch(p.locale === "vi" ? /dữ liệu mẫu giả lập/ : /fictional sample data/);
    }
  });
  it("describes CMS with its low evidence level and no repository", () => {
    for (const p of content.projects.filter(p => p.slug === "cms-devops-platform-aws-eks")) {
      expect(p.repoUrl).toBe("TBD");
      expect(p.evidence).toEqual(["ev-cms-devops-platform-slides"]);
    }
  });
});

describe("bilingual evidence (ADR 0010 extension)", () => {
  it("gives every non-TBD evidence English claim and scope", () => {
    for (const e of content.evidence) {
      if (e.level !== "TBD") {
        expect(e.claimEn).toBeTruthy();
        expect(e.scopeEn).toBeTruthy();
      }
    }
  });
  it.each(["claimEn", "scopeEn"])("rejects non-TBD evidence without %s", key => {
    const data = structuredClone(content);
    const item = data.evidence.find(e => e.level !== "TBD")!;
    Reflect.deleteProperty(item, key);
    expect(() => validateContent(data)).toThrow("claimEn and scopeEn");
  });
  it("allows TBD evidence without English fields and descriptionEn to be optional", () => {
    const data = structuredClone(content);
    const item = data.evidence.find(e => e.level !== "TBD")!;
    Reflect.deleteProperty(item, "descriptionEn");
    expect(() => validateContent(data)).not.toThrow();
    const tbd = structuredClone(content);
    const e = tbd.evidence.find(x => x.level === "TBD")!;
    Reflect.deleteProperty(e, "claimEn"); Reflect.deleteProperty(e, "scopeEn");
    expect(() => validateContent(tbd)).not.toThrow();
  });
});
