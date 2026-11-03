// L3-004 — Lighthouse CI (spec §8 "Quick web UX": LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 — lab before launch).
// Pages: Welcome /en/, Quick /en/quick/, one case study. Served from out/ by tools/load-budget/serve-gzip.mjs
// (serve-out routing + gzip like CloudFront). Prerequisite: `pnpm build`.
// - Lighthouse default profile (mobile emulation, simulated slow 4G, 4× CPU) — stricter than desktop.
// - 3 runs per URL, assertions on the WORST run (`pessimistic`), same rule as §8 "ba lần, xấu nhất".
// - INP cannot be measured in a navigation lab run: Total Blocking Time is used as the LAB PROXY for INP
//   (TBT ≤ 200 ms). Field INP p75 is reported separately after launch (§8 [S5]).
// - Accessibility score is recorded (warn only); the accessibility gate is axe in tests/e2e (L3-003).
// - Reports stay local / CI artifacts: upload target "filesystem" only. Never temporary-public-storage.
// Local: set CHROME_PATH to an installed Edge/Chrome (no browser download), e.g.
//   $env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
//   pnpm exec lhci autorun
const PORT = Number(process.env.LHCI_PORT || 4175);
const BASE = `http://127.0.0.1:${PORT}`;
const CASE_STUDY = process.env.LHCI_CASE_STUDY || "/en/projects/cms-devops-platform-aws-eks/";

module.exports = {
  ci: {
    collect: {
      startServerCommand: `node tools/load-budget/serve-gzip.mjs out --port ${PORT}`,
      startServerReadyPattern: "serve-gzip: http",
      startServerReadyTimeout: 30000,
      url: [`${BASE}/en/`, `${BASE}/en/quick/`, `${BASE}${CASE_STUDY}`],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--headless=new --no-first-run --no-default-browser-check",
        onlyCategories: ["performance", "accessibility"],
      },
    },
    assert: {
      assertions: {
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "pessimistic" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "pessimistic" }],
        // Lab proxy for INP ≤ 200 ms (§8 "Lab trước launch").
        "total-blocking-time": ["error", { maxNumericValue: 200, aggregationMethod: "pessimistic" }],
        // Recorded, not a gate (axe in tests/e2e is the accessibility gate).
        "categories:accessibility": ["warn", { minScore: 0.9, aggregationMethod: "pessimistic" }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "test-results/lhci",
    },
  },
};
