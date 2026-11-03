import { notFound } from "next/navigation";
import { content } from "@/content";
import { isLocale } from "@/i18n/locales";
import { portfolioCopy } from "@/i18n/portfolio";
import { pageMetadata } from "@/app/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = portfolioCopy[locale];
  return pageMetadata(locale, "privacy/", t.privacy + " · The Quiet Atlas", t.privacyText[0]);
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = portfolioCopy[locale];
  const p = content.profiles.find(p => p.locale === locale)!;
  return (
    <main
      id="content"
      tabIndex={-1}
    >
      <nav aria-label="Language">
        <a
          href={"/en/" + "privacy/"}
          hrefLang="en"
        >
          English
        </a>
        <a
          href={"/vi/" + "privacy/"}
          hrefLang="vi"
        >
          Tiếng Việt
        </a>
        <a href={'/' + locale + '/quick/'}>Quick Portfolio</a>
      </nav>
      <h1>{t.privacy}</h1>
      <p>Draft</p>
      {t.privacyText.map(v => <p key={v}>{v}</p>)}
      <a href={'mailto:' + p.email}>{p.email}</a>
    </main>
  );
}
