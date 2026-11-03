import { content } from "@/content";
import { portfolioCopy } from "@/i18n/portfolio";

export type Project = (typeof content.projects)[number];

export function SourceLink({ project }: { project: Project }) {
  return project.repoUrl !== "TBD"
    ? <a href={project.repoUrl}>{portfolioCopy[project.locale].source}</a>
    : null;
}

export function ProjectEvidence({ project }: { project: Project }) {
  return (
    <div>
      {project.evidence.length === 0 ? <small>Evidence: TBD</small> : project.evidence.map(id => {
        const e = content.evidence.find(e => e.id === id)!;
        const label = e.level + (e.level === "Lab" ? " · demo" : "");
        return (
          <p key={id}>
            <small>
              {e.publicUrl !== "TBD" ? <a href={e.publicUrl}>{label}</a> : label} — {e.claim}. {e.scope}
            </small>
          </p>
        );
      })}
    </div>
  );
}
