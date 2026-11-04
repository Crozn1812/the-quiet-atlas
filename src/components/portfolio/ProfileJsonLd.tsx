import { content } from "@/content";
import type { Locale } from "@/i18n/locales";

export function ProfileJsonLd({ locale }: { locale: Locale }) {
  const p = content.profiles.find(p => p.locale === locale)!;
  return (
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
  );
}
