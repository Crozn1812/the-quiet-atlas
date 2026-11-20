// Reproducible QF-04 poses. Run before against the existing export, after against the final build.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'after';
const dest = `test-results/qf-04/${label}`;
await mkdir(dest, { recursive: true });
const board = [23.044336693923803, 8.80036790132296, -112.39148086811748];
const front = [0.870, 0, 0.493];
const length = Math.hypot(...front); front.forEach((v, i) => front[i] = v / length);
const trunk = [20.35, 5.9, -118.44];
const wideFront = [-.8, 0, .6];
const poses = {
  'board-5m': { position: board.map((v, i) => v + front[i] * 5), target: board },
  'tree-25m': { position: trunk.map((v, i) => v + wideFront[i] * 25 + (i === 1 ? 4 : 0)), target: trunk.map((v, i) => v + (i === 1 ? 6 : 0)) },
};
const report = { label, poses, errors: [], captures: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => { report.errors.push(e.message); console.log('PAGE ERROR', e.message); });
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0,1000)); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true;
    const counts = window.__qf04 = { calls: 0, triangles: 0, frames: [] };
    for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        counts.calls++;
        if (args[0] === 4) counts.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[indexed ? 4 : 3] : 1);
        return original.apply(this, args);
      };
    }
    const frame = () => { if (counts.calls) counts.frames.push({ calls: counts.calls, triangles: counts.triangles }); if (counts.frames.length > 120) counts.frames.shift(); counts.calls = counts.triangles = 0; requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
  await page.goto(`${process.argv[3] ?? 'http://127.0.0.1:4203'}/en/`);
  await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({timeout: 60000}).catch(async e => { await page.screenshot({path: `${dest}/error.png`}); throw e; });
  await world.evaluate(e => e.__tqaJourney.goTo('roots'));
  for (const quality of label === 'before' ? ['high'] : ['high', 'low']) {
    await world.locator('canvas').focus(); await page.keyboard.press('Escape');
    await page.locator(`.world-menu input[value="${quality}"]`).check();
    await page.keyboard.press('Escape');
    for (const [name, pose] of Object.entries(poses)) {
      if (process.argv[4] && name !== process.argv[4]) continue;
      if (quality === 'low' && name !== 'tree-25m') continue;
      await world.evaluate((e, detail) => e.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      if (label !== 'before') {
        await world.locator(quality === 'high' ? 'canvas[data-roots-tree^="roots-tree-lod"]' : 'canvas[data-roots-tree="fallback"]').waitFor({timeout: 120000});
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(18000);
      const actualQuality = await world.getAttribute('data-world-quality');
      if (actualQuality !== quality) throw Error(`Expected ${quality}, got ${actualQuality}`);
      const style = await page.addStyleTag({ content: '.world-viewport > :not(canvas), .world-hud { visibility: hidden !important; }' });
      const file = `${dest}/${name}-${quality}.png`;
      await page.screenshot({ path: file }); await style.evaluate(e => e.remove());
      const scene = await page.evaluate(() => { const frames = window.__qf04.frames; return { samples: frames.length, calls: frames.reduce((s,f) => s + f.calls, 0) / frames.length, triangles: frames.reduce((s,f) => s + f.triangles, 0) / frames.length }; });
      report.captures.push({ file, quality, sceneAllPasses: scene }); console.log(file);
    }
  }
  report.gpu = await world.locator('canvas').evaluate(c => { const gl = c.getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); });
} finally { await browser.close(); await writeFile(`${dest}/capture.json`, JSON.stringify(report, null, 2)); }
if (report.errors.length) throw Error(report.errors.join('\n'));
