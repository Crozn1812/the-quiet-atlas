import { content } from "@/content";
import { projectStatusLabel } from "@/content/schema";
import { messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import { ProjectEvidence, SourceLink } from "./ProjectLinks";

export function ProfileContent({ locale }: { locale: Locale }) {
  const p = content.profiles.find(p => p.locale === locale)!;
  return (
    <>
      <h1>{p.name}</h1>
      <p>{p.role} · {p.level}</p>
      {p.reviewStatus !== "approved" && <p>Draft</p>}
      <p>{p.introduction}</p>
    </>
  );
}

export function ProjectsContent({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return (
    <section
      aria-labelledby="projects"
    >
      <h2 id="projects">{t.projects}</h2>
      {content.projects.filter(p => p.locale === locale).map(project => (
        <article key={project.id}>
          <h3>
            <a
              href={`/${locale}/projects/${project.slug}/`}
            >
              {project.title}
            </a>
          </h3>
          <p>{projectStatusLabel(project)}</p>
          <p>{project.summary}</p>
          <ProjectEvidence
            project={project}
          />
          <SourceLink
            project={project}
          />
        </article>
      ))}
    </section>
  );
}

export function ZoneContent({ locale, zoneId }: { locale: Locale; zoneId: string }) {
  if (zoneId === "first-light") {
    return <ProfileContent locale={locale} />;
  }
  if (zoneId === "workshop") {
    return <ProjectsContent locale={locale} />;
  }
  return (
    <>
      <p>{locale === "vi" ? "Đang xây dựng" : "Under construction"}</p>
      <a href={`/${locale}/quick/`}>Quick Portfolio</a>
    </>
  );
}
