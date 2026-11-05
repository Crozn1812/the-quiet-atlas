import type { SecretId } from "../journal/model";
import type { WorldLocale } from "../world/copy";
import type { StoryFeedback } from "./story";

// TBD: Duy duyệt câu chữ
export const SECRET_FEEDBACK = {
  reflection: {
    en: "The water holds a little light.",
    vi: "Mặt nước giữ lại một chút sáng.",
  },
  "forgotten-sound": {
    en: "A quiet note drifts through the leaves.",
    vi: "Một nốt trầm trôi qua kẽ lá.",
  },
  "unmarked-road": {
    en: "A faint path opens between the shadows.",
    vi: "Lối mờ hé mở giữa những bóng cây.",
  },
  "unwritten-page": {
    en: "The page turns softly toward the sea.",
    vi: "Trang giấy khẽ nghiêng về phía biển.",
  },
} as const satisfies Record<SecretId, Record<WorldLocale, string>>;

// TBD: Duy duyệt câu chữ
export const NOT_YET_FEEDBACK = {
  en: "The page rests, waiting for a gentler breeze.",
  vi: "Trang giấy nghỉ yên, chờ một làn gió nhẹ.",
} as const satisfies Record<WorldLocale, string>;

export function storyFeedbackText(feedback: StoryFeedback, locale: WorldLocale): string {
  return feedback.feedback === "not-yet"
    ? NOT_YET_FEEDBACK[locale]
    : SECRET_FEEDBACK[feedback.id][locale];
}
