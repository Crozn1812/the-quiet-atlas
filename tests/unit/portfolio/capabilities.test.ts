import { expect, it } from "vitest";
import { worldEligibility } from "@/components/portfolio/capabilities";

it.each([
  [{ webgl2: true, finePointer: true, width: 1024 }, "eligible"],
  [{ webgl2: false, finePointer: true, width: 1280 }, "webgl2"],
  [{ webgl2: true, finePointer: false, width: 1280 }, "pointer"],
  [{ webgl2: true, finePointer: true, width: 1023 }, "width"],
] as const)("selects experience for %j", (input, expected) => {
  expect(worldEligibility(input)).toBe(expected);
});
