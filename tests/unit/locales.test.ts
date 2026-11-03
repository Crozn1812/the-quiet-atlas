import { describe, expect, it } from "vitest";
import { defaultLocale, isLocale, locales } from "@/i18n/locales";

describe("locales", () => {
  it("chỉ có en và vi, mặc định en", () => {
    expect(locales).toEqual(["en", "vi"]);
    expect(defaultLocale).toBe("en");
  });

  it("từ chối locale lạ", () => {
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});
