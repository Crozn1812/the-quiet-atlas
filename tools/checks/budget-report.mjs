import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Local/CI artifact only. Missing history is explicit; thresholds never affect exit codes. */
export function recordMetrics(name, metrics, directory = process.env.BUDGET_REPORT_DIR ?? 'test-results/budget-reports') {
  const file = path.resolve(directory, `${name}.json`);
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const delta = Object.fromEntries(Object.entries(metrics).map(([key, value]) =>
    [key, typeof previous?.metrics?.[key] === 'number' ? value - previous.metrics[key] : null]));
  const report = { mode: 'report-only', measuredAt: new Date().toISOString(),
    previousAt: previous?.measuredAt ?? null, metrics, delta };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
