import type { content } from "@/content";
import type { Locale } from "@/i18n/locales";

type Profile = (typeof content.profiles)[number];

function monthLabel(value: string) {
  return value === "TBD" ? value : `${value.slice(5)}/${value.slice(0, 4)}`;
}

export function ProfileHistory({ profile, locale }: { profile: Profile; locale: Locale }) {
  const vi = locale === "vi";
  return (
    <>
      {profile.experience.length > 0 && (
        <section aria-labelledby="experience-title">
          <h2 id="experience-title">{vi ? "Kinh nghiệm" : "Experience"}</h2>
          <ul>
            {profile.experience.map((item, index) => (
              <li key={index}>
                <h3>{item.employer} · {item.title}</h3>
                <p>{monthLabel(item.start)} – {item.end === "present" ? (vi ? "nay" : "present") : monthLabel(item.end)}</p>
                {item.summary !== "TBD" && <p>{item.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile.education.length > 0 && (
        <section aria-labelledby="education-title">
          <h2 id="education-title">{vi ? "Học vấn" : "Education"}</h2>
          <ul>
            {profile.education.map((item, index) => (
              <li key={index}>
                <h3>{item.institution}</h3>
                <p>{item.program}</p>
                <p>{item.status === "in-progress"
                  ? (vi ? "Dự kiến tốt nghiệp" : "Expected graduation")
                  : (vi ? "Đã tốt nghiệp" : "Graduated")}: {item.expectedGraduation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
