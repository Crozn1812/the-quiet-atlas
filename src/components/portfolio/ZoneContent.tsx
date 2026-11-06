/* Static navigation keeps links in the current tab without a client router. */
/* eslint-disable @next/next/no-html-link-for-pages */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { EvidenceView, SourceLinkView } from "./ProjectLinkViews";
import { ProjectHeading } from "./ProjectHeading";
import type { WorldContentData, WorldProject } from "./worldContentData";
import styles from "./zone-content.module.css";

const zones = {
  "first-light": "The First Light",
  roots: "The Roots",
  workshop: "The Workshop",
  milestones: "The Milestones",
  "old-trail": "The Old Trail",
  horizon: "The Horizon",
  "quiet-shore": "The Quiet Shore",
  "last-postcard": "The Last Postcard",
};

// Draft placeholders stay in content, never in the public magazine.
function published(value?: string) {
  return value && !/\bTBD\b/i.test(value) ? value : "";
}

// Compact, deterministic ink drawings; layered translucent washes need no bitmap/filter.
const illustrations: Record<string, { wash: string; ink: string; water?: string }> = {
  "first-light": {
    wash: "M25 240Q6 154 71 65Q115 25 148 110L174 245ZM263 236Q229 135 283 74Q345 35 373 232Z",
    water: "M221 32C121 78 297 104 208 147S115 214 237 285L292 285C143 206 187 196 249 162S181 80 247 32Z",
    ink: "M63 242L76 73M76 105L56 88M75 140L100 113M113 230L123 47M122 88L103 65M121 125L145 97M307 249L299 87M300 129L324 103M300 161L282 137M224 36C142 81 291 105 218 150S129 218 258 283",
  },
  workshop: {
    wash: "M54 139L178 61L339 119L309 148L178 99L77 164ZM83 166L305 149L307 248L85 255Z",
    ink: "M45 147L177 61L348 120L311 150L178 102L66 167ZM87 163L87 251L308 245L308 153M121 249L121 181L176 178L176 248M213 176L273 173L273 214L213 217ZM196 107L196 143M65 268Q186 256 339 260",
  },
  roots: {
    wash: "M159 52Q199 23 233 53L221 173L318 242L221 219L194 262L161 216L64 247L173 168Z",
    ink: "M178 40L179 150Q168 190 72 246M213 42L205 155Q231 199 328 246M190 150Q199 211 194 273M172 181L140 235L104 270M218 186L249 236L286 267M150 203L91 207L55 225M237 209L297 211L345 231M189 90L198 126",
  },
  milestones: {
    wash: "M47 247L62 176L125 169L135 249ZM153 247L169 113L233 106L243 249ZM263 247L277 61L334 68L345 247Z",
    ink: "M55 248L64 181L119 175L129 247M161 248L172 117L225 114L235 248M270 248L280 66L327 73L338 247M81 199L103 197M186 141L211 140M292 94L315 97M37 254Q185 243 362 255",
  },
  "old-trail": {
    wash: "M29 239Q75 103 145 132Q211 54 282 106L376 242ZM141 288Q250 194 171 155Q129 129 211 68L229 71Q154 129 195 151Q292 209 187 288Z",
    ink: "M36 235Q92 127 143 146M219 120Q279 73 358 220M157 281Q260 205 180 153Q143 129 217 70M86 193L86 130M65 146L114 143L110 162L66 165ZM305 207L307 173",
  },
  horizon: {
    wash: "M26 207Q120 164 211 186Q303 161 375 200L375 253L26 253ZM243 105a32 32 0 1 0 64 0a32 32 0 1 0-64 0",
    water: "M26 218Q143 202 211 216T375 213L375 254L26 254Z",
    ink: "M25 202Q131 182 213 199T375 196M62 231L151 228M246 238L331 234M253 106a23 23 0 0 1 46 0M178 167L191 155L204 165M214 148L227 138L240 146",
  },
  "quiet-shore": {
    wash: "M27 180Q111 150 181 177T375 174L375 247Q253 227 182 254T27 251Z",
    water: "M27 188Q116 168 185 190T375 186L375 219Q272 201 185 222T27 223Z",
    ink: "M27 183Q116 163 185 185T375 181M42 215Q133 194 204 215T352 211M90 248Q199 228 298 243M294 174L297 81M297 99L263 82M297 111L329 90M297 122L271 114",
  },
  "last-postcard": {
    wash: "M47 86L341 67L355 239L57 258ZM65 101L195 177L326 84L198 199Z",
    ink: "M45 86L342 66L356 240L56 260ZM48 91L195 185L339 73M58 254L156 164M352 235L232 163M283 91L317 89L319 122L285 124ZM84 212L132 209M85 226L150 222",
  },
};

