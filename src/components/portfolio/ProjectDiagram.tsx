import type { Locale } from "@/i18n/locales";
import styles from "./zone-content.module.css";

const diagrams = new Set([
  "cms-devops-platform-aws-eks", "partner-data-gateway-azure",
  "insighthub-rag", "aws-sales-data-pipeline",
]);

export function ProjectDiagram({ slug, title, locale }: { slug: string; title: string; locale: Locale }) {
  if (!diagrams.has(slug)) return null;
  const label = locale === "vi" ? "Sơ đồ kiến trúc" : "Architecture diagram";
  const src = `/architecture/${slug}.svg`;
  return (
    <figure className={styles.diagram}>
      <a href={src} target="_blank" rel="noopener noreferrer"
        aria-label={`${label} · ${title} · ${locale === "vi" ? "Phóng to trong thẻ mới" : "Enlarge in a new tab"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${label} · ${title}`} width={1200} height={530}
          loading="lazy" decoding="async" style={{ display: "block", width: "100%", height: "auto" }} />
      </a>
      <figcaption>{label} · {locale === "vi" ? "Bấm để phóng to ↗" : "Click to enlarge ↗"}</figcaption>
    </figure>
  );
}
