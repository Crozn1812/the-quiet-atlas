import { expect, it } from "vitest";
import { content } from "@/content";
import certificates from "@/content/certificates.json";
// @ts-expect-error Node tool is JavaScript, executed directly without a build step.
import { readContent } from "../../../tools/cv/content.mjs";

it("loads and validates the shared certificate JSON for CV and OG builds", () => {
  const loaded: typeof content = readContent();
  expect(loaded).toEqual(content);
  for (const profile of loaded.profiles) {
    expect(profile.certificates).toEqual(certificates[profile.locale]);
  }
});
