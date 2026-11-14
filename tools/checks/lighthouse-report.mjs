import { readdirSync, readFileSync } from 'node:fs';
import { recordMetrics } from './budget-report.mjs';

const groups = new Map();
for (const file of readdirSync('.lighthouseci').filter(file => /^lhr-.*\.json$/.test(file))) {
  const result = JSON.parse(readFileSync(`.lighthouseci/${file}`, 'utf8'));
  const url = new URL(result.finalDisplayedUrl).pathname;
  for (const audit of ['largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'bootup-time']) {
    const value = result.audits[audit].numericValue;
    if (!Number.isFinite(value)) throw new Error(`Missing ${audit}: ${file}`);
    const key = `${url}:${audit}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
}
if (!groups.size) throw new Error('No Lighthouse measurements found');
const metrics = Object.fromEntries([...groups].flatMap(([key, values]) => {
  values.sort((a, b) => a - b);
  return [[`${key}:median`, values[Math.floor(values.length / 2)]], [`${key}:worst`, values.at(-1)]];
}));
console.log(JSON.stringify(recordMetrics('lighthouse', metrics)));
