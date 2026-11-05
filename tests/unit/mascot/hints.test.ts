import { describe, expect, it } from "vitest";
import { createMascotHints, HINT_COOLDOWN, MASCOT_HINTS } from "../../../src/features/mascot/hints";
import { ZONE_IDS, type ZoneId } from "../../../src/features/interaction/targets";
import type { Locale } from "../../../src/i18n/locales";

const tick = (zoneId: ZoneId | null, now: number, locale: Locale = "en", enabled = true) => ({ zoneId, now, locale, enabled });

describe("session mascot hints", () => {
  it("speaks once on first entry, waits at least 45 seconds in the next zone", () => {
    const hints = createMascotHints();
    expect(hints.update(tick("first-light", 0))?.zoneId).toBe("first-light");
    expect(hints.update(tick("first-light", 1))).toBeNull();
    expect(hints.update(tick("workshop", 1))).toBeNull();
    expect(hints.update(tick("workshop", HINT_COOLDOWN - 0.001))).toBeNull();
    expect(hints.update(tick("workshop", HINT_COOLDOWN))?.zoneId).toBe("workshop");
    expect(hints.update(tick("workshop", 100))).toBeNull();
  });

  it("does not repeat after reentry or a locale change, with all eight zones", () => {
    const hints = createMascotHints();
    const texts = new Set<string>();
    ZONE_IDS.forEach((zone, i) => {
      const result = hints.update(tick(zone, i * 45));
      expect(result?.text).toBe(MASCOT_HINTS[zone].en);
      texts.add(result!.text);
    });
    expect(texts.size).toBe(8);
    ZONE_IDS.forEach((zone, i) => expect(hints.update(tick(zone, 400 + i * 45, "vi"))).toBeNull());
  });

  it("drops pending hints on leaving, without a backlog or repeat visit hint", () => {
    const hints = createMascotHints();
    hints.update(tick("first-light", 0));
    expect(hints.update(tick("workshop", 5))).toBeNull();
    expect(hints.update(tick(null, 6))).toBeNull();
    expect(hints.update(tick("workshop", 90))).toBeNull();
    expect(hints.update(tick("roots", 91))?.zoneId).toBe("roots");
  });

  it("stays silent when disabled and does not queue visits for reenable", () => {
    const hints = createMascotHints();
    expect(hints.update(tick("first-light", 0, "en", false))).toBeNull();
    expect(hints.update(tick("first-light", 60))).toBeNull();
    expect(hints.update(tick("roots", 61))?.zoneId).toBe("roots");
    expect(hints.update(tick("workshop", 62))).toBeNull();
    expect(hints.update(tick("workshop", 106, "en", false))).toBeNull();
    expect(hints.update(tick("workshop", 107))).toBeNull();
  });

  it("can suppress hints during overlays/cinematics without taking focus or opening chat", () => {
    const hints = createMascotHints();
    expect(hints.update({ ...tick("first-light", 0), eligible: false })).toBeNull();
    expect(hints.update(tick("first-light", 45))).toBeNull();
    expect(hints.update(tick("workshop", 46))).toEqual({ zoneId: "workshop", text: MASCOT_HINTS.workshop.en });
  });

  it.each(["en", "vi"] as const)("returns the requested %s locale and texts of at most 14 words", locale => {
    const hints = createMascotHints();
    ZONE_IDS.forEach((zoneId, i) => {
      const result = hints.update(tick(zoneId, i * 45, locale));
      expect(result?.text).toBe(MASCOT_HINTS[zoneId][locale]);
      expect(result!.text.trim().split(/\s+/).length).toBeLessThanOrEqual(14);
      expect(result!.text).toContain("E");
    });
  });

  it("uses the current locale when a cooldown-delayed hint is emitted", () => {
    const hints = createMascotHints();
    hints.update(tick("first-light", 0));
    hints.update(tick("workshop", 1));
    expect(hints.update(tick("workshop", 45, "vi"))?.text).toBe(MASCOT_HINTS.workshop.vi);
  });

  it("keeps sessions independent", () => {
    const a = createMascotHints(), b = createMascotHints();
    expect(a.update(tick("roots", 0))).toEqual(b.update(tick("roots", 0)));
  });

  it("rejects invalid or reversed clock values", () => {
    const hints = createMascotHints();
    hints.update(tick(null, 5));
    for (const time of [-1, 4, NaN, Infinity]) expect(() => hints.update(tick("roots", time))).toThrow(RangeError);
  });
});
