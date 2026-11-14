// Read-only diagnostic: same vehicle actions/deadlines and SwiftShader as world e2e.
// `blocked` ablates only HR asset loading to isolate streaming/rendering from physics.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const [label = 'hr', base = 'http://127.0.0.1:4196'] = process.argv.slice(2);
const folder = `test-results/hr-tree2/profile-${label}`;
await mkdir(folder, { recursive: true });
async function profile(scenario) {
  const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const result = { scenario, label, phase: 'enter', samples: [], requests: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    page.on('request', r => { if (r.url().includes('/world/lib/hr-')) result.requests.push(r.url()); });
    if (label === 'blocked') await page.route('**/world/lib/hr-*', route => route.abort());
    await page.addInitScript(() => {
      window.__tqaJourney = true;
      window.__tqaSkipIntro = true;
      const stats = window.__hrProfile = { frames: [], calls: 0, triangles: 0 };
      for (const [name, indexed, instanced] of [['drawElements', true, false], ['drawArrays', false, false], ['drawElementsInstanced', true, true], ['drawArraysInstanced', false, true]]) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          stats.calls++;
          if (args[0] === 4) stats.triangles += args[indexed ? 1 : 2] / 3 * (instanced ? args[4] ?? args[3] : 1);
          return original.apply(this, args);
        };
      }
      let last = performance.now();
      const frame = now => {
        if (stats.calls) stats.frames.push({ at: now, ms: now - last, calls: stats.calls, triangles: stats.triangles });
        last = now; stats.calls = stats.triangles = 0; requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await page.goto(`${base}/en/`);
    await page.getByRole('button', { name: 'Enter World', exact: true }).click();
    const world = page.locator('.world-viewport');
    await expect(world).toBeVisible({ timeout: 45000 });
    if (!await page.evaluate(() => document.hasFocus())) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(world).toHaveAttribute('data-world-build', 'done', { timeout: 90000 });
    const sample = async phase => result.samples.push(await world.evaluate((el, phase) => ({ phase, ms: performance.now(), position: el.__tqaJourney.position(), pose: el.__tqaJourney.rider() }), phase));
    const pos = () => world.evaluate(el => el.__tqaJourney.position());
    const afterFrames = () => world.evaluate(async el => {
      await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r));
      return el.__tqaJourney.position();
    });
    await sample('build');
    await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'high' } })));
    await world.locator('canvas').focus();
    await world.evaluate(el => el.__tqaJourney.nearVehicle());
    await page.waitForTimeout(800); await page.keyboard.press('e');
    await expect(world).toHaveAttribute('data-world-vehicle', 'manual');
    result.phase = 'mount';
    await expect.poll(() => world.evaluate(el => el.__tqaJourney.rider().transitioning), { timeout: 15000 }).toBe(false);
    await sample('mounted');
    const start = await pos();
    await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.down('d');
    result.phase = 'drive';
    await expect.poll(async () => { const p = await afterFrames(); return Math.hypot(p.x - start.x, p.z - start.z); }).toBeGreaterThan(.1);
    await sample('driven');
    await page.keyboard.up('d'); await page.keyboard.up('w');
    if (scenario === 'brake') {
      result.phase = 'brake'; await page.keyboard.down('s');
      await expect.poll(async () => { const a = await pos(), b = await afterFrames(); return Math.hypot(a.x - b.x, a.z - b.z); }, { timeout: 15000 }).toBeLessThan(.002);
      await page.keyboard.up('s'); await sample('stopped');
    }
    result.phase = 'dismount'; await page.keyboard.press('e');
    await expect(world).toHaveAttribute('data-world-vehicle', 'parked', { timeout: 15000 });
    await expect.poll(() => world.evaluate(el => el.__tqaJourney.rider().transitioning), { timeout: 15000 }).toBe(false);
    await sample('standing'); result.phase = 'pass';
  } catch (error) { result.error = error.message; }
  finally {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) result.render = await page.evaluate(() => window.__hrProfile).catch(() => null);
    await browser.close();
  }
  await writeFile(`${folder}/${scenario}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ label, scenario, phase: result.phase, frames: result.render?.frames.length, error: result.error }));
}
await Promise.all(['brake', 'rolling'].map(profile));
