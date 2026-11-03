import evidence from "./evidence.json";
import { validateContent } from "./schema";
import { locales } from "@/i18n/locales";
const titles=[
  "CMS DevOps Platform AWS EKS","Partner Data Gateway Azure","InsightHub RAG","AWS Sales Data Pipeline"
];
const slugs=[
  "cms-devops-platform-aws-eks","partner-data-gateway-azure","insighthub-rag","aws-sales-data-pipeline"
];
const review={
  reviewStatus: "draft",
  publicApproval: "TBD",
  lastReviewedAt: "TBD"
};
export const content=validateContent({
  profiles: locales.map(locale => ({
    locale,
    name: locale==="vi"? "Nguyễn Hữu Bảo Duy":"Nguyen Huu Bao Duy",
    role: "Cloud & DevOps Engineer",
    level: "Intern",
    introduction: "TBD",
    email: "duybao09012004@gmail.com",
    phone: "TBD",
    cvUrl: "TBD",
    githubUrl: "TBD",
    linkedinUrl: "TBD",
    ...review
  })),
  projects: locales.flatMap(locale => titles.map((title,i) => ({
    id: slugs[i],
    slug: slugs[i],
    locale,
    title,
    summary: "TBD",
    status: "TBD",
    context: "TBD",
    problem: "TBD",
    constraints: "TBD",
    myRole: "TBD",
    contributions: "TBD",
    teamContext: "TBD",
    architecture: "TBD",
    decisions: "TBD",
    alternatives: "TBD",
    implementation: "TBD",
    validation: "TBD",
    results: "TBD",
    lessons: "TBD",
    evidence: [],
    metrics: [],
    repoUrl: "TBD",
    ...review,
    translationStatus: "TBD",
    contentVersion: "TBD"
  }))),
  evidence,
});
