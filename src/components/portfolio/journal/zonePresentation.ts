import type { ZoneId } from "@/features/interaction/targets";

export const zoneNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;
const topics: Record<ZoneId, readonly [string, string]> = {
  "first-light": ["About", "Giới thiệu"],
  roots: ["Skills", "Kỹ năng"],
  workshop: ["Projects", "Dự án"],
  milestones: ["Certificates & learning", "Chứng chỉ & học tập"],
  "old-trail": ["Journey", "Hành trình"],
  horizon: ["Future direction", "Định hướng"],
  "quiet-shore": ["Hobbies & personality", "Sở thích & tính cách"],
  "last-postcard": ["Keep in touch", "Giữ liên lạc"],
};
export function zoneTopic(zone: ZoneId, locale: "en" | "vi") {
  return topics[zone][locale === "vi" ? 1 : 0];
}
