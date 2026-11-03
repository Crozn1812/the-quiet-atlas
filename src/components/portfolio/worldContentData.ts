export interface WorldProject {
  id: string;
  slug: string;
  title: string;
  summary: string;
  statusLabel: string;
  repoUrl: string;
  evidence: { level: string; publicUrl: string }[];
}

export interface WorldContentData {
  profile: {
    name: string;
    role: string;
    level: string;
    introduction: string;
  };
  projects: WorldProject[];
}
