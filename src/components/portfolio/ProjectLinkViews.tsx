import type { Locale } from "@/i18n/locales";
import { portfolioCopy } from "@/i18n/portfolio";

export function SourceLinkView({ repoUrl, locale }: {
  repoUrl: string;
  locale: Locale;
}) {
  return repoUrl !== "TBD" ? (
    <a
      href={repoUrl}
    >
      {portfolioCopy[locale].source}
    </a>
  ) : null;
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
  return (
    <div>
      {evidence.length === 0 ? <small>Evidence: TBD</small> : evidence.map((e, index) => {
        const label = e.level + (e.level === "Lab" ? " · demo" : "");
        const claim = locale === "en" ? e.claimEn ?? e.claim : e.claim;
        const scope = locale === "en" ? e.scopeEn ?? e.scope : e.scope;
        return (
          <p
            key={index}
          >
            <small>
              {e.publicUrl !== "TBD" ? (
                <a
                  href={e.publicUrl}
                >
                  {label}
                </a>
              ) : label}
              {claim !== undefined && <> — {claim}. {scope}</>}
            </small>
          </p>
        );
      })}
    </div>
  );
}
