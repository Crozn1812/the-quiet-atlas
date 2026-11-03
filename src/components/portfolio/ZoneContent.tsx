import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { EvidenceView, SourceLinkView } from "./ProjectLinkViews";
import { ProjectHeading } from "./ProjectHeading";
import type { WorldContentData, WorldProject } from "./worldContentData";

export function OverlayProject({ project, locale }: { project: WorldProject; locale: Locale }) {
  return (
    <article>
      <ProjectHeading
        title={project.title}
        statusLabel={project.statusLabel}
      />
      <p>{project.summary}</p>
      <EvidenceView
        evidence={project.evidence}
      />
      <SourceLinkView
        repoUrl={project.repoUrl}
        locale={locale}
      />
    </article>
  );
}

export function ZoneContent({ locale, zoneId, data }: {
  locale: Locale;
  zoneId: string;
  data: WorldContentData;
}) {
  if (zoneId === "first-light") {
    const p = data.profile;
    return (
      <>
        <h1>{p.name}</h1>
        <p>{p.role} · {p.level}</p>
        <p>{p.introduction}</p>
      </>
    );
  }
  if (zoneId === "workshop") {
    return (
      <section>
        <h2>{messages[locale].projects}</h2>
        {data.projects.map(project => (
          <article
            key={project.id}
          >
            <h3>
              <a
                href={`/${locale}/projects/${project.slug}/`}
              >
                {project.title}
              </a>
            </h3>
            <p>{project.statusLabel}</p>
            <p>{project.summary}</p>
          </article>
        ))}
      </section>
    );
  }
  return (
    <>
      <p>{locale === "vi" ? "Đang xây dựng" : "Under construction"}</p>
      <a
        href={`/${locale}/quick/`}
      >
        Quick Portfolio
      </a>
    </>
  );
}
