// Reuse HR-AUDIT camera generation, hardware checks, sampling and image encoding.
// Source previews avoid rebuilding during art iteration; production uses port 4203.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const label = process.argv[2] ?? 'after';
const source = process.argv.includes('--source');
const baseline = process.argv.includes('--baseline');
const root = process.cwd();
const files = ['scene/far-landscape.ts', 'scene/far-material.ts', 'scene/far-relief.ts', 'zones/first-light-cliff-detail.ts', 'terrain/cliffs.ts', 'terrain/cliff-relief.ts'];
const snapshot = 'test-results/hr-fix-terrain/baseline.json';
await mkdir('test-results/hr-fix-terrain', { recursive: true });
if (process.argv.includes('--snapshot')) {
  await writeFile(snapshot, JSON.stringify(Object.fromEntries(await Promise.all(files.map(async f =>
    [`/src/features/world/${f}`, await readFile(`src/features/world/${f}`, 'utf8')])))));
  process.exit(0);
}
let server;
if (source) {
  const originals = baseline ? JSON.parse(await readFile(snapshot, 'utf8')) : {};
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.cache/hr-fix-terrain',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [{ name: 'terrain-review', enforce: 'pre',
      transform(code, id) { const key = id.replaceAll('\\', '/').replace(root.replaceAll('\\', '/'), ''); return key === '/src/features/world/index.ts' ? code.replace('const scene = new Scene();', 'const scene = new Scene(); window.__terrainScene = scene;') : originals[key] ?? code; },
      configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url === '/en/world-content.json') { res.setHeader('Content-Type', 'application/json'); res.end(await readFile('out/en/world-content.json')); }
        else if (req.url === '/__terrain.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="icon" href="data:,"><style>html,body,.world-viewport{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div class="world-viewport" tabindex="0"></div><script type="module" src="/__terrain.js"></script>'); }
        else if (req.url === '/__terrain.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(`import {mountWorld} from '/src/features/world/index.ts'; const el=document.querySelector('.world-viewport'); await mountWorld(el,{locale:'en',quality:'high',debug:true});`); }
        else next();
      }); },
    }], server: { host: '127.0.0.1', port: 4503, strictPort: true, hmr: false, ws: false, watch: null } });
  await server.listen();
}
let script = await readFile('tools/review/hr-audit.mjs', 'utf8');
script = script.replace('page.on("pageerror", e => manifest.errors.push(e.message));',
  'page.on("pageerror", e => manifest.errors.push(e.message)); page.on("console", m => { if(m.type() === "error") manifest.errors.push(m.text()); });');
script = script.replaceAll('import.meta.dirname', JSON.stringify(path.join(root, 'tools/review')))
  .replace('"./luma.mjs"', JSON.stringify(pathToFileURL(path.join(root, 'tools/review/luma.mjs')).href))
  .replace('"./hr-audit-layout.mjs"', JSON.stringify(pathToFileURL(path.join(root, 'tools/review/hr-audit-layout.mjs')).href))
  .replace('"@playwright/test"', JSON.stringify(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href))
  .replace('const dest = path.join(root, "test-results/hr-audit", ...(supplement ? ["supplement"] : matchHorizon ? ["horizon-match"] : []));', `const dest = path.join(root, 'test-results/hr-fix-terrain', ${JSON.stringify(label)});`)
  .replace('const mode = supplement || matchHorizon ? "--capture" : process.argv[2] ?? "--capture";', 'const mode = "--capture";')
  .replace('await quality("high");', 'await quality("high"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(45000);')
  .replace('if (mode === "--plan") {', `shots.splice(0, shots.length, ...shots.filter(s => ['old-trail-overview','old-trail-close','old-trail-path','quiet-shore-overview','sea-wide','signpost','first-light-overview','low-first-light','horizon-left-holes'].includes(s.id)));
    const p=[32.404483795166016,5.069798707962036,-408.219970703125], t=[32.404483795166016,5.069798707962036,-441.219970703125];
    for(const [id,dx] of [['horizon-lead-match',0],['horizon-lead-left',-.6],['horizon-lead-right',.6]]) pose(id,'horizon','A01',add(p,[dx,0,0]),add(t,[dx,0,0]),'audit exact');
    if (mode === "--plan") {`);
if (process.argv.includes('--quick')) script = script.replace('if (mode === "--plan") {', "shots.splice(0,shots.length,...shots.filter(s=>['old-trail-path','quiet-shore-overview','signpost'].includes(s.id))); if (mode === \"--plan\") {");
if (source) script = script.replace('const actualPlayer =', `manifest.diagnostics ??= []; manifest.diagnostics.push(await page.evaluate(() => { const result=[]; window.__terrainScene.traverse(o => { if(/spring-mossy-cliff|first-light-sculpted-rock/.test(o.name)) result.push({name:o.name,visible:o.visible,parentVisible:o.parent?.visible,vertices:o.geometry?.attributes.position.count,error:o.userData.cliffDetailError,relief:o.geometry?.userData.terrainCliffRelief,mineral:o.material?.userData.mineralScale}); }); return {shot:document.querySelector('.world-viewport').dataset.worldQuality,objects:result}; })); const actualPlayer =`).replace('http://127.0.0.1:4203', 'http://127.0.0.1:4503')
  .replace('await page.goto(`${base}/en/`);', 'await page.goto(`${base}/__terrain.html`);')
  .replace('await page.getByRole("button", { name: "Enter World", exact: true }).click();', '')
  .replace(/await canvas.focus\(\); await page.keyboard.press\("Escape"\);\s+await page.locator\(`\.world-menu dialog input\[value="\$\{q\}"\]`\).check\(\);\s+await page.keyboard.press\("Escape"\); await canvas.focus\(\);/, `await world.evaluate((el,q)=>el.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:q}})),q); await canvas.focus();`);
try {
  await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
  const result = JSON.parse(await readFile(`test-results/hr-fix-terrain/${label}/capture-manifest.json`, 'utf8'));
  if (result.status !== 'captured-review-pending') throw new Error(`${result.status}: ${JSON.stringify(result.errors)}`);
  result.provenance = { sourcePreview: source, baseline,
    ...(!source ? { buildId: (await readFile('.next/BUILD_ID', 'utf8')).trim() } : {}),
    sourceHashes: Object.fromEntries(await Promise.all(files.map(async file => [file,
      createHash('sha256').update(await readFile(`src/features/world/${file}`)).digest('hex')]))),
  };
  await writeFile(`test-results/hr-fix-terrain/${label}/capture-manifest.json`, JSON.stringify(result, null, 2));
}
finally { await server?.close(); }
