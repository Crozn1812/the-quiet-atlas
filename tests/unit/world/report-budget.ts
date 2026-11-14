import path from 'node:path';
import { afterAll, expect } from 'vitest';
import { recordMetrics } from '../../../tools/checks/budget-report.mjs';

const metrics: Record<string, number> = {};
afterAll(() => {
  if (!Object.keys(metrics).length) return;
  const file = path.relative(process.cwd(), expect.getState().testPath!).replaceAll('\\', '/');
  console.info(JSON.stringify(recordMetrics(`unit-${file.replaceAll('/', '-')}`, metrics)));
});

/** ADR 0019: retain measurement validity and print the old reference without enforcing it. */
export function reportBudget(label: string, measured: number | undefined, legacyReference: number) {
  expect(Number.isFinite(measured), label).toBe(true);
  metrics[label] = measured!;
  console.info('BUDGET REPORT', JSON.stringify({ label, measured, legacyReference, deltaFromReference: measured! - legacyReference }));
}
