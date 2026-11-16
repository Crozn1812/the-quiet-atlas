// B2-210: measured gameplay, never teleport or write to the controller.
// Prerequisite: pnpm build
// pnpm exec playwright test -c tests/perf/playwright.perf.config.ts journey.perf.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../e2e/test";
import { enterWorld, ensureWindowFocus } from "../e2e/helpers";
import { pathLength, pathPointAt } from "../../src/features/world/layout/path";
import { ZONES } from "../../src/features/world/layout/zones";

const OUT = path.resolve("test-results/journey");
const LIMIT_MS = 12 * 60_000;
type Position = { x: number; y: number; z: number };
type Hook = { position(): Position; cameraYaw(): number; zone(): string | null };
type Sample = { ms: number; position: Position; yaw: number; zone: string | null };
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// This file alone uses a visible hardware browser; the other perf tests keep their settings.
test.use({ headless: false, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge", viewport: { width: 1366, height: 800 } });

test("B2-210 main journey at walking speed", async ({ page, browser }) => {
  // Twelve minutes of walking plus setup/reporting; don't alter the shared config timeout.
  test.setTimeout(LIMIT_MS + 90_000);
  const samples: Sample[] = [];
  const arrivals: Record<string, number> = {};
  const transitions: { ms: number; zone: string | null }[] = [];
  const stuck: { fromMs: number; detectedMs: number }[] = [];
  let metres = 0;
  let totalMs: number | null = null;
  let status: "PASS" | "FAIL" | "NOT RUN" = "NOT RUN";
  let reason = "Journey has not started";
  let checks: Record<string, boolean> = {};
  let started = false;
  let turn: "ArrowLeft" | "ArrowRight" | null = null;
  try {
    await page.addInitScript(() => { (window as unknown as { __tqaJourney: boolean }).__tqaJourney = true; });
    const world = await enterWorld(page, "en");
    if (!world) {
      reason = "NOT RUN: WebGL2 unavailable; Lead must run on a browser with WebGL2";
      test.skip(true, reason);
      return;
    }
    await page.bringToFront();
    // Escape with no UI open opens the menu (spec §6.3) and pauses the world, so it is not pressed here.
    await ensureWindowFocus(page);
    await world.locator("canvas").focus();
    await expect(world).toHaveAttribute("data-world-intro", "done");
    await expect(world).toHaveAttribute("data-world-paused", "false");
    const read = () => world.evaluate(element => {
      const hook = (element as HTMLElement & { __tqaJourney?: Hook }).__tqaJourney;
      if (!hook) throw new Error("Missing opt-in journey hook: rebuild out/ before running");
      return { ms: performance.now(), position: hook.position(), yaw: hook.cameraYaw(), zone: hook.zone(),
        valid: !document.hidden && element.getAttribute("data-world-paused") === "false" };
    });
    const length = pathLength();
    const count = Math.ceil(length / 0.5);
    const route = Array.from({ length: count + 1 }, (_, i) => pathPointAt(i / count));
    let nearest = 0;
    let windowStart = 0;
    let inStuckEpisode = false;
    const initial = await read();
    const startMs = initial.ms;
    started = true;
    await page.keyboard.down("KeyW");
    let nextTick = startMs;
    for (;;) {
      const current = await read();
      const sample: Sample = { ...current, ms: current.ms - startMs };
      const previous = samples.at(-1);
      if (previous) metres += distance(previous.position, sample.position);
      samples.push(sample);
      if (!previous || previous.zone !== sample.zone) transitions.push({ ms: sample.ms, zone: sample.zone });
      for (const zone of ZONES) {
        if (arrivals[zone.id] === undefined && (sample.zone === zone.id ||
          Math.hypot(sample.position.x - zone.position.x, sample.position.z - zone.position.z) < zone.radius)) arrivals[zone.id] = sample.ms;
      }
      if (!current.valid) throw new Error("Journey interrupted by pause, blur or hidden tab");
      while (samples[windowStart + 1] && samples[windowStart + 1]!.ms <= sample.ms - 2_000) windowStart++;
      const anchor = samples[windowStart]!;
      const isStuck = sample.ms - anchor.ms >= 2_000 && distance(anchor.position, sample.position) < 0.3;
      if (isStuck && !inStuckEpisode) stuck.push({ fromMs: anchor.ms, detectedMs: sample.ms });
      // Count a continuous blockage once, re-arm only after observable movement.
      if (isStuck) inStuckEpisode = true;
      else if (distance(anchor.position, sample.position) >= 0.3) inStuckEpisode = false;
      if (arrivals["last-postcard"] !== undefined) { totalMs = sample.ms; break; }
      if (sample.ms >= LIMIT_MS) throw new Error("12 minute journey timeout before Last Postcard");
      // Local nearest search avoids jumping to a distant bend. Six metres of lookahead.
      let best = Infinity;
      let candidate = nearest;
      for (let i = Math.max(0, nearest - 40); i <= Math.min(count, nearest + 40); i++) {
        const point = route[i]!;
        const d = Math.hypot(sample.position.x - point.x, sample.position.z - point.z);
        if (d < best) { best = d; candidate = i; }
      }
      nearest = candidate;
      const target = pathPointAt(Math.min(1, nearest / count + 6 / length));
      // W moves (-sin(yaw), -cos(yaw)); ArrowLeft increases yaw.
      const error = wrap(Math.atan2(sample.position.x - target.x, sample.position.z - target.z) - sample.yaw);
      const desired = Math.abs(error) > 8 * Math.PI / 180 ? (error > 0 ? "ArrowLeft" : "ArrowRight") : null;
      if (desired !== turn) {
        if (turn) await page.keyboard.up(turn);
        if (desired) await page.keyboard.down(desired);
        turn = desired;
      }
      nextTick += 100;
      await page.waitForTimeout(Math.max(0, nextTick - current.ms));
    }
    checks = evaluateChecks();
    status = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
    reason = status === "PASS" ? "All measured gates passed" : "Measured gates failed; tune through playtest";
  } catch (error) {
    status = started ? "FAIL" : "NOT RUN";
    if (!reason.startsWith("NOT RUN:")) reason = String(error);
    throw error;
  } finally {
    try {
      await page.keyboard.up("KeyW");
      if (turn) await page.keyboard.up(turn);
    } finally {
      mkdirSync(OUT, { recursive: true });
      if (started) checks = evaluateChecks();
      const report = { status, reason, recordedAt: new Date().toISOString(), browser: browser.version(),
        method: "Real W only (no Shift), camera arrows above 8 degrees, 6 m lookahead, 100 ms sampling; zone radius entry from spawn, no cinematic/reading/secrets",
        totalMs, elapsedMs: samples.at(-1)?.ms ?? null, arrivals, transitions, metres, stuck, checks, samples };
      writeFileSync(path.join(OUT, "journey.json"), JSON.stringify(report, null, 2) + "\n");
      writeFileSync(path.join(OUT, "journey.md"), [
        `# Journey: ${status}`, "", reason, "", report.method, "",
        `Total: ${totalMs === null ? "not reached" : (totalMs / 1_000).toFixed(2) + " s"}; distance: ${metres.toFixed(2)} m; stuck: ${stuck.length}`, "",
        "| Zone | Arrival from spawn (s) |", "| --- | ---: |",
        ...ZONES.map(zone => `| ${zone.id} | ${arrivals[zone.id] === undefined ? "not reached" : (arrivals[zone.id]! / 1_000).toFixed(2)} |`), "",
        ...Object.entries(checks).map(([name, pass]) => `- ${pass ? "PASS" : "FAIL"}: ${name}`), "",
      ].join("\n"));
    }
  }
  expect(status, reason).toBe("PASS");

  function evaluateChecks() {
    return {
      // ADR 0017 (owner decision 2026-11-13) replaces spec §7.1 / §2.1 pacing targets.
      "Total 200–240 s": totalMs !== null && totalMs >= 200_000 && totalMs <= 240_000,
      "Workshop 25–45 s": arrivals.workshop !== undefined && arrivals.workshop >= 25_000 && arrivals.workshop <= 45_000,
      "Roots ≤60 s": arrivals.roots !== undefined && arrivals.roots <= 60_000,
      "Milestones ≤60 s": arrivals.milestones !== undefined && arrivals.milestones <= 60_000,
      "Zero stuck episodes": stuck.length === 0,
    };
  }
});
