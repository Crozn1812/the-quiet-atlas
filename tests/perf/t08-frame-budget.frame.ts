// L3-007 — T08 frame time (spec §8 "Low quality" + "Giật nặng", §13 T08; ADR 0007 reference machine).
// Method (§8, fixed before measuring): per run a fresh browser context → Welcome /en/ → Enter World → quality chosen in
// the world menu (manual choice also disables adaptive quality) → fixed route with real keys (W held, ← 1.5 s every 6 s)
// for 30 s warm-up + 60 s measured. Frame time = delta between consecutive requestAnimationFrame timestamps recorded in
// the page (no internal hook). Gate per run on Low: FPS avg ≥ 30, p95 ≤ 50 ms, ≤ 1 % frames > 100 ms, 0 frames > 250 ms.
// Reference only (never a gate): Balanced, and Low + DevTools CPU throttling 4× ("mô phỏng máy yếu", ADR 0007 §4; Low
// already caps the renderer DPR at 1.0). Renderer info (draw calls/geometries/textures via `container.__tqaPerf.info()`)
// is NOT RUN: the hook exists only with mountWorld({debug:true}), which the UI never passes.
// A run is INVALID (and its test fails) if the window lost focus / the world paused during the measured 60 s.
// HEADED Edge, maximised, real DPR — see playwright.frame.config.ts. T08_RUNS / T08_SCENARIOS (comma list) narrow a run.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { T08_METHOD, deltasFromTimestamps, evaluateT08, frameStats, toCsv, type T08Run } from "../../tools/frame-budget/index.mjs";
import { enterWorld, trackConsoleErrors } from "../e2e/helpers";
import { OUT_DIR, ROUTE, driveRoute, machineInfo, pageNow, selectQuality, startRecorder, stopRecorder, type Quality } from "./frame-harness";

const RUNS = Number(process.env.T08_RUNS ?? T08_METHOD.runs);
const SCENARIOS = [
  { id: "low", label: "Low", quality: "low" as Quality, gate: true, cpuThrottle: 1 },
  { id: "balanced", label: "Balanced (tham khảo)", quality: "balanced" as Quality, gate: false, cpuThrottle: 1 },
  { id: "low-cpu4x", label: "Low + CPU 4× (mô phỏng máy yếu)", quality: "low" as Quality, gate: false, cpuThrottle: 4 },
].filter(s => !process.env.T08_SCENARIOS || process.env.T08_SCENARIOS.split(",").includes(s.id));
// Local calendar date (the evidence file is named by it), not the UTC date.
const DATE = new Date().toLocaleDateString("sv-SE");

// Not "serial": a FAIL in one run must not skip the others (each run is gated on its own). The config runs one worker
// with fullyParallel off, so tests still run in declaration order.
for (let run = 1; run <= RUNS; run++) {
  for (const scenario of SCENARIOS) {
    test(`T08 run ${run} — ${scenario.label}`, async ({ page, browser }) => {
      test.setTimeout(5 * 60_000);
      const errors = trackConsoleErrors(page);
      const world = await enterWorld(page, "en");
      expect(world, "WebGL2 unavailable: T08 cannot run").toBeTruthy();
      await page.bringToFront();
      const machine = await machineInfo(browser, page);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(path.join(OUT_DIR, "machine.json"), JSON.stringify(machine, null, 2));

      await selectQuality(page, world!, scenario.quality);
      const focusAtStart = await page.evaluate(() => document.hasFocus());
      const cdp = await page.context().newCDPSession(page);
      if (scenario.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuThrottle });

      await startRecorder(page, world!);
      const t0 = await pageNow(page);
      await driveRoute(page, T08_METHOD.warmupMs + T08_METHOD.measureMs + 250);
      const recording = await stopRecorder(page);
      if (scenario.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

      const from = t0 + T08_METHOD.warmupMs;
      const to = from + T08_METHOD.measureMs;
      const deltas = deltasFromTimestamps(recording.stamps, from, to);
      const stats = frameStats(deltas);
      const { gates, status } = evaluateT08(stats);
      const inWindow = recording.events.filter(e => e.t >= from && e.t <= to);
      const interruptions = inWindow.filter(
        e => e.type === "window-blur" || e.type === "visibility-hidden" || (e.type === "world-state" && (e.detail as { paused?: boolean })?.paused === true),
      );
      const qualityAtEnd = await world!.getAttribute("data-world-quality");
      const pausedAtEnd = await world!.getAttribute("data-world-paused");
      const focusAtEnd = await page.evaluate(() => document.hasFocus() && document.visibilityState === "visible");
      // Seen once (2026-11-04, run 2 Balanced): rAF at a steady ~1 Hz with no blur/hidden event — the browser/OS stopped
      // producing frames for the window (e.g. display power-off). A world that renders slowly is never this regular.
      const oneHz = deltas.length > 0 && deltas.filter(d => d >= 900 && d <= 1_100).length / deltas.length >= 0.9;
      const invalidReasons = [
        ...(focusAtStart ? [] : ["window had no focus at start"]),
        ...(focusAtEnd ? [] : ["window not focused/visible at the end"]),
        ...(oneHz ? ["rAF ≈ 1 Hz without blur/hidden event: browser/OS frame throttling suspected"] : []),
        ...(interruptions.length ? [`${interruptions.length} pause/blur event(s) in the measured window`] : []),
        ...(qualityAtEnd === scenario.quality ? [] : [`quality changed to ${qualityAtEnd}`]),
        ...(pausedAtEnd === "false" ? [] : ["world paused at the end"]),
      ];
      const valid = invalidReasons.length === 0;

      const result: T08Run & Record<string, unknown> = {
        run,
        scenario: scenario.label,
        quality: scenario.quality,
        gate: scenario.gate,
        stats,
        status,
        valid,
        ...(valid ? {} : { invalidReason: invalidReasons.join("; ") }),
        gates,
        cpuThrottle: scenario.cpuThrottle,
        method: { ...T08_METHOD, route: ROUTE, frameSource: "requestAnimationFrame timestamps (in page)" },
        machine,
        events: recording.events,
        consoleErrors: errors,
        rendererInfo: "NOT RUN (container.__tqaPerf exists only with mountWorld debug:true; UI never passes it)",
        measuredAt: new Date().toISOString(),
      };
      const name = `t08-${DATE}-run${run}-${scenario.id}`;
      writeFileSync(path.join(OUT_DIR, `${name}.csv`), toCsv(deltas));
      writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(result, null, 2));
      const line = `run ${run} ${scenario.label}: frames ${stats.frames}, FPS ${stats.fpsAvg?.toFixed(1)}, p95 ${stats.p95Ms?.toFixed(1)} ms, >100 ms ${stats.over100Pct?.toFixed(2)} %, >250 ms ${stats.over250}, max ${stats.maxMs?.toFixed(1)} ms → ${status}${valid ? "" : ` (INVALID: ${invalidReasons.join("; ")})`}`;
      console.log(line);
      test.info().annotations.push({ type: scenario.gate ? "T08 gate" : "reference only", description: line });

      expect(errors, errors.join("\n")).toEqual([]);
      expect(invalidReasons, "measurement validity (focus/pause/quality)").toEqual([]);
      if (scenario.gate) {
        expect(gates.filter(g => g.status === "FAIL").map(g => `${g.label}: ${g.measured}`), `§8 Low gates, run ${run}`).toEqual([]);
      }
    });
  }
}
