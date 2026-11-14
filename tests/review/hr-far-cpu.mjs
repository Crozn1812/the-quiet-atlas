// Node construction CPU ABBA; separate from browser frame CPU/FPS measurements.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const original = execFileSync('git', ['show', 'HEAD:src/features/world/scene/far-landscape.ts'], { encoding: 'utf8' });
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [{ name: 'original-far-factory', enforce: 'pre', transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/features/world/scene/far-landscape.ts?hr-far-baseline')) return original;
  } }] });
try {
  const before = await server.ssrLoadModule('/src/features/world/scene/far-landscape.ts?hr-far-baseline');
  const after = await server.ssrLoadModule('/src/features/world/scene/far-landscape.ts');
  for (const factory of [before, after]) factory.createFarLandscape().dispose();
  const samples = [];
  for (const [label, factory] of [['A1', before], ['B1', after], ['B2', after], ['A2', before]]) {
    const cpu = process.cpuUsage(), start = performance.now(), far = factory.createFarLandscape();
    const used = process.cpuUsage(cpu), geometry = far.mesh.geometry;
    samples.push({ label, wallMs: performance.now() - start, userMs: used.user / 1000, systemMs: used.system / 1000,
      triangles: Math.min(geometry.drawRange.count, geometry.index.count) / 3, vertices: geometry.getAttribute('position').count,
      bufferBytes: Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, geometry.index.array.byteLength),
      sites: geometry.userData.farForestSites?.length ?? geometry.userData.farCrowns,
      species: geometry.userData.farForestSites?.reduce((counts,site)=>{counts[site.id]=(counts[site.id]??0)+1;return counts;},{}) });
    far.dispose();
  }
  await mkdir('test-results/hr-far', { recursive: true });
  await writeFile(`test-results/hr-far/${process.argv[2] ?? 'cpu-abba.json'}`, JSON.stringify({ method: 'Warm Node factory construction, CPU ABBA; not browser frame CPU', samples }, null, 2));
  console.log(JSON.stringify(samples));
} finally { await server.close(); }
