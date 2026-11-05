export interface WorldProject {
  id: string;
  slug: string;
  title: string;
  summary: string;
  statusLabel: string;
  repoUrl: string;
  evidence: { level: string; publicUrl: string }[];
}

export interface WorldContentItem {
  title: string;
  description: string;
}

export interface WorldExperience {
  employer: string;
  title: string;
  start: string;
  end: string;
  summary: string;
}

export interface WorldEducation {
  institution: string;
  program: string;
  expectedGraduation: string;
  status: "in-progress" | "graduated";
}

export interface WorldContentData {
  profile: {
    name: string;
    role: string;
    level: string;
    introduction: string;
    // Optional while older serialized world-content payloads remain supported.
    email?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    experience?: WorldExperience[];
    education?: WorldEducation[];
  };
  projects: WorldProject[];
  skills?: WorldContentItem[];
  certificates?: WorldContentItem[];
  direction?: WorldContentItem[];
  hobbies?: WorldContentItem[];
}
