import { escapeHtml as e, documentHtml } from "./content.mjs";

export function cvHtml(content, locale) {
  const profile = content.profiles.find(p => p.locale === locale);
  if (!profile) throw new Error("Missing profile");
  const projects = content.projects.filter(p => p.locale === locale);
  const draft = [profile, ...projects].some(p => p.reviewStatus !== "approved");
  const labels = locale === "vi"
    ? { projects: "Dự án", role: "Vai trò", contributions: "Đóng góp", results: "Kết quả", status: "Trạng thái" }
    : { projects: "Projects", role: "Role", contributions: "Contributions", results: "Results", status: "Status" };
  return documentHtml(locale, `
    ${draft ? "<p>Draft</p>" : ""}
    <h1>${e(profile.name)}</h1>
    <p>${e(profile.role)} · ${e(profile.level)}</p>
    <p>${e(profile.introduction)}</p>
    <p>${e(profile.email)}</p>
    ${profile.phone !== "TBD" ? `<p>${e(profile.phone)}</p>` : ""}
    <p>GitHub: ${e(profile.githubUrl)} · LinkedIn: ${e(profile.linkedinUrl)}</p>
    <h2>${labels.projects}</h2>
    ${projects.map(p => `<article>
      <h3>${e(p.title)}${p.reviewStatus !== "approved" ? " · Draft" : ""}</h3>
      <p>${e(p.summary)}</p>
      <p>${labels.status}: ${e(p.status)}</p>
      <p>${labels.role}: ${e(p.myRole)}</p>
      <p>${labels.contributions}: ${e(p.contributions)}</p>
      <p>${labels.results}: ${e(p.results)}</p>
      <p>Repository: ${e(p.repoUrl)}</p>
    </article>`).join("")}
  `);
}

// Preserve byte offsets and xref entries: every replacement has identical length.
export function cleanMetadata(buffer) {
  const source = buffer.toString("latin1");
  const cleaned = source.replace(/\/(Title|Author|Creator|Producer|CreationDate|ModDate)\s*\((?:\\.|[^)\\])*\)/g, (entry, key) => {
    const replacement = `/${key} (${key === "Title" ? "CV" : ""})`;
    if (replacement.length > entry.length) throw new Error("Metadata field too short");
    return replacement.padEnd(entry.length, " ");
  });
  if (!cleaned.includes("/Title (CV)")) throw new Error("Missing fixed PDF title");
  return Buffer.from(cleaned, "latin1");
}
