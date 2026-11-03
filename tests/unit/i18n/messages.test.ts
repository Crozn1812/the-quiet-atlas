import { expect, it } from "vitest";
import { messages } from "@/i18n/messages";
it("has the same nonempty UI keys in both locales", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.vi).sort());
  function check(copy: Record<string, unknown>) {
    for (const value of Object.values(copy)) {
      if (typeof value === "string") expect(value.trim()).not.toBe("");
      else check(value as Record<string, unknown>);
    }
  }
  expect(Object.keys(messages.en.world).sort()).toEqual(Object.keys(messages.vi.world).sort());
  for (const copy of Object.values(messages)) check(copy);
});
