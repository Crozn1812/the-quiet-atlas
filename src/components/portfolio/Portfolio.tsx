import { portfolioCopy } from "@/i18n/portfolio";
import { ProjectEvidence, SourceLink } from "./ProjectLinks";
import { content } from "@/content";
import { projectStatusLabel } from "@/content/schema";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { WorldEntry } from "./WorldEntry";

export function Portfolio({ locale, quick = false }: {
  locale: Locale;
  quick?: boolean;
}) {
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name: p.name,
              jobTitle: p.role,
              email: p.email,
              ...(p.githubUrl !== "TBD" ? { url: p.githubUrl } : {}),
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
      <nav aria-label="Language">
        <a
          href={quick ? "/en/quick/" : "/en/"}
          hrefLang="en"
        >
          English
        </a>
        <span>·</span>
        <a
          href={quick ? "/vi/quick/" : "/vi/"}
          hrefLang="vi"
        >
          Tiếng Việt
        </a>
      </nav>
      <p>The Quiet Atlas{quick ? " / Quick Portfolio" : ""}</p>
      <h1>{p.name}</h1>
      <p>{p.role} · {p.level}</p>
      {p.reviewStatus !== "approved" && <p>Draft</p>}
      <p>{p.introduction}</p>
      {!quick && (
        <WorldEntry
          locale={locale}
          copy={t.world}
        />
      )}
      <nav aria-label="Portfolio">
        {quick && <a href={`/${locale}/`}>{t.home}</a>}
        <a href="#cv">CV · TBD</a>
      </nav>
      {quick && (
        <section aria-labelledby="projects">
          <h2 id="projects">{t.projects}</h2>
          {content.projects.filter(p => p.locale === locale).map(project => (
            <article key={project.id}>
              <h3>
                <a href={`/${locale}/projects/${project.slug}/`}>{project.title}</a>
              </h3>
              <p>{projectStatusLabel(project)}</p>
              <p>{project.summary}</p>
              <ProjectEvidence project={project} />
              <SourceLink project={project} />
            </article>
          ))}
        </section>
      )}
      <a href={`/${locale}/privacy/`}>{portfolioCopy[locale].privacy}</a>
      <section
        id="cv"
        aria-labelledby="cv-title"
      >
        <h2 id="cv-title">CV</h2>
        <p>{t.cvPending}: TBD</p>
        <button
          disabled
          aria-label={t.cvPending}
        >
          CV · TBD
        </button>
      </section>
      <section aria-labelledby="contact">
        <h2 id="contact">{t.contact}</h2>
        <a href={`mailto:${p.email}`}>{p.email}</a>
        <p>{t.phone}: {p.phone}</p>
        <p>GitHub: {p.githubUrl !== "TBD" ? <a href={p.githubUrl}>GitHub</a> : "TBD"} · LinkedIn: {p.linkedinUrl !== "TBD" ? <a href={p.linkedinUrl}>LinkedIn</a> : "TBD"}</p>
      </section>
    </main>
  );
}
