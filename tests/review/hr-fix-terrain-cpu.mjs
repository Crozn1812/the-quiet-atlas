// Warm construction CPU in A1 B1 B2 A2 order. Run separately from GPU capture.
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
const baseline = JSON.parse(await readFile('test-results/hr-fix-terrain/baseline.json', 'utf8'));
const servers = [];
try {
  const factories = [];
  for (const original of [true, false]) {
    const server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-fix-terrain-cpu',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [{ name: 'terrain-cpu-baseline', enforce: 'pre', transform(code, id) {
        const key = id.replaceAll('\\', '/').replace(process.cwd().replaceAll('\\', '/'), '');
        return original ? baseline[key] ?? code : code;
      } }] });
    servers.push(server);
    factories.push((await server.ssrLoadModule('/src/features/world/scene/far-landscape.ts')).createFarLandscape);
  }
  for (const factory of factories) factory().dispose();
  const samples = [];
  for (const [label, factory] of [['A1', factories[0]], ['B1', factories[1]], ['B2', factories[1]], ['A2', factories[0]]]) {
    const cpu = process.cpuUsage(), start = performance.now(), far = factory();
    const used = process.cpuUsage(cpu), g = far.mesh.geometry;
    samples.push({ label, wallMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000,
      triangles: g.userData.highTriangles, lowTriangles: g.userData.lowTriangles,
      bufferBytes: Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, g.index.array.byteLength) });
    far.dispose();
  }
  const result = { method: 'Warm Node construction CPU ABBA; no browser, no isolated-machine guarantee', samples };
  await writeFile('test-results/hr-fix-terrain/cpu-abba.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { for (const server of servers) await server.close(); }
