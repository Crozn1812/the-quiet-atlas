import { pageMetadata } from "@/app/seo";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { Portfolio } from "@/components/portfolio/Portfolio";
export default async function Page({ params }: {
  params: Promise<{
    locale: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale))
    notFound();
  return <Portfolio locale={locale} />;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return pageMetadata(locale, "", locale === "vi" ? "Chào mừng · The Quiet Atlas" : "Welcome · The Quiet Atlas");
}
