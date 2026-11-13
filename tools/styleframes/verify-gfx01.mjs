import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { summarizeAssetBytes } from './report-gfx01.mjs';

const out = process.argv[2] ?? 'docs/showcase/37-aaa';
const report = JSON.parse(await readFile(join(out, 'results.json'), 'utf8'));
assert.equal(report.status, 'captured');
assert.equal(report.viewport, '1600x900');
assert.deepEqual(report.errors, []);
assert.deepEqual(report.network, []);
assert.equal(report.rows.length, 18);
const expected = [];
for (const scene of ['first-light', 'horizon', 'last-postcard']) {
  for (const quality of ['High', 'Low']) for (const variant of ['A', 'B', 'C']) {
    const rows = report.rows.filter(r => r.scene === scene && r.variant === variant && r.quality === quality);
    assert.equal(rows.length, 1, `${scene}/${variant}/${quality}`);
    const r = rows[0];
    assert.ok(r.samples >= 120);
    assert.equal(r.width, quality === 'High' ? 1600 : 1040);
    assert.equal(r.height, quality === 'High' ? 900 : 585);
    for (const key of ['calls', 'triangles']) assert.ok(Number.isInteger(r[key]) && r[key] > 0, key);
    for (const key of ['cpuSubmitMedianMs', 'frameMedianMs', 'frameP95Ms']) assert.ok(Number.isFinite(r[key]) && r[key] >= 0, key);
    assert.equal(r.device, report.device);
    assert.ok(r.frameP95Ms >= r.frameMedianMs);
    if (r.gpuMedianMs !== null) {
      assert.ok(Number.isFinite(r.gpuMedianMs) && r.gpuMedianMs >= 0);
      assert.ok(r.gpuP95Ms >= r.gpuMedianMs);
      assert.match(r.timer, /EXT_disjoint_timer_query_webgl2|GPU query/);
    }
    if (quality === 'High' || variant === 'B') expected.push(`${scene}-${variant}-${quality}.png`);
  }
}
assert.deepEqual((await readdir(out)).filter(file => file.endsWith('.png')).sort(), expected.sort());
for (const file of expected) {
  const bytes = await readFile(join(out, file));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1600, file);
  assert.equal(bytes.readUInt32BE(20), 900, file);
}
const assets = JSON.parse(await readFile('tools/styleframes/aaa/asset-bytes.json', 'utf8'));
for (const asset of assets) assert.equal((await stat(`public/world/lib/gfx01/${asset.file}`)).size, asset.bytes);
assert.deepEqual(report.assetBytes, summarizeAssetBytes(assets));
const markdown = await readFile(join(out, 'README.md'), 'utf8');
for (const file of expected) assert.ok(markdown.includes(`](${file})`), file);
assert.ok(!markdown.includes('CHƯA ĐỦ ĐIỀU KIỆN XONG'));
console.info('PASS: 18 unique measured configurations, 12 PNG 1600x900, asset byte totals, README image links, no browser/HTTP errors.');
