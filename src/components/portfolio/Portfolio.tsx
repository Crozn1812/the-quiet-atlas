/* Static CV navigation is intentional: no client router or manifest request. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { portfolioCopy } from "@/i18n/portfolio";
import { ProfileContent, ProjectsContent } from "./ServerZoneContent";
import { content } from "@/content";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { ForestBackdrop } from "./ForestBackdrop";
import { WorldEntry } from "./WorldEntry";

export function Portfolio({ locale, quick = false }: {
  locale: Locale;
  quick?: boolean;
}) {
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return (
    <main
      id={quick ? "content" : undefined}
      className={quick ? undefined : "welcome-shell"}
      tabIndex={-1}
    >
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
      {!quick ? (
        <WorldEntry
          locale={locale}
          copy={t.world}
          email={p.email}
          backdrop={<ForestBackdrop />}
        >
          <ProfileContent locale={locale} />
          <nav aria-label="Language">
            <a href="/en/">English</a>
            <a href="/vi/">Tiếng Việt</a>
          </nav>
        </WorldEntry>
      ) : (
        <>
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
          <ProfileContent locale={locale} />
          <nav aria-label="Portfolio">
            {quick && <a href={`/${locale}/`}>{t.home}</a>}
            <a href="/cv/">CV</a>
          </nav>
          {quick && (
            <ProjectsContent locale={locale} />
          )}
          <a href={`/${locale}/privacy/`}>{portfolioCopy[locale].privacy}</a>
          <section
            id="cv"
            aria-labelledby="cv-title"
          >
            <h2 id="cv-title">CV</h2>
            <a href="/cv/">CV</a>
          </section>
          <section aria-labelledby="contact">
            <h2 id="contact">{t.contact}</h2>
            <a href={`mailto:${p.email}`}>{p.email}</a>
            <p>{t.phone}: {p.phone}</p>
            <p>GitHub: {p.githubUrl !== "TBD" ? <a href={p.githubUrl}>GitHub</a> : "TBD"} · LinkedIn: {p.linkedinUrl !== "TBD" ? <a href={p.linkedinUrl}>LinkedIn</a> : "TBD"}</p>
          </section>
        </>
      )}
    </main>
  );
}