function ZoneIllustration({ zoneId }: { zoneId: string }) {
  const art = illustrations[zoneId] ?? illustrations["first-light"]!;
  return (
    <svg className={styles.illustration} viewBox="0 0 400 320" aria-hidden="true" focusable="false">
      <path d={art.wash} fill="var(--forest)" opacity=".16" />
      <path d={art.wash} fill="var(--mist)" opacity=".3" transform="translate(4 -5)" />
      {art.water && <path d={art.water} fill="var(--water)" opacity=".32" />}
      <circle cx="254" cy="57" r="9" fill="var(--dusk)" opacity=".65" />
      <path d={art.ink} fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".72" />
    </svg>
  );
}

function Magazine({ zoneId, title, children }: {
  zoneId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.page} data-zone={zoneId}>
      <header className={styles.header}>
        <p className={styles.kicker}>{zones[zoneId as keyof typeof zones] ?? "The Quiet Atlas"}</p>
        <h1 className={styles.title} id="zone-content-title" tabIndex={-1}>{title}</h1>
      </header>
      <ZoneIllustration zoneId={zoneId} />
      <div className={styles.body}>{children}</div>
    </article>
  );
}

export function OverlayProject({ project, locale }: { project: WorldProject; locale: Locale }) {
  const evidence = project.evidence.filter(item => published(item.level));
  return (
    <article className={styles.page}>
      <ProjectHeading
        title={published(project.title)}
        statusLabel={published(project.statusLabel)}
      />
      <p>{published(project.summary)}</p>
      {evidence.length > 0 && <EvidenceView
        evidence={evidence}
        locale={locale}
      />}
      <SourceLinkView
        repoUrl={project.repoUrl}
        locale={locale}
      />
    </article>
  );
}

