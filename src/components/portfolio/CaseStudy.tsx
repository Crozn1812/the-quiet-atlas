import { ProjectHeading } from "./ProjectHeading";
import { projectStatusLabel } from "@/content/schema";
import { portfolioCopy } from "@/i18n/portfolio";
import { ProjectEvidence, SourceLink, type Project } from "./ProjectLinks";

export function CaseStudy({ project: p, embedded = false }: {
  project: Project;
  embedded?: boolean;
}) {
  const Container = embedded ? "article" : "main";
  const t = portfolioCopy[p.locale];
  const groups = [
    [p.summary, p.problem, p.myRole],
    [p.context, p.problem],
    [p.myRole, p.contributions, p.teamContext],
    [p.constraints],
    [p.architecture],
    [p.decisions, p.alternatives],
    [p.implementation],
    [p.validation],
    [p.results],
    [p.lessons],
  ];
  return (
    <Container
      id={embedded ? undefined : "content"}
      tabIndex={-1}
    >
      <nav aria-label="Language">
        <a
          href={'/en/projects/' + p.slug + '/'}
          hrefLang="en"
        >
          English
        </a>
        <a
          href={'/vi/projects/' + p.slug + '/'}
          hrefLang="vi"
        >
          Tiếng Việt
        </a>
        <a href={'/' + p.locale + '/quick/'}>Quick Portfolio</a>
      </nav>
      <ProjectHeading
        title={p.title}
        statusLabel={projectStatusLabel(p)}
      />
      {groups.map((values, i) => (
        <section
          key={i}
          aria-labelledby={'section-' + i}
        >
          <h2 id={'section-' + i}>{t.sections[i]}</h2>
          {values.map((v, j) => <p key={j}>{v}</p>)}
          {(i === 0 || i === 8) && <ProjectEvidence project={p} />}
          {i === 8 && p.metrics.map((m, j) => (
            <p key={j}>
              {m.value} {m.unit} · {m.method} · {m.environment} · {m.measuredAt} · {m.source !== "TBD" ? <a href={m.source}>Evidence</a> : "TBD"}
            </p>
          ))}
        </section>
      ))}
      <section>
        <h2>{t.sections[10]}</h2>
        {p.repoUrl === "TBD" ? <p>TBD</p> : <SourceLink project={p} />}
      </section>
    </Container>
  );
}
