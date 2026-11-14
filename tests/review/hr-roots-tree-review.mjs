// Same production poses before/after. Hardware Edge; no persisted settings.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const label = process.argv[2] ?? 'after';
const quick = process.argv.includes('--quick');
const directory = `test-results/hr-roots-tree/${label}`;
await mkdir(directory, { recursive: true });
const { five } = JSON.parse(await readFile('test-results/hr-roots-sign/return1-poses.json', 'utf8'));
const forward = five.target.map((v, i) => (v - five.position[i]) / 5);
const right = [-forward[2], 0, forward[0]];
const trunk = five.target.map((v, i) => v + forward[i] * 6 + right[i] * 1.9864);
const poses = { five, fifteen: {
  position: trunk.map((v, i) => i === 1 ? five.position[1] - 1.25 : v - forward[i] * 15),
  target: trunk.map((v, i) => i === 1 ? five.target[1] + 13 : v),
}, full: {
  position: trunk.map((v, i) => i === 1 ? five.position[1] - 1.25 : v - forward[i] * 35),
  target: trunk.map((v, i) => i === 1 ? five.target[1] + 12 : v),
} };
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const report = { label, poses, errors: [], measurements: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    const s = window.__rootsDraw = { calls: 0, triangles: 0, frames: [] };
    for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        s.calls++;
        if (args[0] === 4) s.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
        return original.apply(this, args);
      };
    }
    let last = performance.now();
    const frame = now => { if (s.calls) s.frames.push({ ms: now - last, calls: s.calls, triangles: s.triangles }); last = now; s.calls = s.triangles = 0; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.goto(`${process.argv[3] ?? 'http://127.0.0.1:4278'}/en/`);
  const clicked = Date.now();
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor(); report.playableMs = Date.now() - clicked;
  report.playableAt = await page.evaluate(() => performance.now());
  await page.addStyleTag({ content: '[data-world-interaction-hint] { visibility: hidden !important; }' });
  await world.evaluate(e => e.__tqaJourney.goTo('roots'));
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  for (const quality of quick ? ['high'] : ['high', 'low']) {
    await world.locator('canvas').focus(); await page.keyboard.press('Escape');
    await page.locator(`.world-menu input[value="${quality}"]`).check();
    await page.keyboard.press('Escape'); await world.locator('canvas').focus();
    await page.waitForTimeout(quick ? 8000 : 18000);
    for (const [name, pose] of Object.entries(poses)) {
      await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${directory}/${name}-${quality}.png` });
      console.log(`${label}: ${name}-${quality} captured`);
      for (let sample = 0; sample < (quick ? 0 : 2); sample++) {
        await page.evaluate(() => { window.__rootsDraw.frames = []; }); const a = await metrics();
        await page.waitForTimeout(5000); const b = await metrics();
        const frames = await page.evaluate(() => window.__rootsDraw.frames);
        const mean = key => frames.reduce((s, f) => s + f[key], 0) / frames.length;
        report.measurements.push({ quality, actualQuality: await world.getAttribute('data-world-quality'), name, sample,
          fps: 1000 / mean('ms'), triangles: mean('triangles'), calls: mean('calls'),
          cpuTaskMsPerSecond: (b.TaskDuration - a.TaskDuration) * 1000 / (b.Timestamp - a.Timestamp),
          cpuScriptMsPerSecond: (b.ScriptDuration - a.ScriptDuration) * 1000 / (b.Timestamp - a.Timestamp) });
      }
    }
  }
  report.gpu = await world.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'); const debug = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(debug.UNMASKED_RENDERER_WEBGL); });
  report.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /\/world\/(roots|lib\/hr-)/.test(r.name)).map(r => ({ url: r.name, bytes: r.encodedBodySize, startTime: r.startTime })));
} finally { await browser.close(); }
await writeFile(`${directory}/metrics.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ label, gpu: report.gpu, errors: report.errors, measurements: report.measurements }));
if (report.errors.length) process.exitCode = 1;
