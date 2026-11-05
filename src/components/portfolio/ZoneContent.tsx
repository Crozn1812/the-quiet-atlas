/* Static navigation keeps links in the current tab without a client router. */
/* eslint-disable @next/next/no-html-link-for-pages */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { EvidenceView, SourceLinkView } from "./ProjectLinkViews";
import { ProjectHeading } from "./ProjectHeading";
import type { WorldContentData, WorldProject } from "./worldContentData";
import styles from "./zone-content.module.css";

const zones = {
  "first-light": "The First Light",
  roots: "The Roots",
  workshop: "The Workshop",
  milestones: "The Milestones",
  "old-trail": "The Old Trail",
  horizon: "The Horizon",
  "quiet-shore": "The Quiet Shore",
  "last-postcard": "The Last Postcard",
};

// Draft placeholders stay in content, never in the public magazine.
function published(value?: string) {
  return value && !/\bTBD\b/i.test(value) ? value : "";
}

function Magazine({ zoneId, title, children }: {
  zoneId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.page} data-zone={zoneId}>
      <header className={styles.header}>
        <p className={styles.kicker}>{zones[zoneId as keyof typeof zones] ?? "The Quiet Atlas"}</p>
        <h1 className={styles.title}>{title}</h1>
      </header>
      <div className={styles.wash} aria-hidden="true" />
      <div className={styles.body}>{children}</div>
    </article>
  );
}

export function OverlayProject({ project, locale }: { project: WorldProject; locale: Locale }) {
  const evidence = project.evidence.filter(item => published(item.level));
  return (
    <article className={styles.page}>
      <ProjectHeading
        title={published(project.title)}
        statusLabel={published(project.statusLabel)}
      />
      <p>{published(project.summary)}</p>
      {evidence.length > 0 && <EvidenceView
        evidence={evidence}
        locale={locale}
      />}
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
  const vi = locale === "vi";
  const quick = (
    <a href={`/${locale}/quick/`}>
      {vi ? "Xem Quick Portfolio" : "View Quick Portfolio"}
    </a>
  );
  const cv = <a href="/cv/">{vi ? "Tải CV" : "Download CV"}</a>;
  const unwritten = vi ? "Duy đang viết phần này." : "Duy is still writing this page.";
  const page = (title: string, body: ReactNode) => (
    <Magazine zoneId={zoneId} title={title}>{body}</Magazine>
  );

  if (zoneId === "first-light") {
    const p = data.profile;
    return page(published(p.name), (
      <>
        <p className={styles.lead}>{[published(p.role), published(p.level)].filter(Boolean).join(" · ")}</p>
        <p>{published(p.introduction)}</p>
        <nav className={styles.links} aria-label={vi ? "Hồ sơ" : "Profile"}>{quick}{cv}</nav>
      </>
    ));
  }
  if (zoneId === "workshop") {
    const makingOf = (project: WorldProject) => project.slug === "the-making-of-the-quiet-atlas"
      || project.title === "The Making of The Quiet Atlas";
    // Keep source order, placing an actual making-of case study last if supplied.
    const projects = [...data.projects.filter(project => !makingOf(project)), ...data.projects.filter(makingOf)];
    return page(messages[locale].projects, (
      <div className={styles.entries}>
        {projects.filter(project => published(project.title)).map(project => (
          <section key={project.id}>
            <h2><a href={`/${locale}/projects/${project.slug}/`}>{project.title}</a></h2>
            {published(project.statusLabel) && <p className={styles.meta}>{project.statusLabel}</p>}
            {published(project.summary) && <p>{project.summary}</p>}
          </section>
        ))}
      </div>
    ));
  }

  if (zoneId === "old-trail") {
    const experience = data.profile.experience ?? [];
    const education = data.profile.education ?? [];
    const month = (value: string) => published(value) ? `${value.slice(5)}/${value.slice(0, 4)}` : "";
    return page(vi ? "Hành trình" : "Journey", (
      <>
        <ol className={styles.timeline}>
          {experience.map((item, index) => (
            <li key={`experience-${index}`}>
              <h2>{[published(item.employer), published(item.title)].filter(Boolean).join(" · ")}</h2>
              <p className={styles.meta}>
                {[month(item.start), item.end === "present" ? (vi ? "nay" : "present") : month(item.end)].filter(Boolean).join(" – ")}
              </p>
              {published(item.summary) && <p>{item.summary}</p>}
            </li>
          ))}
          {education.map((item, index) => (
            <li key={`education-${index}`}>
              <h2>{published(item.institution)}</h2>
              <p>{published(item.program)}</p>
              <p className={styles.meta}>
                {item.status === "in-progress" ? (vi ? "Dự kiến tốt nghiệp" : "Expected graduation") : (vi ? "Đã tốt nghiệp" : "Graduated")}
                {published(item.expectedGraduation) && <>: {item.expectedGraduation}</>}
              </p>
            </li>
          ))}
        </ol>
        {experience.length + education.length === 0 && <p>{unwritten}</p>}
        {quick}
      </>
    ));
  }

  if (zoneId === "last-postcard") {
    const p = data.profile;
    return page(vi ? "Giữ liên lạc" : "Keep in touch", (
      <div className={styles.postcard}>
        <section>
          <h2>{vi ? "Từ" : "From"}</h2>
          <p className={styles.lead}>{published(p.name)}</p>
          <p>{published(p.role)}</p>
          {quick}
        </section>
        <section className={styles.address}>
          <h2>{vi ? "Liên hệ & CV" : "Contact & CV"}</h2>
          <address className={styles.links}>
            {published(p.email) && <a href={`mailto:${p.email}`}>{p.email}</a>}
            {p.phone && published(p.phone) && <a href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a>}
            {published(p.githubUrl) && <a href={p.githubUrl}>GitHub</a>}
            {published(p.linkedinUrl) && <a href={p.linkedinUrl}>LinkedIn</a>}
            {cv}
          </address>
        </section>
      </div>
    ));
  }

  const optionalZones = {
    roots: { items: data.skills, title: vi ? "Kỹ năng" : "Skills" },
    milestones: { items: data.certificates, title: vi ? "Chứng chỉ & học tập" : "Certificates & learning" },
    horizon: { items: data.direction, title: vi ? "Định hướng" : "Future direction" },
    "quiet-shore": { items: data.hobbies, title: vi ? "Sở thích & tính cách" : "Hobbies & personality" },
  };
  const optional = optionalZones[zoneId as keyof typeof optionalZones];
  const items = optional?.items?.filter(item => published(item.title) && published(item.description)) ?? [];
  const title = items.length > 0 ? optional?.title : zones[zoneId as keyof typeof zones];
  return page(title ?? "The Quiet Atlas", (
    <>
      {items.length > 0 ? (
        <ul className={styles.entries}>
          {items.map((item, index) => <li key={index}><h2>{item.title}</h2><p>{item.description}</p></li>)}
        </ul>
      ) : <p className={styles.lead}>{unwritten}</p>}
      {quick}
    </>
  ));
}
