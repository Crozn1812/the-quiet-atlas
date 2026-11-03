import { content } from "@/content";
import { projectStatusLabel } from "@/content/schema";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
export function Portfolio({ locale, quick = false }: { locale: Locale; quick?: boolean }) {
  const p = content.profiles.find(p => p.locale === locale)!;
  const t = messages[locale];
  return <main>
    <nav aria-label="Language"><a href={quick ? "/en/quick/" : "/en/"} hrefLang="en">English</a> · <a href={quick ? "/vi/quick/" : "/vi/"} hrefLang="vi">Tiếng Việt</a></nav>
    <p>The Quiet Atlas{quick ? " / Quick Portfolio" : ""}</p><h1>{p.name}</h1><p>{p.role} · {p.level}</p>{p.reviewStatus !== "approved" && <p>Draft</p>}<p>{p.introduction}</p>
    <nav aria-label="Portfolio">{quick ? <a href={`/${locale}/`}>{t.home}</a> : <><button disabled aria-describedby="world-reason">Enter World</button><a href={`/${locale}/quick/`}>Quick Portfolio</a><button disabled aria-describedby="sound-reason">Sound</button></>}<a href="#cv">CV · TBD</a></nav>
    {!quick && <><p id="world-reason">{t.building}</p><p id="sound-reason">{t.soundReason}</p></>}
    {quick && <section aria-labelledby="projects"><h2 id="projects">{t.projects}</h2>{content.projects.filter(p => p.locale === locale).slice(0, 2).map(project => <article key={project.id}><h3>{project.title}</h3><p>{projectStatusLabel(project)}</p><p>{project.summary}</p></article>)}</section>}
    <section id="cv" aria-labelledby="cv-title"><h2 id="cv-title">CV</h2><p>{t.cvPending}: TBD</p><button disabled aria-label={t.cvPending}>CV · TBD</button></section>
    <section aria-labelledby="contact"><h2 id="contact">{t.contact}</h2><a href={`mailto:${p.email}`}>{p.email}</a><p>{t.phone}: {p.phone}</p><p>GitHub: TBD · LinkedIn: TBD</p></section>
  </main>;
}
