import type { SecretId } from "../journal/model";
import type { WorldLocale } from "../world/copy";
import type { StoryFeedback } from "./story";

/**
 * Q-32 (Duy, 2026-11-05): each secret answers with one of Duy's own four-line poems. The world shows the English
 * rendering first with a button that reveals the Vietnamese original. The Vietnamese lines are Duy's words verbatim;
 * the English lines are Lead's translation, approved by Duy (Q-39, 2026-11-05).
 */
export interface Poem {
  readonly en: readonly string[];
  readonly vi: readonly string[];
}

export const SECRET_POEMS = {
  reflection: {
    en: ["A direction lingers,", "I find the old road home,", "I thought we had parted,", "at peace, I sleep."],
    vi: ["Đọng lại hướng đi,", "Tìm về đường cũ,", "Cứ ngỡ chia li,", "Bình yên để ngủ."],
  },
  "forgotten-sound": {
    en: ["At the music's last note,", "who knows the song,", "a moment of thought", "carries us along."],
    vi: ["Tận cùng nốt nhạc,", "biết đâu bài ca,", "một chút suy ngẫm,", "dẫn ta đi qua."],
  },
  "unmarked-road": {
    en: ["We open a way,", "a worn path somewhere,", "a flicker of doubt,", "still, we walk on."],
    vi: ["Mở đường ta đi,", "lối mòn đâu đó,", "một chút tình nghi,", "thôi thì cứ đi."],
  },
  "unwritten-page": {
    en: ["Drifting, gently,", "I thought it was sleep,", "the wind beside me,", "the sea takes me in, at peace."],
    vi: ["Nhẹ nhàng trôi nổi,", "cứ ngỡ ngủ yên,", "bên cạnh là gió,", "biển đón là yên."],
  },
} as const satisfies Record<SecretId, Poem>;

/** The bench before three secrets: a gentle "not yet". */
export const NOT_YET_POEM = {
  en: ["Asleep, unknowing,", "a pale self seems far away,", "rising in the mind,", "getting ready to wait for me."],
  vi: ["Ngủ quên trong vô thức,", "tấm thân trắng ngỡ xa,", "vực dậy trong tâm thức,", "chuẩn bị đợi chờ ta."],
} as const satisfies Poem;

/** One line per verse, newline separated (the world renders it with white-space: pre-line). */
export const SECRET_FEEDBACK = Object.fromEntries(Object.entries(SECRET_POEMS).map(([id, poem]) =>
  [id, { en: poem.en.join("\n"), vi: poem.vi.join("\n") }])) as Record<SecretId, Record<WorldLocale, string>>;

export const NOT_YET_FEEDBACK: Record<WorldLocale, string> = {
  en: NOT_YET_POEM.en.join("\n"),
  vi: NOT_YET_POEM.vi.join("\n"),
};

/** `language` is the poem's language (English first by Duy's choice), not necessarily the page locale. */
export function storyFeedbackText(feedback: StoryFeedback, language: WorldLocale): string {
  return feedback.feedback === "not-yet"
    ? NOT_YET_FEEDBACK[language]
    : SECRET_FEEDBACK[feedback.id][language];
}

/** Toggle button labels, in the page locale. */
export const POEM_TOGGLE = {
  toVi: { en: "Read in Vietnamese", vi: "Tiếng Việt" },
  toEn: { en: "English", vi: "Bản tiếng Anh" },
} as const satisfies Record<string, Record<WorldLocale, string>>;
