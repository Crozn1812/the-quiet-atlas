import { expect, it } from "vitest";
import { WORLD_COPY, interactionHint, isWorldLocale } from "../../../src/features/world/copy";

it("provides matching English and Vietnamese world copy", () => {
  expect(Object.keys(WORLD_COPY.en)).toEqual(Object.keys(WORLD_COPY.vi));
  for (const locale of ["en", "vi"] as const) {
    expect(isWorldLocale(locale)).toBe(true);
    expect(interactionHint(locale, "workshop")).toBe("E — " + WORLD_COPY[locale].desk);
    expect(interactionHint(locale, "first-light")).toBe("E — " + WORLD_COPY[locale].signpost);
    for (const text of [WORLD_COPY[locale].signpost, WORLD_COPY[locale].desk, WORLD_COPY[locale].canvas]) {
      expect(text).toContain(locale === "en" ? "placeholder" : "(tạm)");
    }
  }
  expect(isWorldLocale("fr")).toBe(false);
  expect(WORLD_COPY.vi.signpost).toContain("The First Light");
  expect(WORLD_COPY.vi.desk).toContain("The Workshop");
});
