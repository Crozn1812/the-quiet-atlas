// L3-007 — unit tests for tools/frame-budget (T08 stats/gates per spec §8, T09 trend classification).
import { describe, expect, it } from "vitest";
import {
  T08_LIMITS,
  T08_METHOD,
  classifyTrend,
  deltasFromTimestamps,
  evaluateT08,
  formatT08Markdown,
  formatT09Markdown,
  frameStats,
  linearFit,
  percentile,
  toCsv,
} from "../../../tools/frame-budget/index.mjs";

const repeat = (value: number, n: number) => Array.from({ length: n }, () => value);

describe("§8 limits and method are the spec values", () => {
  it("keeps the thresholds verbatim", () => {
    expect(T08_LIMITS).toEqual({ fpsAvgMin: 30, p95MaxMs: 50, over100PctMax: 1, over250Max: 0 });
    expect(T08_METHOD).toEqual({ warmupMs: 30_000, measureMs: 60_000, runs: 3 });
    expect(Object.isFrozen(T08_LIMITS)).toBe(true);
  });
});

describe("percentile (nearest rank)", () => {
  it("returns the nearest-rank value", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 100)).toBe(100);
    expect(percentile([7, 1, 3], 95)).toBe(7);
  });
  it("handles empty input and rejects bad p", () => {
    expect(percentile([], 95)).toBeNull();
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });
});

describe("deltasFromTimestamps", () => {
  it("uses only timestamps inside the window", () => {
    expect(deltasFromTimestamps([0, 10, 25, 40, 60], 10, 40)).toEqual([15, 15]);
    expect(deltasFromTimestamps([0, 16, 33])).toEqual([16, 17]);
    expect(deltasFromTimestamps([5])).toEqual([]);
  });
});

describe("frameStats + evaluateT08", () => {
  it("passes a steady 60 FPS run", () => {
    const stats = frameStats(repeat(1000 / 60, 3600));
    expect(stats.frames).toBe(3600);
    expect(stats.fpsAvg).toBeCloseTo(60, 6);
    expect(stats.over100).toBe(0);
    const result = evaluateT08(stats);
    expect(result.status).toBe("PASS");
    expect(result.gates.map(g => g.status)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
  });

  it("computes FPS as frames / total time, not the mean of per-frame FPS", () => {
    // 1 frame of 1000 ms + 99 frames of 10 ms: 100 frames in 1.99 s → 50.25 FPS (mean of 1000/d would be ~99).
    const stats = frameStats([1000, ...repeat(10, 99)]);
    expect(stats.fpsAvg).toBeCloseTo(100 / 1.99, 6);
  });

  it("fails on a single frame > 250 ms even when averages are fine", () => {
    const stats = frameStats([...repeat(16, 2000), 251]);
    expect(stats.over250).toBe(1);
    const result = evaluateT08(stats);
    expect(result.status).toBe("FAIL");
    expect(result.gates.find(g => g.id === "over-250")?.status).toBe("FAIL");
    expect(result.gates.find(g => g.id === "fps-avg")?.status).toBe("PASS");
  });

  it("treats the limits as inclusive: exactly 30 FPS, p95 = 50 ms, 1 % > 100 ms passes", () => {
    // 100 frames: 1 of 101 ms, the rest chosen so p95 = 50 ms and the total is 100/30 s.
    const rest = repeat(50, 99);
    const stats = frameStats([101, ...rest]);
    expect(stats.p95Ms).toBe(50);
    expect(stats.over100Pct).toBe(1);
    const gates = evaluateT08({ ...stats, fpsAvg: 30 }).gates;
    expect(gates.map(g => g.status)).toEqual(["PASS", "PASS", "PASS", "PASS"]);
  });

  it("fails just over each limit", () => {
    const stats = frameStats([...repeat(16, 97), 101, 102, 103]); // 3 % > 100 ms
    expect(evaluateT08(stats).gates.find(g => g.id === "over-100")?.status).toBe("FAIL");
    const slow = frameStats(repeat(51, 100)); // ~19.6 FPS, p95 51 ms
    const gates = evaluateT08(slow).gates;
    expect(gates.find(g => g.id === "fps-avg")?.status).toBe("FAIL");
    expect(gates.find(g => g.id === "p95")?.status).toBe("FAIL");
  });

  it("FAILs every gate when nothing was measured", () => {
    const result = evaluateT08(frameStats([]));
    expect(result.status).toBe("FAIL");
    expect(result.gates.every(g => g.status === "FAIL")).toBe(true);
  });
});

describe("toCsv", () => {
  it("writes cumulative time and frame time", () => {
    expect(toCsv([16, 17.5])).toBe("index,t_ms,frame_ms\n0,16.000,16.000\n1,33.500,17.500\n");
  });
});

describe("linearFit + classifyTrend", () => {
  it("fits a line", () => {
    const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.r2).toBeCloseTo(1);
  });

  const series = (values: number[], stepMs = 30_000) => values.map((value, i) => ({ tMs: i * stepMs, value }));

  it("ignores warm-up samples and calls a flat series stable", () => {
    const trend = classifyTrend(series([10, 50, 100, 101, 100, 99, 100, 101, 100]), { warmupMs: 60_000, tolerance: 0.1 });
    expect(trend.trend).toBe("ổn định");
    expect(trend.points).toBe(7);
  });

  it("calls a steadily rising series growing", () => {
    const trend = classifyTrend(series([100, 110, 120, 130, 140, 150, 160]), { warmupMs: 0, tolerance: 0.1 });
    expect(trend.trend).toBe("tăng liên tục");
  });

  it("does not call GC saw-tooth noise growing", () => {
    const trend = classifyTrend(series([100, 130, 95, 128, 97, 131, 99, 125, 112]), { warmupMs: 0, tolerance: 0.1 });
    expect(trend.trend).toBe("ổn định");
  });

  it("needs at least 3 samples after warm-up", () => {
    expect(classifyTrend(series([1, 2, 3]), { warmupMs: 40_000 }).trend).toBe("không đủ mẫu");
  });
});

describe("markdown", () => {
  it("renders one row per run with PASS/FAIL and reference labels", () => {
    const stats = frameStats(repeat(10, 6000));
    const md = formatT08Markdown([
      { run: 1, scenario: "Low", quality: "low", gate: true, stats, status: "PASS", valid: true },
      { run: 1, scenario: "Balanced", quality: "balanced", gate: false, stats, status: "PASS", valid: false, invalidReason: "window blur" },
    ]);
    expect(md).toContain("| 1 | Low | low | gate | 6000 | 100.0 | 10.0 | 0.00 | 0 | 10.0 | ok | PASS |");
    expect(md).toContain("KHÔNG HỢP LỆ: window blur");
    expect(md).toContain("PASS (tham khảo, không phải gate)");
  });

  it("renders T09 trends", () => {
    const md = formatT09Markdown({
      heap: classifyTrend([0, 1, 2, 3].map(i => ({ tMs: i * 1000, value: 100 })), { warmupMs: 0 }),
      canvases: { trend: "không đủ mẫu", points: 1 },
    });
    expect(md).toContain("| heap | 4 | 100 | 100 |");
    expect(md).toContain("| canvases | 1 | — | — | — | — | — | — | không đủ mẫu |");
  });
});
