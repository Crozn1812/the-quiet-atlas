// Serial ABBA: exactly one review browser alive; each capture warms High before sampling 12 s.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const baseline = process.argv[2] ?? 'http://127.0.0.1:4297';
const revised = process.argv[3] ?? 'http://127.0.0.1:4289';
const report = { method: 'Four independent Edge runs; browser closed between runs; 12 s samples after High warmup', samples: [], errors: [] };
try {
  for (const [label, url] of [['A1', baseline], ['B1', revised], ['B2', revised], ['A2', baseline]]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['tests/review/hr-terrain-cliff.mjs', `return1/${label}`, url], {
        env: { ...process.env, HR_TERRAIN_PROFILE_ONLY: '1' }, stdio: 'inherit', windowsHide: true,
      });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`${label}: review exit ${code}`)));
    });
    const data = JSON.parse(await readFile(`test-results/hr-terrain-cliff/return1/${label}/metrics.json`, 'utf8'));
    report.samples.push({ label, ...data.samples[0], gpu: data.gpu, playableMs: data.timing.playableMs });
    report.errors.push(...data.errors);
  }
  for (const [name, labels] of [['before', ['A1', 'A2']], ['after', ['B1', 'B2']]]) {
    const samples = report.samples.filter(sample => labels.includes(sample.label));
    report[name] = Object.fromEntries(['fps', 'calls', 'triangles', 'cpuTaskMsPerSecond', 'playableMs'].map(key =>
      [key, samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length]));
  }
} finally {
  await writeFile('test-results/hr-terrain-cliff/return1/abba.json', JSON.stringify(report, null, 2));
}
if (report.errors.length) throw new Error(report.errors.join('\n'));
console.log(JSON.stringify({ before: report.before, after: report.after }));
