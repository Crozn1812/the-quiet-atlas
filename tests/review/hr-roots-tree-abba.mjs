// Same final export, hardware Edge, A1/B1/B2/A2. A blocks only the new tree.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = 'test-results/hr-roots-tree';
await mkdir(root, { recursive: true });
const { poses } = JSON.parse(await readFile(`${root}/before/metrics.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const reports = [];
try {
  for (const mode of ['A1', 'B1', 'B2', 'A2', 'Low-cold']) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    const report = { mode, errors: [], rootsRequests: [], measurements: [] }; reports.push(report);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('request', r => { if (r.url().includes('/world/roots/')) report.rootsRequests.push(r.url()); });
    if (mode.startsWith('A')) await page.route('**/world/roots/roots-tree-*.glb', route => route.abort('blockedbyclient'));
    await page.addInitScript(() => {
      window.__tqaJourney = true; window.__tqaSkipIntro = true;
      const stats = window.__rootsABBA = { calls: 0, triangles: 0, frames: [] };
      for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          stats.calls++; if (args[0] === 4) stats.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
          return original.apply(this, args);
        };
      }
      let last = performance.now();
      const frame = now => { if (stats.calls) stats.frames.push({ ms: now - last, calls: stats.calls, triangles: stats.triangles }); last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    });
    await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:4278'}/en/`);
    const clicked = Date.now(); await page.getByRole('button', { name: 'Enter World', exact: true }).click();
    const world = page.locator('[data-world-build="done"][data-world-intro="done"]'); await world.waitFor();
    report.playableMs = Date.now() - clicked;
    await world.locator('canvas').focus(); await page.keyboard.press('Escape');
    await page.locator(`.world-menu input[value="${mode === 'Low-cold' ? 'low' : 'high'}"]`).check();
    await page.keyboard.press('Escape'); await world.locator('canvas').focus();
    await world.evaluate(e => e.__tqaJourney.goTo('roots')); await page.waitForTimeout(22000);
    report.quality = await world.getAttribute('data-world-quality');
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    for (const name of ['five', 'fifteen']) {
      await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses[name]);
      await page.waitForTimeout(2500); await page.evaluate(() => { window.__rootsABBA.frames = []; });
      const a = await metrics(); await page.waitForTimeout(6000); const b = await metrics();
      const frames = await page.evaluate(() => window.__rootsABBA.frames);
      const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
      report.measurements.push({ name, fps: 1000 / mean('ms'), calls: mean('calls'), triangles: mean('triangles'),
        cpuTaskMsPerSecond: (b.TaskDuration - a.TaskDuration) * 1000 / (b.Timestamp - a.Timestamp),
        cpuScriptMsPerSecond: (b.ScriptDuration - a.ScriptDuration) * 1000 / (b.Timestamp - a.Timestamp) });
    }
    report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(debug.UNMASKED_RENDERER_WEBGL); });
    console.log(JSON.stringify(report)); await context.close();
    await writeFile(`${root}/abba.json`, JSON.stringify(reports, null, 2));
  }
} finally { await browser.close(); }
if (reports.some(r => r.errors.length) || reports.find(r => r.mode === 'Low-cold').rootsRequests.length) process.exitCode = 1;
