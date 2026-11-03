import type { Metadata } from "next";
import { content } from "@/content";
import { locales, type Locale } from "@/i18n/locales";
import { portfolioCopy } from "@/i18n/portfolio";

export const siteUrl = new URL(process.env.SITE_URL || "http://localhost:3000");

export function pageMetadata(
  locale: Locale,
  path = "",
  title = "The Quiet Atlas",
  description = portfolioCopy[locale].description,
): Metadata {
  return {
    metadataBase: siteUrl,
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{
        url: "/og/" + locale + "-" + (path ? path.replace(/\/$/, "").replaceAll("/", "-") : "welcome") + ".png",
        width: 1200,
        height: 630,
      }],
    },
    alternates: {
      canonical: "/" + locale + "/" + path,
      languages: Object.fromEntries(locales.map(l => [l, "/" + l + "/" + path])),
    },
  };
}

export function publicPaths() {
  return [
    "/",
    "/cv/",
    ...locales.flatMap(l => [
      "/" + l + "/",
      "/" + l + "/quick/",
      "/" + l + "/privacy/",
      ...content.projects
        .filter(p => p.locale === l)
        .map(p => "/" + l + "/projects/" + p.slug + "/"),
    ]),
  ];
}
