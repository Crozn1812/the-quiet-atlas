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

export function EvidenceView({ evidence }: {
  evidence: { level: string; publicUrl: string; claim?: string; scope?: string }[];
}) {
  return (
    <div>
      {evidence.length === 0 ? <small>Evidence: TBD</small> : evidence.map((e, index) => {
        const label = e.level + (e.level === "Lab" ? " · demo" : "");
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
              {e.claim !== undefined && <> — {e.claim}. {e.scope}</>}
            </small>
          </p>
        );
      })}
    </div>
  );
}
