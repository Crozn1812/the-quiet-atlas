// T11 (HTML part, spec §9): axe-core reports 0 critical/serious violations on the HTML pages.
// Violations listed in KNOWN_ISSUES.axeRules (owned by L1, reported to the Lead) are recorded as
// "known-issue" annotations instead of failing; T11 stays FAIL in reports until that list is empty.
// Any other critical/serious violation fails the test, and so does a known issue that no longer reproduces.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { htmlPagesToAudit, KNOWN_ISSUES, settle } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const ROUTES = [...htmlPagesToAudit(), "/404.html"];

test(`T11 axe on ${ROUTES.length} HTML pages: 0 critical/serious violations (excluding tracked known issues)`, async ({ page }) => {
  test.setTimeout(30_000 + ROUTES.length * 15_000);
  const seenKnown = new Set<string>();

  for (const route of ROUTES) {
    await test.step(`axe ${route}`, async () => {
      await page.goto(route);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const blocking = results.violations.filter(v => v.impact === "critical" || v.impact === "serious");
      const describe = (v: (typeof blocking)[number]) =>
        `${route} ${v.impact} ${v.id}: ${v.help} → ${v.nodes.map(n => n.target.join(" ")).join(", ")}`;

      for (const v of blocking.filter(v => v.id in KNOWN_ISSUES.axeRules)) {
        seenKnown.add(v.id);
        test.info().annotations.push({ type: "known-issue", description: `${describe(v)} — ${KNOWN_ISSUES.axeRules[v.id]}` });
      }
      const unexpected = blocking.filter(v => !(v.id in KNOWN_ISSUES.axeRules));
      expect.soft(unexpected.map(describe), `unexpected critical/serious violations on ${route}`).toEqual([]);
    });
  }

  expect(
    [...seenKnown].sort(),
    "every KNOWN_ISSUES.axeRules entry must still reproduce — remove fixed ones",
  ).toEqual(Object.keys(KNOWN_ISSUES.axeRules).sort());
});
