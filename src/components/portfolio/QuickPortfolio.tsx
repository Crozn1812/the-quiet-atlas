/* Static CV navigation is intentional: no client router or manifest request. */
/* eslint-disable @next/next/no-html-link-for-pages */
// Quick Portfolio is server-only. It lives apart from Portfolio.tsx so the Quick route does not import
// WorldEntry and therefore does not ship or instantiate its client chunk (L1-012).
import { portfolioCopy } from "@/i18n/portfolio";
import { ProfileContent, ProjectsContent } from "./ServerZoneContent";
import { content } from "@/content";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { ProfileJsonLd } from "./ProfileJsonLd";

export function QuickPortfolio({ locale }: { locale: Locale }) {
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return (
    <main
      id="content"
      tabIndex={-1}
    >
      <ProfileJsonLd locale={locale} />
      <nav aria-label="Language">
        <a
          href="/en/quick/"
          hrefLang="en"
        >
          English
        </a>
        <span>·</span>
        <a
          href="/vi/quick/"
          hrefLang="vi"
        >
          Tiếng Việt
        </a>
      </nav>
      <p>The Quiet Atlas / Quick Portfolio</p>
      <ProfileContent locale={locale} />
      <nav aria-label="Portfolio">
        <a href={`/${locale}/`}>{t.home}</a>
        <a href="/cv/">CV</a>
      </nav>
      <ProjectsContent locale={locale} />
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
    </main>
  );
}
