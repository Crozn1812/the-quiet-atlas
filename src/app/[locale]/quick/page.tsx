import { pageMetadata } from "@/app/seo";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/locales";
import { QuickPortfolio } from "@/components/portfolio/QuickPortfolio";
export default async function Page({ params }: {
  params: Promise<{
    locale: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale))
    notFound();
  return <QuickPortfolio
    locale={locale}
  />;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return pageMetadata(locale, "quick/", "Quick Portfolio · The Quiet Atlas");
}
