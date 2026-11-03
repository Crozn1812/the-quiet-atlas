import { expect, it, vi } from "vitest";
import { replaceWorldLocale } from "@/components/portfolio/worldLocale";

it("Q21 replaces the locale URL, preserves history state, and updates document metadata in both directions", () => {
  const state = { marker: "retained" };
  const history = { state, replaceState: vi.fn() };
  const document = { documentElement: { lang: "en" }, title: "" };
  for (const locale of ["vi", "en"] as const) {
    replaceWorldLocale(locale, history, document as Document);
    expect(history.replaceState).toHaveBeenLastCalledWith(state, "", `/${locale}/`);
    expect(document.documentElement.lang).toBe(locale);
    expect(document.title).toBe(locale === "vi" ? "Chào mừng · The Quiet Atlas" : "Welcome · The Quiet Atlas");
  }
});
