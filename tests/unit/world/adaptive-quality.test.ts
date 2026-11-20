import { expect, it } from "vitest";
import { initialAdaptive, QUALITY_WARMUP_MS, sampleQuality, selectManualQuality } from "../../../src/features/world/adaptive-quality";
import type { Quality } from "../../../src/features/world/terrain";

function run(ms: number, count: number, quality: Quality = "High", state = initialAdaptive()) {
  let result = { state, quality };
  for (let i = 0; i < count; i++) result = sampleQuality(result.state, ms, result.quality);
  return result;
}
// QF: three consecutive slow 3 s windows after the 5 s warm-up (14 s of 100 ms frames).
it("waits for warm-up and three slow windows, then lowers directly to Low", () => {
  const before = run(100, 139);
  expect(before.quality).toBe("High");
  const lowered = sampleQuality(before.state, 100, before.quality);
  expect(lowered.quality).toBe("Low");
  expect(run(10, 3000, lowered.quality, lowered.state).quality).toBe("Low");
  expect(run(100, 1000, "Low").quality).toBe("Low");
});
it("stays at Low after a reduction, including past the lock", () => {
  const first = run(100, 140);
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

it("QF: keeps High through streaming hitches when the typical frame is fast", () => {
  let state = { ...initialAdaptive(), elapsed: QUALITY_WARMUP_MS, lockedUntil: 0 };
  let quality: "High" | "Low" = "High";
  // 10% of frames hitch at 120 ms (p95 slow), the median frame is 12 ms.
  for (let i = 0; i < 400; i++) {
    const result = sampleQuality(state, i % 10 === 0 ? 120 : 12, quality);
    state = result.state; quality = result.quality;
  }
  expect(quality).toBe("High");
  for (let i = 0; i < 400; i++) {
    const result = sampleQuality(state, 45, quality);
    state = result.state; quality = result.quality;
  }
  expect(quality).toBe("Low");
});