export function ZoneContent({ locale, zoneId, data }: {
  locale: Locale;
  zoneId: string;
  data: WorldContentData;
}) {
  const vi = locale === "vi";
  const quick = (
    <a href={`/${locale}/quick/`}>
      {vi ? "Xem Quick Portfolio" : "View Quick Portfolio"}
    </a>
  );
  const cv = <a href="/cv/">{vi ? "Tải CV" : "Download CV"}</a>;
  const unwritten = vi ? "Duy đang viết phần này." : "Duy is still writing this page.";
  const page = (title: string, body: ReactNode) => (
    <Magazine zoneId={zoneId} title={title}>{body}</Magazine>
  );

  if (zoneId === "first-light") {
    const p = data.profile;
    return page(published(p.name), (
      <>
        <p className={styles.lead}>{[published(p.role), published(p.level)].filter(Boolean).join(" · ")}</p>
        <p>{published(p.introduction)}</p>
        <nav className={styles.links} aria-label={vi ? "Hồ sơ" : "Profile"}>{quick}{cv}</nav>
      </>
    ));
  }
  if (zoneId === "workshop") {
    const makingOf = (project: WorldProject) => project.slug === "the-making-of-the-quiet-atlas"
      || project.title === "The Making of The Quiet Atlas";
    // Keep source order, placing an actual making-of case study last if supplied.
    const projects = [...data.projects.filter(project => !makingOf(project)), ...data.projects.filter(makingOf)];
    return page(messages[locale].projects, (
      <div className={styles.entries}>
        {projects.filter(project => published(project.title)).map(project => (
          <section key={project.id}>
            <h2><a href={`/${locale}/projects/${project.slug}/`}>{project.title}</a></h2>
            {published(project.statusLabel) && <p className={styles.meta}>{project.statusLabel}</p>}
            {published(project.summary) && <p>{project.summary}</p>}
          </section>
        ))}
      </div>
    ));
  }

  if (zoneId === "old-trail") {
    const experience = data.profile.experience ?? [];
    const education = data.profile.education ?? [];
    const month = (value: string) => published(value) ? `${value.slice(5)}/${value.slice(0, 4)}` : "";
    return page(vi ? "Hành trình" : "Journey", (
      <>
        <ol className={styles.timeline}>
          {experience.map((item, index) => (
            <li key={`experience-${index}`}>
              <h2>{[published(item.employer), published(item.title)].filter(Boolean).join(" · ")}</h2>
              <p className={styles.meta}>
                {[month(item.start), item.end === "present" ? (vi ? "nay" : "present") : month(item.end)].filter(Boolean).join(" – ")}
              </p>
              {published(item.summary) && <p>{item.summary}</p>}
            </li>
          ))}
          {education.map((item, index) => (
            <li key={`education-${index}`}>
              <h2>{published(item.institution)}</h2>
              <p>{published(item.program)}</p>
              <p className={styles.meta}>
                {item.status === "in-progress" ? (vi ? "Dự kiến tốt nghiệp" : "Expected graduation") : (vi ? "Đã tốt nghiệp" : "Graduated")}
                {published(item.expectedGraduation) && <>: {item.expectedGraduation}</>}
              </p>
            </li>
          ))}
        </ol>
        {experience.length + education.length === 0 && <p>{unwritten}</p>}
        {quick}
      </>
    ));
  }

  if (zoneId === "last-postcard") {
    const p = data.profile;
    return page(vi ? "Giữ liên lạc" : "Keep in touch", (
      <div className={styles.postcard}>
        <section>
          <h2>{vi ? "Từ" : "From"}</h2>
          <p className={styles.lead}>{published(p.name)}</p>
          <p>{published(p.role)}</p>
          {quick}
        </section>
        <section className={styles.address}>
          <h2>{vi ? "Liên hệ & CV" : "Contact & CV"}</h2>
          <address className={styles.links}>
            {published(p.email) && <a href={`mailto:${p.email}`}>{p.email}</a>}
            {p.phone && published(p.phone) && <a href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a>}
            {published(p.githubUrl) && <a href={p.githubUrl}>GitHub</a>}
            {published(p.linkedinUrl) && <a href={p.linkedinUrl}>LinkedIn</a>}
            {cv}
          </address>
        </section>
      </div>
    ));
  }

  const optionalZones = {
    roots: { items: data.skills, title: vi ? "Kỹ năng" : "Skills" },
    milestones: { items: data.certificates, title: vi ? "Chứng chỉ & học tập" : "Certificates & learning" },
    horizon: { items: data.direction, title: vi ? "Định hướng" : "Future direction" },
    "quiet-shore": { items: data.hobbies, title: vi ? "Sở thích & tính cách" : "Hobbies & personality" },
  };
  const optional = optionalZones[zoneId as keyof typeof optionalZones];
  const items = optional?.items?.filter(item => published(item.title) && published(item.description)) ?? [];
  const title = optional?.title ?? zones[zoneId as keyof typeof zones];
  return page(title ?? "The Quiet Atlas", (
    <>
      {items.length > 0 ? (
        <ul className={styles.entries}>
          {items.map((item, index) => <li key={index}><h2>{item.title}</h2><p>{item.description}</p></li>)}
        </ul>
      ) : <p className={styles.lead}>{unwritten}</p>}
      {quick}
    </>
  ));
}
