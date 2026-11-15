// Matched source renders of clean main and the worktree; no Next build or source mutation.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'after';
const before = label.startsWith('before');
const low = label === 'low';
const dest = `tmp/hr-sky/return1/${label}`;
await mkdir(dest, { recursive: true });
const main = execFileSync('git', ['rev-parse', 'main'], { encoding: 'utf8' }).trim();
const hashes = {};
const html = `<!doctype html><link rel="icon" href="data:,"><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><div id="world" class="world-viewport" tabindex="0"></div><script type="module">import {mountWorld} from '/src/features/world/index.ts';window.THREE=await import('three');window.started=performance.now();window.disposeWorld=await mountWorld(document.getElementById('world'),{locale:'en',quality:'${low ? 'low' : 'high'}',debug:true});window.playable=performance.now()-window.started;</script>`;
const vite = await createServer({ configFile: false, cacheDir: `tmp/hr-sky/return1/vite-${label}`,
  optimizeDeps: { noDiscovery: true, include: [] }, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [{ name: 'clean-main-sky-review', enforce: 'pre',
    async load(id) {
      const file = path.relative(process.cwd(), id.split('?')[0]).replaceAll('\\', '/');
      if (!file.startsWith('src/') || !/\.[jt]sx?$/.test(file)) return;
      const source = before ? execFileSync('git', ['show', `${main}:${file}`], { encoding: 'utf8' }) : await readFile(file, 'utf8');
      hashes[file] = createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
      return source;
    },
    transform(source, id) {
      if (!id.replaceAll('\\', '/').endsWith('/world/index.ts')) return;
      return source.replace('const scene = new Scene();', 'const scene = new Scene(); window.reviewScene=scene;')
        .replace('const camera = new PerspectiveCamera(55, 1, 0.1, 100);', 'const camera = new PerspectiveCamera(55, 1, 0.1, 100); window.reviewCamera=camera;')
        .replace('renderer = new WebGLRenderer({ antialias: true });', 'renderer = new WebGLRenderer({ antialias: true }); window.reviewRenderer=renderer;');
    },
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      if (req.url === '/sky-source') { res.setHeader('content-type', 'text/html'); res.end(await server.transformIndexHtml('/sky-source', html)); return; }
      if (req.url !== '/en/world-content.json') return next();
      res.setHeader('content-type', 'application/json'); res.end(await readFile('out/en/world-content.json'));
    }); },
  }], server: { host: '127.0.0.1', port: 4202, strictPort: true, hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const report = { label, main, method: 'Vite source; before loads every src module from git main; same world entry, viewport, camera, warmup, reduced motion', measurements: [], errors: [], hashes };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto('http://127.0.0.1:4202/sky-source');
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ timeout: 180000 }); await page.bringToFront(); await world.locator('canvas').focus();
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const poses = before ? {} : JSON.parse(await readFile('tmp/hr-sky/return1/before/poses.json', 'utf8'));
  for (const zone of (process.env.SKY_REVIEW_ZONE?.split(',') ?? (low ? ['horizon'] : ['first-light', 'roots', 'horizon', 'quiet-shore', 'last-postcard']))) {
    if (zone !== 'first-light') await world.evaluate((el, id) => el.__tqaJourney.goTo(id), zone);
    await world.evaluate((el, quality) => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality } })), low ? 'low' : 'high');
    await page.waitForTimeout(Number(process.env.SKY_REVIEW_WARMUP ?? 20000));
    const p = await world.evaluate(el => el.__tqaJourney.position());
    for (const [angle, rise] of [['horizon', 0], ['up', 22]]) {
      const eye = p.y + (angle === 'up' ? zone === 'roots' ? 60 : 20 : 2);
      const key = `${zone}-${angle}`;
      if (before) poses[key] = { position: [p.x, eye, p.z + 3], target: [p.x, eye + rise, p.z - 30] };
      await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses[key]);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${dest}/${key}.png` });
      if (zone === 'first-light' && angle === 'horizon') {
        report.canopy = await page.evaluate(() => {
          const { Raycaster, Vector2 } = window.THREE;
          const ray = new Raycaster();
          return [[0, .6], [-.5, .6], [.5, .6], [0, .3]].map(([x, y]) => {
            ray.setFromCamera(new Vector2(x, y), window.reviewCamera);
            return { ndc: [x, y], hits: ray.intersectObjects(window.reviewScene.children, true).slice(0, 4).map(h => ({ name: h.object.name, parent: h.object.parent?.name, geometry: h.object.geometry.type, material: h.object.material.name, distance: h.distance, point: h.point.toArray(), instance: h.instanceId })) };
          });
        });
      }
    }
    const a = await cdp.send('Performance.getMetrics');
    const frames = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now(); let previous = start; const frames = [];
      requestAnimationFrame(function frame(now) {
        frames.push({ ms: now - previous, ...window.reviewRenderer.info.render }); previous = now;
        if (now - start >= 5000) resolve(frames); else requestAnimationFrame(frame);
      });
    }));
    const b = await cdp.send('Performance.getMetrics');
    const metric = (r, k) => r.metrics.find(m => m.name === k).value;
    const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
    report.measurements.push({ zone, fps: 1000 / mean('ms'), lastPostCalls: mean('calls'), lastPostTriangles: mean('triangles'), cpuTaskMsPerSecond: (metric(b, 'TaskDuration') - metric(a, 'TaskDuration')) * 1000 / (metric(b, 'Timestamp') - metric(a, 'Timestamp')), quality: await world.getAttribute('data-world-quality') });
    console.log(JSON.stringify(report.measurements.at(-1)));
    await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: null })));
  }
  report.playableMs = await page.evaluate(() => window.playable);
  report.gpu = await page.evaluate(() => { const gl = window.reviewRenderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER); });
  if (before) await writeFile(`${dest}/poses.json`, JSON.stringify(poses, null, 2));
  await page.evaluate(() => window.disposeWorld());
} finally {
  await browser.close(); await vite.close(); await writeFile(`${dest}/report.json`, JSON.stringify(report, null, 2));
}
if (report.errors.length) throw new Error(report.errors.join('\n'));
console.log(`${label}: ${report.measurements.length} zones; no page/shader errors; main ${main}`);
