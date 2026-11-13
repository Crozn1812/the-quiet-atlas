import { expect, it, vi } from "vitest";
import certificates from "../../../../src/content/certificates.json";
import { milestoneCertificates } from "../../../../src/features/world/zones/milestones";

// Importing the lazy scene must work even when runtime content/validation is unavailable.
vi.mock("../../../../src/content", () => {
  throw new Error("Build-time content must not be imported by the world");
});
vi.mock("../../../../src/content/schema", () => {
  throw new Error("Runtime validation must not be imported by the world");
});
vi.mock("zod", () => {
  throw new Error("Zod must not be imported by the world");
});

it("loads certificate pieces from shared JSON without runtime validation", () => {
  const pieces = milestoneCertificates();
  expect(pieces.map(piece => piece.title)).toEqual(certificates.en.map(item => item.title));
  expect(pieces.map(piece => piece.achieved)).toEqual([true, true, false, false]);
});
