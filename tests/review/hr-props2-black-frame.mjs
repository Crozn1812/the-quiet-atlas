// Audit the actual production captures; exclude UI so a black canvas cannot pass.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { meanLuma, sharp } from '../../tools/review/luma.mjs';

const root = process.env.HR_PROPS_RESULTS ?? 'test-results/hr-props2';
const baseline = JSON.parse(await readFile(`${root}/before/metrics.json`, 'utf8'));
const proof = JSON.parse(await readFile(`${root}/build-proof.json`, 'utf8'));
const samples = [];
const labels = ['after', 'after-repeat', 'after-third', ...(process.env.HR_PROPS_CONFIRMATION === '1' ? ['after-confirm1','after-confirm2','after-confirm3'] : [])];
for (const label of labels) {
  const run = JSON.parse(await readFile(`${root}/${label}/metrics.json`, 'utf8'));
  assert.equal(run.buildId, proof.buildId);
  assert.match(run.gpu, /RTX 3060/i);
  assert.equal(run.samples.length, 8);
  assert.deepEqual(run.errors, []);
  for (const sample of run.samples) {
    assert.equal(sample.quality, 'high');
    assert.deepEqual(sample.pose, baseline.samples.find(s => s.zone === sample.zone).pose);
    const crop = await sharp(`${root}/${label}/${sample.zone}.png`).extract({ left: 100, top: 100, width: 1400, height: 550 }).toBuffer();
    const luma = await meanLuma(crop);
    assert.ok(luma >= 0.04, `Black world frame: ${label}/${sample.zone}, luma=${luma}`);
    samples.push({ label, zone: sample.zone, luma });
  }
}
await writeFile(`${root}/visual-gate.json`, JSON.stringify({ status: 'PASS', samples }, null, 2));
console.log(`VISUAL_GATE=PASS; High ${samples.length}/${samples.length} non-black captures; 8/8 matching before/after cameras`);
