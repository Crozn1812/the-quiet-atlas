import type { Locale } from "@/i18n/locales";
import { portfolioCopy } from "@/i18n/portfolio";
import { published, publishedUrl } from "./published";

export function SourceLinkView({ repoUrl, locale }: {
  repoUrl: string;
  locale: Locale;
}) {
  const url = publishedUrl(repoUrl);
  return url ? <a href={url}>{portfolioCopy[locale].source}</a> : null;
}

type Evidence = {
  level: string;
  publicUrl: string;
  claim?: string;
  scope?: string;
  claimEn?: string;
  scopeEn?: string;
};

export function EvidenceView({ evidence, locale }: {
  evidence: Evidence[];
  locale: Locale;
}) {
  const visible = evidence.filter(item => publishedUrl(item.level) && publishedUrl(item.publicUrl));
  if (!visible.length) return null;
  return (
    <div>
      {visible.map((e, index) => {
        const label = e.level + (e.level === "Lab" ? " · demo" : "");
        const claim = published(locale === "en" ? e.claimEn ?? e.claim : e.claim);
        const scope = published(locale === "en" ? e.scopeEn ?? e.scope : e.scope);
        return (
          <p key={index}>
            <small>
              <a href={e.publicUrl}>{label}</a>
              {claim && <> — {claim}.</>}
              {scope && <> {scope}</>}
            </small>
          </p>
        );
      })}
    </div>
  );
}
