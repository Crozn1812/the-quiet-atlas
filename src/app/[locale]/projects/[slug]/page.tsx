import { notFound } from "next/navigation";
import { content } from "@/content";
import { CaseStudy } from "@/components/portfolio/CaseStudy";
import { pageMetadata } from "@/app/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return content.projects.map(({ locale, slug }) => ({ locale, slug }));
}
type Props = { params: Promise<{ locale: string; slug: string }> };

async function getProject({ params }: Props) {
  const { locale, slug } = await params;
  const p = content.projects.find(p => p.locale === locale && p.slug === slug);
  if (!p) notFound();
  return p;
}

export async function generateMetadata(props: Props) {
  const p = await getProject(props);
  return pageMetadata(
    p.locale,
    'projects/' + p.slug + '/',
    p.title + ' · ' + (p.locale === "vi" ? "Nghiên cứu dự án" : "Case study"),
    p.summary === "TBD"
      ? (p.locale === "vi" ? "Bản nháp nghiên cứu dự án: " : "Draft case study: ") + p.title
      : p.summary,
  );
}

export default async function Page(props: Props) {
  return <CaseStudy project={await getProject(props)} />;
}
