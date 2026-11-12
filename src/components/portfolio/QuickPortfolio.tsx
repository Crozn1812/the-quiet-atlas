/* Static CV navigation is intentional: no client router or manifest request. */
/* eslint-disable @next/next/no-html-link-for-pages */
// Quick Portfolio is server-only. It lives apart from Portfolio.tsx so the Quick route does not import
// WorldEntry and therefore does not ship or instantiate its client chunk (L1-012).
import { ProfileContent, ProjectsContent } from "./ServerZoneContent";
import { content } from "@/content";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { ProfileJsonLd } from "./ProfileJsonLd";
import { ProfileHistory } from "./ProfileHistory";
import { published, publishedUrl } from "./published";
import { gmailCompose } from "./contact";

export function QuickPortfolio({ locale }: { locale: Locale }) {
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return (
    <main
      id="content"
      tabIndex={-1}
      className="quick-portfolio"
    >
      <ProfileJsonLd locale={locale} />
      <header className="quick-header">
        <p className="quick-kicker">The Quiet Atlas · Quick Portfolio</p>
        <div className="quick-introduction">
          <ProfileContent locale={locale} />
        </div>
        <div className="quick-navigation">
          <nav aria-label="Portfolio">
            <a href={`/${locale}/`}>{t.home}</a>
            <a href="#contact">{t.contact}</a>
          </nav>
          <nav aria-label="Language">
            <a
              href="/en/quick/"
              hrefLang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              English
            </a>
            <a
              href="/vi/quick/"
              hrefLang="vi"
              aria-current={locale === "vi" ? "page" : undefined}
            >
              Tiếng Việt
            </a>
          </nav>
        </div>
      </header>
      <ProfileHistory profile={p} locale={locale} />
      <ProjectsContent locale={locale} />
      <section aria-labelledby="contact">
        <h2 id="contact">{t.contact}</h2>
        {publishedUrl(p.email) && <a href={gmailCompose(p.email)} target="_blank" rel="noopener noreferrer">{p.email}</a>}
        <p><a href="/cv/">{locale === "vi" ? "Tải CV" : "Download CV"}</a></p>
        {published(p.phone) && <p>{t.phone}: {published(p.phone)}</p>}
        {publishedUrl(p.githubUrl) && <p><a href={p.githubUrl}>GitHub</a></p>}
        {publishedUrl(p.linkedinUrl) && <p><a href={p.linkedinUrl}>LinkedIn</a></p>}
      </section>
    </main>
  );
}
