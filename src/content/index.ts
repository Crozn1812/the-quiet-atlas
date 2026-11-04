import evidence from "./evidence.json";
import { validateContent } from "./schema";
import { locales } from "@/i18n/locales";
const titles=[
  "CMS DevOps Platform AWS EKS","Partner Data Gateway Azure","InsightHub RAG","AWS Sales Data Pipeline"
];
const slugs=[
  "cms-devops-platform-aws-eks","partner-data-gateway-azure","insighthub-rag","aws-sales-data-pipeline"
];
// Repo công khai Duy cung cấp ngày 2026-11-04; trạng thái dự án vẫn TBD.
const repos: Record<string, { repoUrl: string; evidence: string[] }>={
  "aws-sales-data-pipeline": {
    repoUrl: "https://github.com/Crozn1812/AWS-Sales-Data-Pipeline",
    evidence: ["ev-repo-aws-sales-data-pipeline"]
  },
  "insighthub-rag": {
    repoUrl: "https://github.com/Crozn1812/insighthub_devops",
    evidence: ["ev-repo-insighthub-rag"]
  },
  "partner-data-gateway-azure": {
    repoUrl: "https://github.com/Crozn1812/azure-api-gateway-dsr-ai",
    evidence: ["ev-repo-partner-data-gateway-demo"]
  }
};
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
    // Số theo CV PDF Duy gửi; Duy chọn hiện cả trên web (L2-010, 2026-11-04).
    phone: "083 418 4916",
    cvUrl: "TBD",
    githubUrl: "https://github.com/Crozn1812",
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
    evidence: repos[slugs[i]!]?.evidence ?? [],
    metrics: [],
    repoUrl: repos[slugs[i]!]?.repoUrl ?? "TBD",
    ...review,
    translationStatus: "TBD",
    contentVersion: "TBD"
  }))),
  evidence,
});
