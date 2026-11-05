import type { Locale } from "../../i18n/locales";
import type { ZoneId } from "../interaction/targets";

export const HINT_COOLDOWN = 45;

export const MASCOT_HINTS: Readonly<Record<ZoneId, Readonly<Record<Locale, string>>>> = {
  "first-light": { en: "Use WASD to walk; press E near a marker to read.", vi: "Dùng WASD di chuyển; nhấn E gần dấu mốc để đọc." },
  roots: { en: "Press E nearby to read about skills.", vi: "Nhấn E ở gần để đọc về kỹ năng." },
  workshop: { en: "Press E nearby to explore selected projects.", vi: "Nhấn E ở gần để đọc các dự án tiêu biểu." },
  milestones: { en: "Press E nearby to read about certificates and learning.", vi: "Nhấn E ở gần để đọc về chứng chỉ và học tập." },
  "old-trail": { en: "Press E nearby to read the journey.", vi: "Nhấn E ở gần để đọc hành trình." },
  horizon: { en: "Press E nearby to read about future directions.", vi: "Nhấn E ở gần để đọc định hướng tương lai." },
  "quiet-shore": { en: "Press E nearby to read about hobbies.", vi: "Nhấn E ở gần để đọc về sở thích." },
  "last-postcard": { en: "Press E nearby for contact details and CV.", vi: "Nhấn E ở gần để xem liên hệ và CV." },
};

export interface MascotHint {
  readonly zoneId: ZoneId;
  readonly text: string;
}

/** One instance per session; time is monotonic simulation seconds supplied by the caller. */
export function createMascotHints() {
  const visited = new Set<ZoneId>();
  const spoken = new Set<ZoneId>();
  let current: ZoneId | null = null;
  let pending: ZoneId | null = null;
  let lastSpoken = -Infinity;
  let lastTime = 0;
  return {
    /** Call on ticks with the current zone (null outside). eligible=false suppresses during UI/cinematics.
     * A first entry during cooldown waits only while still in that zone; no backlog on exit.
     * Disabled/ineligible visits are consumed silently, with no surprise hint on reopening.
     */
    update(input: { zoneId: ZoneId | null; locale: Locale; now: number; enabled: boolean; eligible?: boolean }): MascotHint | null {
      if (!Number.isFinite(input.now) || input.now < lastTime) throw new RangeError("Hint time must be finite and monotonic");
      lastTime = input.now;
      const allowed = input.enabled && input.eligible !== false;
      if (input.zoneId !== current) {
        current = input.zoneId;
        pending = null;
        if (current !== null && !visited.has(current)) {
          visited.add(current);
          if (allowed) pending = current;
        }
      }
      if (!allowed) pending = null;
      if (pending === null || spoken.has(pending) || input.now - lastSpoken < HINT_COOLDOWN) return null;
      const zoneId = pending;
      pending = null;
      spoken.add(zoneId);
      lastSpoken = input.now;
      return { zoneId, text: MASCOT_HINTS[zoneId][input.locale] };
    },
  };
}
