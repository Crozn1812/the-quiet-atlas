// HR-FIX-SETPIECE: re-capture the HR-AUDIT poses of A06/A14/A15/A16/A17/A24 on this slot's port.
// Same pose formulas, viewport, Edge hardware check and 3 s rAF sample as tools/review/hr-audit.mjs.
// Usage: node tools/serve-out/index.mjs out --port 4207 &  node tools/assets/blender/hr-fix-setpiece-review.mjs [dir]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { sharp } from '../../review/luma.mjs';
import { auditLayout } from '../../review/hr-audit-layout.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const dest = path.resolve(root, process.argv[2] ?? 'test-results/hr-fix-setpiece/after');
const base = `http://127.0.0.1:${process.env.E2E_PORT ?? 4207}`;
const add = (a, b) => a.map((v, i) => v + b[i]), scale = (a, s) => a.map(v => v * s), unit = a => scale(a, 1 / Math.hypot(...a));
const layout = await auditLayout(), shots = [];
const pose = (id, zone, position, target, extra = {}) => shots.push({ id, zone, position, target, quality: 'high', ...extra });
for (const z of layout.zones.filter(zone => ['workshop', 'horizon', 'quiet-shore', 'last-postcard'].includes(zone.id))) {
  const { id, anchor: a, target: t, forward: f } = z, toward = unit([t[0] - a[0], 0, t[2] - a[2]]);
  pose(`${id}-overview`, id, add(add(a, scale(f, -10)), [0, 3.5, 0]), t);
  pose(`${id}-close`, id, add(add(t, scale(toward, -3)), [0, .4, 0]), t);
  pose(`${id}-path`, id, add(add(a, scale(f, -4)), [0, 1.65, 0]), t);
  // Ticket extra: 1.6 m from the hero object, for material detail.
  pose(`${id}-detail`, id, add(add(t, scale(toward, -1.6)), [0, .55, 0]), add(t, [0, .2, 0]));
}
const first = layout.zones.find(z => z.id === 'first-light');
pose('signpost', 'first-light', add(first.anchor, [2, 1.8, 3]), add(first.anchor, [0, 1.2, 0]));
const roots = layout.zones.find(z => z.id === 'roots');
pose('roots-path', 'roots', add(add(roots.anchor, scale(roots.forward, -4)), [0, 1.65, 0]), roots.target);
pose('vehicle-detail', 'first-light', null, null, { gameplay: 'parked', zoom: true });
pose('vehicle-riding-close', 'first-light', null, null, { gameplay: 'riding', zoom: true });
const workshop = shots.find(s => s.id === 'workshop-close');
pose('low-workshop-close', 'workshop', workshop.position, workshop.target, { quality: 'low' });

// Optional third argument: comma-separated shot ids, to re-measure a subset on a shared machine.
if (process.argv[3]) { const only = process.argv[3].split(','); shots.splice(0, shots.length, ...shots.filter(s => only.includes(s.id))); }
await mkdir(dest, { recursive: true });
const manifest = { base, viewport: [1600, 900], captures: [], errors: [], failedRequests: [], generatedAt: new Date().toISOString(),
  measurement: '3 s rAF; WebGL calls/triangles include all passes. Shared machine, no ABBA.' };
