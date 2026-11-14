// Compare with the last main before MS-C, including every deferred dressing instance.
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';
const directory = 'tmp/ms-c'; await mkdir(directory, { recursive: true });
const baselineRevision = '00e1850^';
const result = spawnSync('git', ['show', `${baselineRevision}:src/features/world/zones/milestones.ts`], { encoding: 'utf8', windowsHide: true });
if (result.status) throw new Error(result.stderr);
const baselineSource = result.stdout.replaceAll('"../../../content/', '"/src/content/').replaceAll('"../', '"/src/features/world/').replaceAll('"./', '"/src/features/world/zones/');
await writeFile(`${directory}/baseline.ts`, baselineSource);
const vite = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c-vite' });
try {
  const old = await vite.ssrLoadModule('/tmp/ms-c/baseline.ts');
  const current = await vite.ssrLoadModule('/src/features/world/zones/milestones.ts');
  const { createMilestonesStatue } = await vite.ssrLoadModule('/src/features/world/zones/milestones-statue.ts');
  const { milestonesDressingSites } = await vite.ssrLoadModule('/src/features/world/zones/milestones-dressing.ts');
  const context = { seed: 104, heightAt: () => 0, onPath: x => Math.abs(x) <= 2.6, underWater: () => false };
  const before = old.createMilestonesScene(context), after = current.createMilestonesScene(context);
  const source = await readFile('public/world/milestones/character-milestones-walk.glb');
  const normalBytes = (await readFile('public/world/milestones/cloth-normal.png')).length;
  const maskBytes = (await readFile('public/world/milestones/kintsugi-mask.png')).length, assetBytes = source.length + normalBytes + maskBytes;
  const gltf = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
  let geometry; gltf.scene.traverse(node => { if (node.isMesh) geometry = node.geometry; });
  const statue = createMilestonesStatue(current.milestoneCertificates(), async () => geometry);
  await statue.loadDetail();
  const triangles = node => (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
  const count = root => { let total = 0, draws = 0; root.traverse(node => {
    if (node.isMesh) { total += triangles(node); draws++; }
    if (node.isPoints) draws++;
  }); return { triangles: total, draws }; };
  const baseline = count(before.group);
  const placeholder = after.group.getObjectByName('milestones-walking-statue');
  after.group.remove(placeholder);
  const staticCounts = count(after.group), detailed = count(statue.group);
  let dressingDetail = 0;
  for (const site of milestonesDressingSites(context, 1, 0)) {
    const bytes = await readFile(`public/world/lib/${site.asset}-lod1.glb`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    dressingDetail += json.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
  }
  // The dressing mesh has no milestonesSurface; the other four static batches do.
  const dressing = after.group.children.find(node => node.isMesh && !node.userData.milestonesSurface);
  const dressingDelta = dressingDetail - triangles(dressing);
  const high = { triangles: staticCounts.triangles + detailed.triangles + dressingDelta, draws: staticCounts.draws + detailed.draws };
  const low = { triangles: staticCounts.triangles + detailed.triangles - 960, draws: high.draws - 2 };
  const baselineHigh = { triangles: baseline.triangles + dressingDelta, draws: baseline.draws };
  const delta = { triangles: high.triangles - baselineHigh.triangles, draws: high.draws - baselineHigh.draws, bytes: assetBytes };
  const report = { mode: 'report-only', baselineRevision, baselineLow: baseline, baselineHigh, high, low, statue: detailed, delta, dressingDetail, bytes: assetBytes, pass: delta.triangles <= 25000 && delta.draws <= 4 && assetBytes <= 1500000 };
  await mkdir('test-results/ms-c2', { recursive: true }); await writeFile('test-results/ms-c2/budgets.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  statue.dispose(); after.group.add(placeholder); before.dispose(); after.dispose();
} finally { await vite.close(); await rm(`${directory}/baseline.ts`, { force: true }); }
