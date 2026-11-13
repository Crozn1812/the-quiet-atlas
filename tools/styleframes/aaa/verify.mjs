// CPU checks for measurement correctness and the shipped, reproducible asset inventory.
// Node 22+ (native TS stripping): node tools/styleframes/aaa/verify.mjs
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DataUtils } from 'three';
import { createMeter, percentile } from './metrics.ts';

assert.equal(percentile([4, 1, 3, 2], 0.5), 2);
assert.equal(percentile([], 0.95), 0);
function fixture(supported) {
  let disjoint = false, allocated = 0, deleted = 0, begun = 0;
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    RENDERER: 3, QUERY_RESULT_AVAILABLE: 4, QUERY_RESULT: 5,
    getExtension: name => name === 'EXT_disjoint_timer_query_webgl2' && supported ? extension : null,
    getParameter: key => key === 2 ? disjoint : 'CPU test fixture',
    createQuery: () => { allocated++; return {}; },
    beginQuery: () => { begun++; }, endQuery: () => {},
    deleteQuery: () => { deleted++; },
    getQueryParameter: (_, key) => key === 4 ? true : 2_500_000,
  };
  const renderer = { getContext: () => gl, domElement: { width: 1600, height: 900 }, info: { reset: () => {}, render: { calls: 42, triangles: 54321 } } };
  const meter = createMeter(renderer);
  let frame = 0;
  const tick = count => { for (let i = 0; i < count; i++) { meter.begin(++frame * 16); meter.end(); } };
  return { meter, tick, disjoint: value => { disjoint = value; }, counts: () => ({ allocated, deleted, begun }) };
}
const noTimer = fixture(false);
noTimer.tick(164); assert.equal(noTimer.meter.ready, false);
noTimer.tick(1); assert.equal(noTimer.meter.ready, true);
assert.equal(noTimer.meter.report().gpuMedianMs, null);
assert.equal(noTimer.meter.report().calls, 42);
assert.equal(noTimer.meter.report().triangles, 54321);
noTimer.tick(1000); assert.equal(noTimer.meter.report().samples, 240);
noTimer.meter.dispose();

const timer = fixture(true);
timer.tick(45); assert.equal(timer.counts().begun, 0);
timer.tick(120); assert.equal(timer.meter.ready, true);
assert.equal(timer.meter.report().gpuMedianMs, 2.5);
assert.equal(timer.meter.report().frameMedianMs, 16);
timer.disjoint(true); timer.tick(1);
assert.equal(timer.meter.report().gpuMedianMs, null);
assert.equal(timer.meter.ready, false);
timer.disjoint(false); timer.tick(32);
assert.equal(timer.meter.report().gpuMedianMs, 2.5);
assert.match(timer.meter.report().timer, /disjoint samples discarded/);
timer.meter.dispose();
assert.equal(timer.counts().allocated, timer.counts().deleted);
console.info('PASS: meter warm-up, sample cap, missing timer, disjoint reset, query disposal.');

const inventory = JSON.parse(await readFile(new URL('./asset-bytes.json', import.meta.url), 'utf8'));
const csv = await readFile(new URL('../../../assets/LICENSES.csv', import.meta.url), 'utf8');
for (const asset of inventory) {
  const path = new URL(`../../../public/world/lib/gfx01/${asset.file}`, import.meta.url);
  assert.equal((await stat(path)).size, asset.bytes, asset.file);
  assert.ok(csv.includes(`public/world/lib/gfx01/${asset.file},The Quiet Atlas (project-original),CC0-1.0,`));
  const bytes = await readFile(path);
  if (asset.file.endsWith('.ktx2')) {
    assert.deepEqual([...bytes.subarray(0, 12)], [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32LE(20), asset.size); assert.equal(bytes.readUInt32LE(24), asset.size);
    assert.ok(bytes.readUInt32LE(40) > 1, 'mip chain');
  } else {
    const hdr = new HDRLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(hdr.width, 512); assert.equal(hdr.height, 256);
    let max = 0;
    for (const value of hdr.data) max = Math.max(max, DataUtils.fromHalfFloat(value));
    assert.ok(max > 1, 'HDR radiance exceeds LDR range');
  }
}
console.info(`PASS: ${inventory.length} asset sizes, CC0 rows, KTX2 dimensions/mips, RGBE HDR radiance.`);