const browser = await chromium.launch({ channel: 'msedge', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120_000);
  await page.bringToFront();
  manifest.gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  });
  if (!manifest.gpu || /swiftshader|llvmpipe|software|basic render/i.test(manifest.gpu)) throw new Error('Hardware GPU not verified');
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    const counts = { calls: 0, triangles: 0 };
    for (const [method, indexed, instanced] of [['drawArrays', false, false], ['drawElements', true, false], ['drawArraysInstanced', false, true], ['drawElementsInstanced', true, true]]) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        counts.calls++;
        const vertices = args[indexed ? 1 : 2], instances = instanced ? args[indexed ? 4 : 3] : 1;
        counts.triangles += (args[0] === 4 ? vertices / 3 : args[0] === 5 || args[0] === 6 ? Math.max(0, vertices - 2) : 0) * instances;
        return original.apply(this, args);
      };
    }
    window.__hrAudit = { counts };
  });
  page.on('pageerror', e => manifest.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') manifest.errors.push(m.text()); });
  page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') manifest.failedRequests.push(r.url()); });
  const setpieceRequests = [];
  page.on('request', r => { if (/setpiece/.test(r.url())) setpieceRequests.push(r.url().replace(base, '')); });
  await page.goto(`${base}/en/`);
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: 'visible' });
  const canvas = world.locator('canvas');
  const quality = async q => {
    await canvas.focus(); await page.keyboard.press('Escape');
    await page.locator(`.world-menu dialog input[value="${q}"]`).check();
    await page.keyboard.press('Escape'); await canvas.focus();
  };
  await quality('high');
  let activeZone, activeQuality = 'high';
  for (const shot of shots) {
    if (shot.quality !== activeQuality) { await quality(shot.quality); activeQuality = shot.quality; }
    if (shot.zone !== activeZone) { await world.evaluate((el, id) => el.__tqaJourney.goTo(id), shot.zone); activeZone = shot.zone; }
    await world.evaluate((el, s) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail: s.position ? { position: s.position, target: s.target } : null })), shot);
    await canvas.focus();
    if (shot.gameplay === 'parked') await world.evaluate(el => el.__tqaJourney.nearVehicle());
    if (shot.zoom) { await page.mouse.move(800, 450); await page.mouse.wheel(0, -2000); }
    if (shot.gameplay === 'riding') {
      await page.keyboard.press('e');
      await page.waitForFunction(() => ['manual', 'cruise'].includes(document.querySelector('[data-world-build]').dataset.worldVehicle));
      await page.keyboard.down('w');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(shot.gameplay === 'riding' ? 3500 : 7000);
    const frames = await page.evaluate(() => new Promise(resolve => {
      const samples = [], start = performance.now(); let last = start;
      const tick = now => {
        const { counts } = window.__hrAudit;
        samples.push({ ms: now - last, calls: counts.calls, triangles: counts.triangles });
        counts.calls = counts.triangles = 0; last = now;
        if (now - start < 3000) requestAnimationFrame(tick); else resolve(samples.slice(1));
      };
      window.__hrAudit.counts.calls = window.__hrAudit.counts.triangles = 0;
      requestAnimationFrame(tick);
    }));
    const seconds = frames.reduce((n, f) => n + f.ms, 0) / 1000, rendered = frames.filter(f => f.calls > 0);
    const ms = frames.map(f => f.ms).sort((a, b) => a - b);
    const clean = await page.addStyleTag({ content: '.world-viewport > :not(canvas), .world-hud { visibility: hidden !important; }' });
    await sharp(await page.screenshot()).webp({ quality: 94 }).toFile(path.join(dest, `${shot.id}.webp`));
    await clean.evaluate(el => el.remove());
    await page.keyboard.up('w');
    const sample = { ...shot, fps: frames.length / seconds, p95Ms: ms[Math.min(ms.length - 1, Math.floor(ms.length * .95))],
      drawCallsAllPasses: rendered.reduce((n, f) => n + f.calls, 0) / Math.max(1, rendered.length),
      trianglesAllPasses: rendered.reduce((n, f) => n + f.triangles, 0) / Math.max(1, rendered.length),
      quality: await world.getAttribute('data-world-quality'), setpieceRequests: [...setpieceRequests] };
    manifest.captures.push(sample);
    console.log(`${shot.id}: ${sample.fps.toFixed(1)} FPS, p95 ${sample.p95Ms.toFixed(1)} ms, ${sample.drawCallsAllPasses.toFixed(0)} draws, ${sample.trianglesAllPasses.toFixed(0)} tris, quality ${sample.quality}`);
    if (shot.gameplay === 'riding') {
      await page.keyboard.down('s'); await page.waitForTimeout(5000); await page.keyboard.up('s');
      await page.keyboard.press('e'); await page.waitForTimeout(2000);
    }
  }
} catch (error) { manifest.error = error.message; process.exitCode = 1; console.error(error.message); }
finally {
  await browser.close();
  await writeFile(path.join(dest, 'capture-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`errors ${manifest.errors.length}, failed requests ${manifest.failedRequests.length}`);
}
