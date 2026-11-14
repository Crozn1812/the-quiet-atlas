/** Reproducible original props: node tools/assets/blender/props.mjs [blender.exe]. */
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { optimize } from '../optimize.mjs';

const directory = 'tmp/g03';
await mkdir(directory, { recursive: true });
await mkdir('public/world/props', { recursive: true });
const server = await createServer({ server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
try {
  const { createRockGeometry } = await server.ssrLoadModule('/src/features/world/props/rocks.ts');
  const wood = await server.ssrLoadModule('/src/features/world/props/wood.ts');
  const entries = [0, 1, 2, 3].map(i => {
    const geometry = createRockGeometry('boulder', 1200 + i, true);
    if (i < 2) geometry.scale(0.32, 0.3, 0.32);
    return [`rock-${i < 2 ? 'small' : 'large'}-${i % 2 + 1}`, geometry, i < 2 ? 200 : 400];
  });
  entries.push(['prop-log', wood.createLogGeometry(201), 600],
    ['prop-bench', wood.createBenchGeometry(230), 600],
    ['prop-fence', wood.createFenceSpanGeometry(4, { flowers: false }), 600]);
  const sources = entries.map(([name, geometry, limit]) => {
    const result = { name, limit, positions: Array.from(geometry.getAttribute('position').array),
      colors: Array.from(geometry.getAttribute('color').array) };
    geometry.dispose();
    return result;
  });
  await writeFile(`${directory}/sources.json`, JSON.stringify(sources));
  const bake = spawnSync(process.argv[2] ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    ['-b', '--factory-startup', '-P', 'tools/assets/blender/props.py', '--', `${directory}/sources.json`, directory],
    { encoding: 'utf8', windowsHide: true });
  if (bake.status !== 0) throw new Error(bake.error?.message ?? bake.stdout + bake.stderr);
  const report = [];
  for (const { name, limit } of sources) {
    const result = await optimize(`${directory}/${name}.glb`, `public/world/props/${name}.glb`, { texture: 'none' });
    console.info('REPORT ADR0019', { name, triangles: result.triangles, bytes: result.bytesAfter,
      legacyReference: { triangles: limit, bytes: name.startsWith('rock') ? 20_000 : 80_000 } });
    report.push({ name, ...result });
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
