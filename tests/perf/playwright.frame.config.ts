// L3-007 — Playwright config for T08 (frame time) and T09 (stability) on the ADR 0007 reference machine (spec §8, §13).
// Separate from playwright.config.ts (`pnpm test:e2e`) and playwright.perf.config.ts (load budget) because these runs are
// long and must be HEADED: a headless window has no real focus, so the world pauses (windowBlur) and the fixed route
// would not run. A visible Edge window opens on the desktop for the whole run; do not cover/minimise it.
// Prerequisite: `pnpm build`. Run:
//   T08 (3 runs × Low gate / Balanced + Low CPU 4× reference, ≈ 20 min):
//     pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t08
//   T09 (10 min + 20 open/close cycles, ≈ 13 min):
//     $env:PERF_LONG = "1"; pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t09
// Results → test-results/frame-budget/ (CSV per run, JSON, heap snapshots). Report: node tools/frame-budget/index.mjs report
// WARNING: `pnpm test:e2e` (root config, outputDir test-results/) empties test-results/ — copy the results out first.
// Browser: installed Edge (`msedge`, real GPU, no download); PLAYWRIGHT_CHANNEL overrides. Real screen size and DPR:
// maximised window, `viewport: null`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = Number(process.env.FRAME_PORT ?? 4175);
const channel = process.env.PLAYWRIGHT_CHANNEL || "msedge";

export default defineConfig({
  testDir: ".",
  // Playwright empties outputDir on start: keep it a subfolder so test-results/frame-budget survives.
  outputDir: `${ROOT}/test-results/frame-artifacts`,
  testMatch: "**/*.frame.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel,
    headless: false,
    viewport: null,
    launchOptions: {
      args: [
        "--start-maximized",
        // Keep rAF/timers at full rate even if another window overlaps the test window.
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
        // L4-011: Windows native occlusion detection can mark a visible window occluded and throttle rAF (T09 b10: ~1 Hz).
        "--disable-features=CalculateNativeWinOcclusion",
        // T09: un-bucketed performance.memory values.
        "--enable-precise-memory-info",
      ],
    },
  },
  webServer: {
    command: `node tools/serve-out/index.mjs out --port ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/404.html`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
