import { content } from "@/content";
import { EvidenceView, SourceLinkView } from "./ProjectLinkViews";

export type Project = (typeof content.projects)[number];

export function SourceLink({ project }: { project: Project }) {
  return (
    <SourceLinkView
      repoUrl={project.repoUrl}
      locale={project.locale}
    />
  );
}

export function ProjectEvidence({ project }: { project: Project }) {
  const evidence = project.evidence.map(id => content.evidence.find(e => e.id === id)!);
  return (
    <EvidenceView
      evidence={evidence}
    />
  );
}
