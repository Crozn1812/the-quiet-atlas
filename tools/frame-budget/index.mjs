#!/usr/bin/env node
// L3-007 — frame-time statistics and gates for T08 (spec §8 "Low quality" + "Giật nặng") and trend analysis for T09
// (spec §8 "Stability", §13 T09). Node built-ins only; pure functions are unit-tested in tests/unit/tools/frame-budget.test.ts.
//
// T08 limits are copied verbatim from spec §8 and MUST NOT be changed after a measurement (CLAUDE.md §6):
//   FPS average ≥ 30; p95 frame time ≤ 50 ms; ≤ 1 % of frames > 100 ms; 0 frames > 250 ms in the steady segment.
// Gates are evaluated per run (§8 "đánh giá từng lần"), never on an average of runs.
//
// CLI: node tools/frame-budget/index.mjs report [dir=test-results/frame-budget]
//   → prints the T08 markdown table built from every t08-*.json in dir (and the T09 summary if t09.json exists).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** spec §8 — Low quality + Giật nặng. Do not edit (thresholds are fixed before benchmarking). */
export const T08_LIMITS = Object.freeze({
  fpsAvgMin: 30,
  p95MaxMs: 50,
  over100PctMax: 1,
  over250Max: 0,
});

/** spec §8 method: warm-up 30 s, fixed route 60 s, three runs. */
export const T08_METHOD = Object.freeze({ warmupMs: 30_000, measureMs: 60_000, runs: 3 });

/** Nearest-rank percentile (p in (0, 100]) of a list of numbers; null for an empty list. */
export function percentile(values, p) {
  if (!values.length) return null;
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile p must be in (0, 100], got ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * Frame deltas (ms) from requestAnimationFrame timestamps (ms). Only timestamps within [from, to] are used, so the
 * first delta is the interval between the first two frames inside the window.
 */
export function deltasFromTimestamps(timestamps, from = -Infinity, to = Infinity) {
  const inside = timestamps.filter(t => t >= from && t <= to);
  const deltas = [];
  for (let i = 1; i < inside.length; i++) deltas.push(inside[i] - inside[i - 1]);
  return deltas;
}

/** Statistics of a list of frame times (ms). FPS average = frames / total time (not the mean of per-frame FPS). */
export function frameStats(deltas) {
  const frames = deltas.length;
  const durationMs = deltas.reduce((sum, d) => sum + d, 0);
  const over100 = deltas.filter(d => d > 100).length;
  const over250 = deltas.filter(d => d > 250).length;
  return {
    frames,
    durationMs,
    fpsAvg: durationMs > 0 ? (frames * 1000) / durationMs : null,
    meanMs: frames ? durationMs / frames : null,
    p50Ms: percentile(deltas, 50),
    p95Ms: percentile(deltas, 95),
    p99Ms: percentile(deltas, 99),
    maxMs: frames ? Math.max(...deltas) : null,
    over100,
    over100Pct: frames ? (over100 / frames) * 100 : null,
    over250,
  };
}

/** §8 gates for one run. A run with no frames FAILs every gate (nothing was measured, so nothing passed). */
export function evaluateT08(stats, limits = T08_LIMITS) {
  const gate = (id, label, measured, limit, ok) => ({ id, label, measured, limit, status: measured !== null && ok ? "PASS" : "FAIL" });
  const gates = [
    gate("fps-avg", "FPS TB ≥ 30", stats.fpsAvg, limits.fpsAvgMin, stats.fpsAvg !== null && stats.fpsAvg >= limits.fpsAvgMin),
    gate("p95", "p95 ≤ 50 ms", stats.p95Ms, limits.p95MaxMs, stats.p95Ms !== null && stats.p95Ms <= limits.p95MaxMs),
    gate("over-100", "≤ 1 % frame > 100 ms", stats.over100Pct, limits.over100PctMax, stats.over100Pct !== null && stats.over100Pct <= limits.over100PctMax),
    gate("over-250", "0 frame > 250 ms", stats.frames ? stats.over250 : null, limits.over250Max, stats.over250 <= limits.over250Max),
  ];
  return { gates, status: gates.every(g => g.status === "PASS") ? "PASS" : "FAIL" };
}

/** CSV of one run: frame index, time since the measured segment started (ms), frame time (ms). */
export function toCsv(deltas) {
  const lines = ["index,t_ms,frame_ms"];
  let t = 0;
  deltas.forEach((d, i) => {
    t += d;
    lines.push(`${i},${t.toFixed(3)},${d.toFixed(3)}`);
  });
  return `${lines.join("\n")}\n`;
}

/** Ordinary least squares y = a + b·x with r². */
export function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept: my - slope * mx, r2 };
}

