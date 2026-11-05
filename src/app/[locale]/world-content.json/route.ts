import { content } from "@/content";
import { projectStatusLabel } from "@/content/schema";
import { isLocale, locales } from "@/i18n/locales";
import type { WorldContentData } from "@/components/portfolio/worldContentData";

export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}

export async function GET(_request: Request, { params }: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    return new Response(null, { status: 404 });
  }
  const profile = content.profiles.find(p => p.locale === locale)!;
  const data: WorldContentData = {
    profile: {
      name: profile.name,
      role: profile.role,
      level: profile.level,
      introduction: profile.introduction,
      // B2-115 (Lead): public contact layer only — the phone number stays in the CV (spec §4.4).
      email: profile.email,
      githubUrl: profile.githubUrl,
      linkedinUrl: profile.linkedinUrl,
      experience: profile.experience.map(({ employer, title, start, end, summary }) => ({ employer, title, start, end, summary })),
      education: profile.education.map(({ institution, program, expectedGraduation, status }) => ({ institution, program, expectedGraduation, status })),
    },
    projects: content.projects.filter(p => p.locale === locale).map(project => ({
      id: project.id,
      slug: project.slug,
      title: project.title,
      summary: project.summary,
      statusLabel: projectStatusLabel(project),
      repoUrl: project.repoUrl,
      evidence: project.evidence.map(id => {
        const evidence = content.evidence.find(e => e.id === id)!;
        return { level: evidence.level, publicUrl: evidence.publicUrl };
      }),
    })),
  };
  return Response.json(data);
}
