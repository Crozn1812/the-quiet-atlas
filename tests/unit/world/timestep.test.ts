import { expect, it } from "vitest";
import { FIXED_DT, limitSteps, MAX_STEPS } from "../../../src/features/world/timestep";
it("accumulates partial frames", () => {
  const first = limitSteps(0, FIXED_DT / 2);
  expect(first.steps).toBe(0);
  expect(limitSteps(first.remainder, FIXED_DT / 2)).toEqual({ steps: 1, remainder: 0 });
});
it("drops suspended backlog and rejects invalid elapsed time", () => {
  expect(limitSteps(0, 600)).toEqual({ steps: MAX_STEPS, remainder: 0 });
  expect(limitSteps(0, 0).steps).toBe(0);
  for (const elapsed of [-1, NaN, Infinity]) expect(limitSteps(0, elapsed).steps).toBe(0);
});
