// Compare gameplay buffers against the unmodified mesh factory; no visual skin/GLB changes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { MeshToonMaterial } from 'three';
const original = execFileSync('git', ['show', 'HEAD:src/features/world/terrain/mesh.ts'], { encoding: 'utf8' });
const baseline = await createServer({ configFile: false, plugins: [{ name: 'baseline-ground-mesh', enforce: 'pre',
  transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/features/world/terrain/mesh.ts')) return original; },
}], server: { middlewareMode: true, hmr: false, watch: null } });
const revised = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null } });
const report = { comparisons: [], samples: [], addedAssetBytes: 0, addedTileAttributeBytes: 33 * 33 * 4 * 4 };
const material = new MeshToonMaterial();
try {
  const a = await baseline.ssrLoadModule('/src/features/world/terrain/mesh.ts');
  const b = await revised.ssrLoadModule('/src/features/world/terrain/mesh.ts');
  const { buildTile } = await revised.ssrLoadModule('/src/features/world/terrain/tiles.ts');
  const { ZONES } = await revised.ssrLoadModule('/src/features/world/layout/zones.ts');
  const tiles = ZONES.map(z => buildTile(Math.floor(z.position.x / 64), Math.floor(z.position.z / 64)));
  for (let i = 0; i < tiles.length; i++) {
    const before = a.createTileMesh(tiles[i], material), after = b.createTileMesh(tiles[i], material);
    for (const name of Object.keys(before.geometry.attributes)) assert.deepEqual(after.geometry.getAttribute(name).array, before.geometry.getAttribute(name).array);
    assert.deepEqual(after.geometry.index.array, before.geometry.index.array);
    assert.deepEqual(after.position.toArray(), before.position.toArray());
    report.comparisons.push({ zone: ZONES[i].id, originalAttributesIdentical: true, trianglesBefore: before.geometry.index.count / 3, trianglesAfter: after.geometry.index.count / 3 });
    before.geometry.dispose(); after.geometry.dispose();
  }
  for (const factory of [a, b]) for (const tile of tiles) factory.createTileMesh(tile, material).geometry.dispose();
  for (const [label, factory] of [['A1', a], ['B1', b], ['B2', b], ['A2', a]]) {
    const cpu = process.cpuUsage(), start = performance.now();
    for (let i = 0; i < 10; i++) for (const tile of tiles) factory.createTileMesh(tile, material).geometry.dispose();
    const used = process.cpuUsage(cpu);
    report.samples.push({ label, tiles: tiles.length * 10, wallMs: performance.now() - start, userMs: used.user / 1000, systemMs: used.system / 1000 });
  }
} finally { await baseline.close(); await revised.close(); material.dispose(); }
await mkdir('test-results/hr-ground', { recursive: true });
await writeFile('test-results/hr-ground/geometry.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
