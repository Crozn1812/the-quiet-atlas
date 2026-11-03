// L3-004 — Playwright config for the cold-cache load-budget trace (spec §8, §13 Q18, T08 network part).
// Separate from playwright.config.ts so `pnpm test:e2e` stays fast; run with:
//   pnpm exec playwright test -c tests/perf/playwright.perf.config.ts
// Prerequisite: `pnpm build`. Serves out/ with tools/load-budget/serve-gzip.mjs (serve-out routing + gzip like CloudFront).
// Browser: local → installed Edge (`msedge`, hardware GPU, no download); CI → bundled Chromium + SwiftShader WebGL.
// PLAYWRIGHT_CHANNEL overrides the channel. The spec launches a fresh browser per cold run itself.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = Number(process.env.PERF_PORT ?? 4174);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: ".",
  // Playwright empties outputDir on start: keep it a subfolder so test-results/load-budget and test-results/lhci survive.
  outputDir: `${ROOT}/test-results/perf-artifacts`,
  testMatch: "**/*.perf.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 10 * 60_000,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `node tools/load-budget/serve-gzip.mjs out --port ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/404.html`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
