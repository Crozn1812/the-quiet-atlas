import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { recordMetrics } from '../../../tools/checks/budget-report.mjs';

it('reports unbounded measurements and deltas; missing history is explicit', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tqa-budget-report-'));
  try {
    const first = recordMetrics('assets', { worldBytes: 30_000_001 }, directory);
    expect(first.previousAt).toBeNull();
    expect(first.delta.worldBytes).toBeNull();
    const second = recordMetrics('assets', { worldBytes: 90_000_001, triangles: 25_001 }, directory);
    expect(second.mode).toBe('report-only');
    expect(second.previousAt).toBe(first.measuredAt);
    expect(second.delta).toEqual({ worldBytes: 60_000_000, triangles: null });
    expect(JSON.parse(readFileSync(path.join(directory, 'assets.json'), 'utf8'))).toEqual(second);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
