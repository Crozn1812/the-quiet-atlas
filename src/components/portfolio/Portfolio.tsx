/* Static language navigation is intentional: no client router or manifest request. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { ProfileContent } from "./ServerZoneContent";
import { content } from "@/content";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { ForestBackdrop } from "./ForestBackdrop";
import { ProfileJsonLd } from "./ProfileJsonLd";
import { QuickPortfolio } from "./QuickPortfolio";
import { WorldEntry } from "./WorldEntry";

// Welcome (and, for callers that pass `quick`, the Quick Portfolio). Routes for Quick import
// QuickPortfolio directly so they do not pull the WorldEntry client chunk.
export function Portfolio({ locale, quick = false }: {
  locale: Locale;
  quick?: boolean;
}) {
  if (quick) return <QuickPortfolio locale={locale} />;
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return (
    <main
      className="welcome-shell"
      tabIndex={-1}
    >
      <ProfileJsonLd locale={locale} />
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
    </main>
  );
}
