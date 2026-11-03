import { notFound } from "next/navigation";
import { isLocale, locales } from "@/i18n/locales";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Khung Welcome — nội dung thật do ticket L1-001 làm, dữ liệu chưa xác minh để TBD.
export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <main>
      <h1>TBD</h1>
      <p>Welcome ({locale}) — placeholder.</p>
    </main>
  );
}
