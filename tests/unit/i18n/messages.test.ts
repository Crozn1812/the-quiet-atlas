import { expect, it } from "vitest";
import { messages } from "@/i18n/messages";
it("has the same nonempty UI keys in both locales", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.vi).sort());
  for (const copy of Object.values(messages)) for (const value of Object.values(copy)) expect(value.trim()).not.toBe("");
});
