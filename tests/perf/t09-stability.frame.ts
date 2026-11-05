// L3-007 — T09 stability (spec §8 "Stability", §13 T09): 10 min of movement + 20 open/close cycles (world menu AND
// content overlay), no crash/stuck, resource counts stable after warm-up. Long: runs only with PERF_LONG=1.
// Method (fixed before running):
//   - Default product quality (Balanced, adaptive quality on — as a viewer gets it). HEADED Edge (real focus), maximised.
//   - Fixed route with real keys (W held, ← 1.5 s every 6 s). Every 30 s (20 times, t = 15 s … 585 s) movement stops and
//     one cycle runs: Esc opens the menu → Esc closes it; then the content overlay opens (E when the world hints a target,
//     otherwise a dispatched `tqa:open-content` for first-light/workshop/roots in turn — "mô phỏng", annotated) → Esc closes.
//   - Sample at t = 0 and after every cycle (closed state, after a forced GC through CDP HeapProfiler.collectGarbage):
//     JS heap (performance.memory.usedJSHeapSize + CDP JSHeapUsedSize), DOM nodes, JS event listeners, documents,
//     canvas count, open dialogs, live WebGL objects (buffers/textures/programs/shaders/framebuffers/renderbuffers/VAOs,
//     counted by an init script around create*/delete*), draw calls per frame. Renderer `info()` (`__tqaPerf`) is NOT RUN.
//   - Trend after a 120 s warm-up: tools/frame-budget classifyTrend (heap tolerance 10 %, counts 5 %).
//   - Heap snapshots (CDP) after warm-up and at the end → test-results/frame-budget/ (not committed: large).
//   - L4-011: visibilityState / hasFocus / rAF frames per 10 s logged every 10 s → t09-visibility.csv + t09.json (information only).
// PASS = no crash/page error, world still running/unpaused and responsive at the end, every trend "ổn định".
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type CDPSession, type Locator, type Page } from "../e2e/test"; // skips the opening cinematic
import { classifyTrend, deltasFromTimestamps, formatT09Markdown, frameStats, toCsv, type Trend } from "../../tools/frame-budget/index.mjs";
import { enterWorld, trackConsoleErrors } from "../e2e/helpers";
import { OUT_DIR, ROUTE, driveRoute, installGlCounter, machineInfo, pageNow, startRecorder, stopRecorder } from "./frame-harness";

const DURATION_MS = Number(process.env.T09_DURATION_MS ?? 10 * 60_000);
const CYCLES = Number(process.env.T09_CYCLES ?? 20);
const CYCLE_EVERY_MS = DURATION_MS / CYCLES;
const WARMUP_MS = Number(process.env.T09_WARMUP_MS ?? 120_000);
const ZONES = ["first-light", "workshop", "roots"] as const;

type Sample = Record<string, number | string | null> & { tMs: number };

async function takeSample(page: Page, cdp: CDPSession, world: Locator, tMs: number): Promise<Sample> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const metric = (name: string) => metrics.find(m => m.name === name)?.value ?? null;
  const inPage = await world.evaluate(element => {
    const gl = (window as unknown as { __tqaGl: { live: Record<string, number>; draws: number } }).__tqaGl;
    const frames = (window as unknown as { __tqaFrames: { stamps: number[] } }).__tqaFrames.stamps.length;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return {
      usedJSHeapSize: memory?.usedJSHeapSize ?? null,
      canvases: document.querySelectorAll("canvas").length,
      openDialogs: document.querySelectorAll("dialog[open]").length,
      dialogs: document.querySelectorAll("dialog").length,
      glLive: { ...gl.live },
      glLiveTotal: Object.values(gl.live).reduce((s, n) => s + n, 0),
      draws: gl.draws,
      frames,
      appMode: document.querySelector("[data-app-mode]")?.getAttribute("data-app-mode") ?? null,
      paused: element.getAttribute("data-world-paused"),
      quality: element.getAttribute("data-world-quality"),
    };
  });
  const { glLive, ...rest } = inPage;
  return {
    tMs,
    ...rest,
    ...Object.fromEntries(Object.entries(glLive).map(([k, v]) => [`gl${k}`, v])),
    cdpJSHeapUsedSize: metric("JSHeapUsedSize"),
    nodes: metric("Nodes"),
    jsEventListeners: metric("JSEventListeners"),
    documents: metric("Documents"),
    layoutObjects: metric("LayoutObjects"),
  };
}

