import { z } from "zod";
const text=z.string().trim().min(1);
export const publicUrlSchema=text.refine(value => {
  if(value==="TBD")
    return true;
  try {
    const u=new URL(value);
    if(u.protocol==="mailto:")
      return /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(u.pathname)&&!u.search&&!u.hash;
    return u.protocol==="https:"&&[
      "github.com","linkedin.com"
    ].includes(u.hostname)&&!u.username&&!u.password&&!u.port;
  }
  catch {
    return false;
  }
},"URL outside allowlist");
const locale=z.enum([
  "en","vi"
]);
const review={
  reviewStatus: z.enum([
    "draft","in-review","approved"
  ]),
  publicApproval: z.union([
    z.boolean(),z.literal("TBD")
  ]),
  lastReviewedAt: text
};
export const profileSchema=z.object({
  locale,
  name: text,
  role: text,
  level: text,
  introduction: text,
  email: z.email(),
  phone: text,
  cvUrl: publicUrlSchema,
  githubUrl: publicUrlSchema,
  linkedinUrl: publicUrlSchema,
  ...review
});
export const evidenceSchema=z.object({
  id: text,
  claim: text,
  level: z.enum([
    "Verified","Internal","Lab","Estimate","TBD"
  ]),
  description: text,
  publicUrl: publicUrlSchema,
  originalLocation: text,
  date: text,
  scope: text,
  approvedBy: text,
  approvedAt: text
});
export const projectSchema=z.object({
  id: text,
  slug: text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  locale,
  title: text,
  summary: text,
  status: z.enum([
    "planned","in-progress","completed","archived"
  ]),
  context: text,
  problem: text,
  constraints: text,
  myRole: text,
  contributions: text,
  teamContext: text,
  architecture: text,
  decisions: text,
  alternatives: text,
  implementation: text,
  validation: text,
  results: text,
  lessons: text,
  evidence: z.array(text),
  metrics: z.array(z.object({
    value: text,
    unit: text,
    method: text,
    environment: text,
    measuredAt: text,
    source: publicUrlSchema
  })),
  repoUrl: publicUrlSchema,
  ...review,
  translationStatus: z.enum([
    "draft","approved","TBD"
  ]),
  contentVersion: text,
});
// Unknown status remains an explicitly separate draft placeholder.
export const projectPlaceholderSchema=projectSchema.omit({
  status: true
}).extend({
  status: z.literal("TBD"),
  reviewStatus: z.literal("draft")
});
export const contentSchema=z.object({
  profiles: z.array(profileSchema),
  projects: z.array(z.union([
    projectSchema,projectPlaceholderSchema
  ])),
  evidence: z.array(evidenceSchema)
}).superRefine((data,ctx) => {
  const issue=(message: string) => ctx.addIssue({
    code: "custom",
    message
  });
  const ids=new Set(data.evidence.map(e => e.id));
  if(ids.size!==data.evidence.length)
    issue("Duplicate evidence ID");
  for(const lang of [
    "en","vi"
  ]) {
    if(data.profiles.filter(p => p.locale===lang).length!==1)
      issue("Missing or duplicate profile locale");
    const projects=data.projects.filter(p => p.locale===lang);
    if(new Set(projects.map(p => p.slug)).size!==projects.length)
      issue("Duplicate slug");
    if(new Set(projects.map(p => p.id)).size!==projects.length)
      issue("Duplicate project ID");
  }
  for(const p of data.projects) {
    for(const lang of [
      "en","vi"
    ])
      if(!data.projects.some(q => q.id===p.id&&q.slug===p.slug&&q.locale===lang))
        issue("Missing project locale key");
    for(const id of p.evidence)
      if(!ids.has(id))
        issue("Unknown evidence ID");
  }
});
export function validateContent(input: unknown) {
  return contentSchema.parse(input);
}
export function projectStatusLabel(p: {
  reviewStatus: string;
  status: string;
}) {
  return p.reviewStatus==="approved"? p.status:"Draft";
}
