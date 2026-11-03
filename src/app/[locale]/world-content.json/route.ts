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
