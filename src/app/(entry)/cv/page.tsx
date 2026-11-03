import type { Metadata } from "next";
import Link from "next/link";
import { content } from "@/content";
import { siteUrl } from "@/app/seo";
import { cvFiles } from "../../../../tools/cv/files.mjs";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "CV · The Quiet Atlas",
  alternates: {
    canonical: "/cv/",
  },
  openGraph: {
    images: [{ url: "/og/cv.png", width: 1200, height: 630 }],
  },
};

export default function CvPage() {
  const files = cvFiles();
  const draft = [...content.profiles, ...content.projects].some(p => p.reviewStatus !== "approved");
  return (
    <main
      id="content"
      tabIndex={-1}
    >
      <h1>CV · EN / VI</h1>
      {draft && <p>Draft · Bản nháp</p>}
      <ul>
        {(["en", "vi"] as const).map(locale => (
          <li key={locale}>
            <a
              href={files[locale]}
              download
              hrefLang={locale}
            >
              CV {"\u00b7"} {locale.toUpperCase()}
            </a>
          </li>
        ))}
      </ul>
      <Link
        href="/en/quick/"
        prefetch={false}
      >
        Quick Portfolio · EN
      </Link>
      <Link
        href="/vi/quick/"
        prefetch={false}
      >
        Quick Portfolio · VI
      </Link>
    </main>
  );
}
