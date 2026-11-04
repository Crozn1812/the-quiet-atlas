import { escapeHtml as e, documentHtml } from "./content.mjs";

export function cvHtml(content, locale) {
  const profile = content.profiles.find(p => p.locale === locale);
  if (!profile) throw new Error("Missing profile");
  const projects = content.projects.filter(p => p.locale === locale);
  const draft = [profile, ...projects].some(p => p.reviewStatus !== "approved");
  const labels = locale === "vi"
    ? { projects: "Dự án", role: "Vai trò", contributions: "Đóng góp", results: "Kết quả", status: "Trạng thái", experience: "Kinh nghiệm", education: "Học vấn", present: "nay", expected: "Dự kiến tốt nghiệp", inProgress: "đang học", graduated: "đã tốt nghiệp" }
    : { projects: "Projects", role: "Role", contributions: "Contributions", results: "Results", status: "Status", experience: "Experience", education: "Education", present: "present", expected: "Expected graduation", inProgress: "in progress", graduated: "graduated" };
  const month = value => {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    return m ? `${m[2]}/${m[1]}` : value;
  };
  const period = item => `${month(item.start)} – ${item.end === "present" ? labels.present : month(item.end)}`;
  return documentHtml(locale, `
    ${draft ? "<p>Draft</p>" : ""}
    <h1>${e(profile.name)}</h1>
    <p>${e(profile.role)} · ${e(profile.level)}</p>
    <p>${e(profile.introduction)}</p>
    <p>${e(profile.email)}</p>
    ${profile.phone !== "TBD" ? `<p>${e(profile.phone)}</p>` : ""}
    <p>GitHub: ${e(profile.githubUrl)} · LinkedIn: ${e(profile.linkedinUrl)}</p>
    ${profile.experience.length ? `<h2>${labels.experience}</h2>
    ${profile.experience.map(x => `<article>
      <h3>${e(x.title)} · ${e(x.employer)}</h3>
      <p>${e(period(x))}</p>
      <p>${e(x.summary)}</p>
    </article>`).join("")}` : ""}
    ${profile.education.length ? `<h2>${labels.education}</h2>
    ${profile.education.map(x => `<article>
      <h3>${e(x.institution)}</h3>
      <p>${e(x.program)}</p>
      <p>${labels.expected}: ${e(x.expectedGraduation)} · ${x.status === "graduated" ? labels.graduated : labels.inProgress}</p>
    </article>`).join("")}` : ""}
    <h2>${labels.projects}</h2>
    ${projects.map(p => `<article>
      <h3>${e(p.title)}${p.reviewStatus !== "approved" ? " · Draft" : ""}</h3>
      <p>${e(p.summary)}</p>
      <p>${labels.status}: ${e(p.status)}</p>
      <p>${labels.role}: ${e(p.myRole)}</p>
      <p>${labels.contributions}: ${e(p.contributions)}</p>
      <p>${labels.results}: ${e(p.results)}</p>
      <p>Repository: ${e(p.repoUrl)}${p.evidence.some(id => content.evidence.some(item => item.id === id && item.level === "Lab")) ? " · demo" : ""}</p>
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