/**
 * T09 trend of one metric after warm-up (§8: "Sau warm-up theo dõi resource count và xu hướng; tăng liên tục thì điều tra").
 * Method (L3-007, recorded before the run): use samples with t ≥ warmupMs. The metric is "tăng liên tục" (growing) when
 *   - net growth (last − first) > tolerance × max(1, first)  AND
 *   - OLS slope > 0 with r² ≥ 0.5 (a consistent upward line, not GC saw-tooth noise)  AND
 *   - ≥ 70 % of consecutive steps are non-decreasing.
 * Otherwise "ổn định" (stable). Fewer than 3 post-warm-up samples → "không đủ mẫu" (insufficient).
 */
export function classifyTrend(samples, { warmupMs, tolerance = 0.1 } = { warmupMs: 0 }) {
  const points = samples.filter(s => s.tMs >= warmupMs && Number.isFinite(s.value));
  if (points.length < 3) return { trend: "không đủ mẫu", points: points.length };
  const xs = points.map(p => p.tMs / 60_000);
  const ys = points.map(p => p.value);
  const fit = linearFit(xs, ys);
  const first = ys[0];
  const last = ys[ys.length - 1];
  const growth = last - first;
  let up = 0;
  for (let i = 1; i < ys.length; i++) if (ys[i] >= ys[i - 1]) up++;
  const nonDecreasing = up / (ys.length - 1);
  const growing = growth > tolerance * Math.max(1, Math.abs(first)) && fit.slope > 0 && fit.r2 >= 0.5 && nonDecreasing >= 0.7;
  return {
    trend: growing ? "tăng liên tục" : "ổn định",
    points: points.length,
    first,
    last,
    min: Math.min(...ys),
    max: Math.max(...ys),
    growth,
    slopePerMin: fit.slope,
    r2: fit.r2,
    nonDecreasing,
  };
}

const fmt = (value, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits));

/** Markdown table of T08 runs: one row per (run, scenario). */
export function formatT08Markdown(runs) {
  const header = "| Lần | Kịch bản | Quality | Gate? | Frames | FPS TB | p95 (ms) | % > 100 ms | Frames > 250 ms | Max (ms) | Focus/pause | Kết quả |";
  const rows = runs.map(r => {
    const s = r.stats;
    const result = r.gate ? r.status : `${r.status} (tham khảo, không phải gate)`;
    return `| ${r.run} | ${r.scenario} | ${r.quality} | ${r.gate ? "gate" : "tham khảo"} | ${s.frames} | ${fmt(s.fpsAvg)} | ${fmt(s.p95Ms)} | ${fmt(s.over100Pct, 2)} | ${s.over250} | ${fmt(s.maxMs)} | ${r.valid ? "ok" : `KHÔNG HỢP LỆ: ${r.invalidReason}`} | ${result} |`;
  });
  return [header, "|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}

/** Markdown table of T09 metric trends. */
export function formatT09Markdown(trends) {
  const header = "| Chỉ số | Mẫu sau warm-up | Đầu | Cuối | Min | Max | Độ dốc / phút | r² | Kết luận |";
  const rows = Object.entries(trends).map(([name, t]) =>
    t.trend === "không đủ mẫu"
      ? `| ${name} | ${t.points} | — | — | — | — | — | — | không đủ mẫu |`
      : `| ${name} | ${t.points} | ${fmt(t.first, 0)} | ${fmt(t.last, 0)} | ${fmt(t.min, 0)} | ${fmt(t.max, 0)} | ${fmt(t.slopePerMin, 2)} | ${fmt(t.r2, 2)} | ${t.trend} |`,
  );
  return [header, "|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const [command, dirArg] = argv;
  if (command !== "report") {
    console.error("usage: node tools/frame-budget/index.mjs report [dir=test-results/frame-budget]");
    return 2;
  }
  const dir = path.resolve(dirArg ?? "test-results/frame-budget");
  if (!existsSync(dir)) {
    console.error(`no results directory: ${dir}`);
    return 1;
  }
  const runs = readdirSync(dir)
    .filter(f => /^t08-.*\.json$/.test(f))
    .sort()
    .map(f => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
    // Per run: the gate scenario first, then the reference ones.
    .sort((a, b) => a.run - b.run || Number(b.gate) - Number(a.gate) || String(a.scenario).localeCompare(String(b.scenario)));
  if (runs.length) console.log(formatT08Markdown(runs));
  const t09 = path.join(dir, "t09.json");
  if (existsSync(t09)) console.log(`\n${formatT09Markdown(JSON.parse(readFileSync(t09, "utf8")).trends)}`);
  if (!runs.length && !existsSync(t09)) {
    console.error(`no t08-*.json or t09.json in ${dir}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
