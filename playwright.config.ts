// L3-003 — Playwright e2e on the static export `out/` (spec §5, §9, §13: T01, T02, T07/T11 HTML, Q12).
// Prerequisite: `pnpm build` (the web server serves `out/` with tools/serve-out, CloudFront-like rules).
// Browser selection (environment):
//   - PLAYWRIGHT_CHANNEL=<channel> → that installed browser channel (e.g. "msedge", "chrome").
//   - otherwise: CI (CI=true) → bundled Chromium (`pnpm exec playwright install --with-deps chromium`),
//                local → "msedge" (no browser download needed).
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const isCI = Boolean(process.env.CI);
const channel = process.env.PLAYWRIGHT_CHANNEL || (isCI ? undefined : "msedge");

export default defineConfig({
  testDir: "tests/e2e",
  // Own subfolder: Playwright empties outputDir on every run, which wiped perf/frame evidence in test-results/.
  outputDir: "test-results/e2e-artifacts",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: channel ?? "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(channel ? { channel } : {}),
        launchOptions: {
          // Headless Chromium no longer falls back to SwiftShader WebGL automatically; opt in so the
          // capability check and the Enter World test can see WebGL2 (software rendering, test only).
          args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `node tools/serve-out/index.mjs out --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/404.html`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
