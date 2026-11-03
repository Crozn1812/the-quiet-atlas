import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale,locales } from "@/i18n/locales";
import { content } from "@/content";
import "../portfolio.css";
export const dynamicParams=false;
export const metadata: Metadata = {
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml",
    },
  },
};
// Import executes the content validator during static generation.
export function generateStaticParams() {
  if(!content.profiles.length)
    throw new Error("Missing profiles");
  return locales.map(locale => ({
    locale
  }));
}
export default async function Layout({ children,params }: {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}) {
  const { locale }=await params;
  if(!isLocale(locale))
    notFound();
  return <html lang={locale}>
    <body>{children}</body>
  </html>;
}