async function heapSnapshot(cdp: CDPSession, file: string) {
  const stream = createWriteStream(file);
  const onChunk = ({ chunk }: { chunk: string }) => void stream.write(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await new Promise<void>(resolve => stream.end(resolve));
}

/** One open/close cycle: world menu, then the content overlay. Returns how the overlay was opened. */
async function openCloseCycle(page: Page, world: Locator, i: number) {
  const menu = page.locator(".world-menu dialog");
  const overlay = page.locator("dialog.world-content");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");

  const hint = await world.getAttribute("data-world-hint");
  let how: string;
  if (hint) {
    await page.keyboard.press("e");
    how = `E (${hint})`;
  } else {
    const zoneId = ZONES[i % ZONES.length];
    await world.evaluate((element, zone) => element.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId: zone } })), zoneId);
    how = `dispatch (${zoneId})`;
  }
  await expect(overlay).toHaveAttribute("open", "");
  await expect(page.locator("#world-content-title")).toBeFocused();
  await expect(world).toHaveAttribute("data-world-paused", "true");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await expect(overlay).not.toHaveAttribute("open", "");
  await expect(world).toHaveAttribute("data-world-paused", "false");
  await expect(world).toBeFocused();
  return how;
}

test("T09 stability: 10 min movement + 20 menu/overlay open-close cycles, resource counts after warm-up", async ({ page, browser }) => {
  test.skip(process.env.PERF_LONG !== "1", "NOT RUN: long test, set PERF_LONG=1");
  test.setTimeout(DURATION_MS + 6 * 60_000);
  const errors = trackConsoleErrors(page);
  let crashed = false;
  page.on("crash", () => void (crashed = true));
  await page.addInitScript(installGlCounter);

  const world = await enterWorld(page, "en");
  expect(world, "WebGL2 unavailable: T09 cannot run").toBeTruthy();
  await page.bringToFront();
  await world!.focus();
  await expect(world!).toHaveAttribute("data-world-paused", "false");
  const machine = await machineInfo(browser, page);
  mkdirSync(OUT_DIR, { recursive: true });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  await startRecorder(page, world!);
  const t0 = await pageNow(page);

  // L4-011: every 10 s (Node-side timer, not throttled with the page) log document.visibilityState, document.hasFocus()
  // and the rAF frames recorded in the last ~10 s, to tell a hidden/unfocused/occluded window from a slow world.
  type VisibilityEntry = { wallS: number; pageS: number | null; visibility: string; hasFocus: boolean | null; frames: number | null; framesLast10s: number | null; paused: string | null };
  const visibilityLog: VisibilityEntry[] = [];
  const wallStart = Date.now();
  let lastFrames = 0;
  const logVisibility = async () => {
    try {
      const v = await page.evaluate(() => ({
        pageMs: performance.now(),
        visibility: document.visibilityState,
        hasFocus: document.hasFocus(),
        frames: (window as unknown as { __tqaFrames?: { stamps: number[] } }).__tqaFrames?.stamps.length ?? null,
        paused: document.querySelector("[data-world-chunk]")?.getAttribute("data-world-paused") ?? null,
      }));
      const entry: VisibilityEntry = {
        wallS: Math.round((Date.now() - wallStart) / 1000),
        pageS: Math.round((v.pageMs - t0) / 100) / 10,
        visibility: v.visibility,
        hasFocus: v.hasFocus,
        frames: v.frames,
        framesLast10s: v.frames === null ? null : v.frames - lastFrames,
        paused: v.paused,
      };
      // The recorder restarts at the end (fresh stamps array): a negative delta is that restart, not a rAF count.
      if (entry.framesLast10s !== null && entry.framesLast10s < 0) entry.framesLast10s = null;
      lastFrames = v.frames ?? 0;
      visibilityLog.push(entry);
      console.log(`T09 vis t=${entry.wallS}s visibility=${entry.visibility} hasFocus=${entry.hasFocus} paused=${entry.paused} rAF/10s=${entry.framesLast10s}`);
    } catch (error) {
      visibilityLog.push({ wallS: Math.round((Date.now() - wallStart) / 1000), pageS: null, visibility: `error: ${(error as Error).message.split("\n")[0]}`, hasFocus: null, frames: null, framesLast10s: null, paused: null });
    }
  };
  const visibilityTimer = setInterval(() => void logVisibility(), 10_000);
  page.on("close", () => clearInterval(visibilityTimer));
  await logVisibility();

  const samples: Sample[] = [await takeSample(page, cdp, world!, 0)];
  const cycles: { i: number; tMs: number; overlay: string }[] = [];
  let snapshotAfterWarmup = false;
  const start = Date.now();
  for (let i = 0; i < CYCLES; i++) {
    // Move until the middle of this 30 s slot, run the cycle, sample, move until the end of the slot.
    const cycleAt = i * CYCLE_EVERY_MS + CYCLE_EVERY_MS / 2;
    await driveRoute(page, Math.max(0, cycleAt - (Date.now() - start)));
    const overlayHow = await openCloseCycle(page, world!, i);
    const tMs = (await pageNow(page)) - t0;
    cycles.push({ i: i + 1, tMs, overlay: overlayHow });
    samples.push(await takeSample(page, cdp, world!, tMs));
    if (!snapshotAfterWarmup && tMs >= WARMUP_MS) {
      await heapSnapshot(cdp, path.join(OUT_DIR, "t09-after-warmup.heapsnapshot"));
      snapshotAfterWarmup = true;
    }
    console.log(`T09 cycle ${i + 1}/${CYCLES} at ${(tMs / 1000).toFixed(0)} s: overlay via ${overlayHow}; heap ${(Number(samples.at(-1)!.cdpJSHeapUsedSize) / 2 ** 20).toFixed(1)} MB, GL live ${samples.at(-1)!.glLiveTotal}, listeners ${samples.at(-1)!.jsEventListeners}`);
    await driveRoute(page, Math.max(0, (i + 1) * CYCLE_EVERY_MS - (Date.now() - start)));
  }

  // Responsiveness at the end: the world still renders frames, is unpaused, and the menu opens/closes.
  clearInterval(visibilityTimer);
  await logVisibility();
  writeFileSync(
    path.join(OUT_DIR, "t09-visibility.csv"),
    ["wallS,pageS,visibility,hasFocus,paused,frames,framesLast10s", ...visibilityLog.map(e => [e.wallS, e.pageS, e.visibility, e.hasFocus, e.paused, e.frames, e.framesLast10s].join(","))].join("\n"),
  );
  const whole = await stopRecorder(page);
  await startRecorder(page, world!);
  await page.waitForTimeout(2_000);
  const framesAfter = (await stopRecorder(page)).stamps.length;
  const appMode = await page.locator("[data-app-mode]").getAttribute("data-app-mode");
  await heapSnapshot(cdp, path.join(OUT_DIR, "t09-end.heapsnapshot"));

  // Frame times over the whole run, cycles included (information only; T08 is the frame gate).
  const wholeDeltas = deltasFromTimestamps(whole.stamps);
  writeFileSync(path.join(OUT_DIR, "t09-frames.csv"), toCsv(wholeDeltas));
  const wholeStats = frameStats(wholeDeltas);
  const recordingNote = `frames during the run: ${wholeStats.frames} (FPS avg ${wholeStats.fpsAvg?.toFixed(1)}, p95 ${wholeStats.p95Ms?.toFixed(1)} ms, max ${wholeStats.maxMs?.toFixed(1)} ms); frames in 2 s after the run: ${framesAfter}`;

  const series = (key: string) => samples.map(s => ({ tMs: s.tMs, value: Number(s[key]) }));
  const metrics: Record<string, { key: string; tolerance: number }> = {
    "JS heap (CDP JSHeapUsedSize, sau GC)": { key: "cdpJSHeapUsedSize", tolerance: 0.1 },
    "JS heap (performance.memory, sau GC)": { key: "usedJSHeapSize", tolerance: 0.1 },
    "DOM nodes": { key: "nodes", tolerance: 0.05 },
    "JS event listeners": { key: "jsEventListeners", tolerance: 0.05 },
    "Canvas": { key: "canvases", tolerance: 0.05 },
    "Dialog elements": { key: "dialogs", tolerance: 0.05 },
    "WebGL objects live (tổng)": { key: "glLiveTotal", tolerance: 0.05 },
    "WebGL buffers live": { key: "glBuffer", tolerance: 0.05 },
    "WebGL textures live": { key: "glTexture", tolerance: 0.05 },
    "WebGL programs live": { key: "glProgram", tolerance: 0.05 },
  };
  const trends: Record<string, Trend> = Object.fromEntries(
    Object.entries(metrics).map(([label, { key, tolerance }]) => [label, classifyTrend(series(key), { warmupMs: WARMUP_MS, tolerance })]),
  );
  const growing = Object.entries(trends).filter(([, t]) => t.trend === "tăng liên tục").map(([label]) => label);
  const drawsPerFrame = samples.slice(1).map((s, i) => {
    const prev = samples[i]!;
    const frames = Number(s.frames) - Number(prev.frames);
    return frames > 0 ? (Number(s.draws) - Number(prev.draws)) / frames : null;
  });

  const result = {
    measuredAt: new Date().toISOString(),
    machine,
    method: { durationMs: DURATION_MS, cycles: CYCLES, cycleEveryMs: CYCLE_EVERY_MS, warmupMs: WARMUP_MS, route: ROUTE, quality: "default (balanced, adaptive on)" },
    crashed,
    consoleErrors: errors,
    end: { appMode, paused: await world!.getAttribute("data-world-paused"), quality: await world!.getAttribute("data-world-quality"), framesIn2s: framesAfter },
    recordingNote,
    frameStats: wholeStats,
    cycles,
    visibilityLog,
    visibilitySummary: {
      entries: visibilityLog.length,
      notVisible: visibilityLog.filter(e => e.visibility !== "visible").length,
      notFocused: visibilityLog.filter(e => e.hasFocus === false).length,
      lowRaf: visibilityLog.filter(e => e.framesLast10s !== null && e.framesLast10s < 100).map(e => e.wallS),
    },
    samples,
    drawsPerFrame,
    trends,
    conclusion: growing.length ? `tăng liên tục: ${growing.join(", ")}` : "ổn định",
    rendererInfo: "NOT RUN (container.__tqaPerf exists only with mountWorld debug:true; UI never passes it). GL object counts come from the init-script counter instead.",
  };
  writeFileSync(path.join(OUT_DIR, "t09.json"), JSON.stringify(result, null, 2));
  console.log(`\n${formatT09Markdown(trends)}\n\nconclusion: ${result.conclusion}; ${recordingNote}`);

  expect(crashed, "page crashed").toBe(false);
  expect(errors, errors.join("\n")).toEqual([]);
  expect(appMode, "still in world mode (not stuck/fallen back)").toBe("world");
  expect(await world!.getAttribute("data-world-paused")).toBe("false");
  expect(framesAfter, "world still rendering").toBeGreaterThan(10);
  await openCloseCycle(page, world!, 0);
  expect(growing, "T09: resource counts / heap growing after warm-up").toEqual([]);
});
