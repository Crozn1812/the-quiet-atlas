// Serial A1 B1 B2 A2, closing Edge between runs. Native GL methods during CPU/FPS sampling.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const before = process.argv[2] ?? 'http://127.0.0.1:4311', after = process.argv[3] ?? 'http://127.0.0.1:4312';
const report = { method: `A1 B1 B2 A2; identical ${process.env.HR_GROUND_PROFILE_ZONE ?? 'horizon'} pose; ${process.env.HR_GROUND_WARMUP_MS ?? 20000} ms High warmup; 12 s native GL sample; serial independent Edge sessions`, samples: [] };
for (const [label, url] of [['A1', before], ['B1', after], ['B2', after], ['A2', before]]) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/review/hr-ground.mjs', label, url], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`${label} exit ${code}`)));
  });
  const data = JSON.parse(await readFile(`test-results/hr-ground/${label}/metrics.json`, 'utf8'));
  if (data.errors.length || data.samples.length !== 1) throw new Error(`Invalid ${label} capture`);
  report.samples.push({ label, ...data.samples[0] });
  await writeFile('test-results/hr-ground/abba.json', JSON.stringify(report, null, 2));
}
for (const [name, labels] of [['before', ['A1', 'A2']], ['after', ['B1', 'B2']]]) {
  const samples = report.samples.filter(s => labels.includes(s.label));
  report[name] = Object.fromEntries(['fps', 'calls', 'triangles', 'cpuTaskMsPerSecond', 'cpuScriptMsPerSecond', 'playableMs'].map(key =>
    [key, samples.reduce((sum, s) => sum + s[key], 0) / samples.length]));
}
await writeFile('test-results/hr-ground/abba.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ before: report.before, after: report.after }));
