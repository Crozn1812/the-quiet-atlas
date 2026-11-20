import { expect, it } from "vitest";
import { initialAdaptive, sampleQuality, selectManualQuality } from "../../../src/features/world/adaptive-quality";
import type { Quality } from "../../../src/features/world/terrain";

function run(ms: number, count: number, quality: Quality = "High", state = initialAdaptive()) {
  let result = { state, quality };
  for (let i = 0; i < count; i++) result = sampleQuality(result.state, ms, result.quality);
  return result;
}
it("waits for warm-up and a complete window, then lowers directly to Low", () => {
  const before = run(100, 79);
  expect(before.quality).toBe("High");
  const lowered = sampleQuality(before.state, 100, before.quality);
  expect(lowered.quality).toBe("Low");
  expect(run(10, 3000, lowered.quality, lowered.state).quality).toBe("Low");
  expect(run(100, 1000, "Low").quality).toBe("Low");
});
it("stays at Low after a reduction, including past the lock", () => {
  const first = run(100, 80);
  const locked = run(100, 129, first.quality, first.state);
  expect(locked.quality).toBe("Low");
  expect(sampleQuality(locked.state, 100, locked.quality).quality).toBe("Low");
});
it("manual selection disables auto and input states stay immutable", () => {
  const original = initialAdaptive();
  expect(run(100, 1000, "High", selectManualQuality(original)).quality).toBe("High");
  expect(original).toEqual(initialAdaptive());
});
it("uses p95 rather than a single hitch and rejects invalid samples", () => {
  let result = run(10, 500);
  result = sampleQuality(result.state, 100, result.quality);
  expect(run(10, 290, result.quality, result.state).quality).toBe("High");
  for (const ms of [NaN, Infinity, 0, -1]) {
    expect(sampleQuality(result.state, ms, result.quality).state).toBe(result.state);
  }
});

it("normalizes an obsolete in-memory tier before early returns", () => {
  const legacy = "Balanced";
  expect(sampleQuality(selectManualQuality(initialAdaptive()), 0, legacy as Quality).quality).toBe("High");
});
