// Evidence against the production export. Uses the existing opt-in postcard/QA hooks.
// node tools/assets/blender/milestones-world-review.mjs [before|shots|cpu]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { Vector3, Mesh } from 'three';

const mode = process.argv[2] ?? 'shots';
const output = `test-results/ms-c/world${mode === 'before' ? '/before' : ''}`; await mkdir(output, { recursive: true });
const vite = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c-vite' });
const { placeZoneScenes } = await vite.ssrLoadModule('/src/features/world/zones/index.ts');
const { surfaceHeight } = await vite.ssrLoadModule('/src/features/world/scene/compose.ts');
const [zone] = placeZoneScenes(surfaceHeight, ['milestones']); zone.group.updateMatrixWorld(true);
const statue = zone.group.getObjectByName('milestones-walking-statue');
const poses = Object.fromEntries([['front', .12], ['back', Math.PI + .25], ['sockets', -.65]].map(([name, angle]) => [name, {
  position: statue.localToWorld(new Vector3(Math.sin(angle) * 9, 4, Math.cos(angle) * 9)).toArray(),
  target: statue.localToWorld(new Vector3(0, 3, 0)).toArray(),
}]));
const staticBudget = { triangles: 0, draws: 0 };
zone.group.traverse(node => { if (node instanceof Mesh && !node.name.startsWith('milestones-static') && !node.name.includes('certificate-shards') && !node.name.includes('golden-ribbons')) {
  staticBudget.triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3; staticBudget.draws++;
} });
zone.dispose(); await vite.close();
const servers = [];
async function serve(root, port) {
  servers.push(spawn(process.execPath, ['tools/serve-out/index.mjs', root, '--port', String(port)], { windowsHide: true, stdio: 'ignore' }));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/404.html`)).ok) return `http://127.0.0.1:${port}`; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server ${port} did not start`);
}
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [], requests = [];
async function enter(base, recording = false) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ...(recording ? { recordVideo: { dir: output, size: { width: 1600, height: 1000 } } } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/world/milestones/')) requests.push(request.url()); });
  await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
  await page.goto(`${base}/en/`); await page.getByRole('button', { name: 'Enter World', exact: true }).click();
  const world = page.locator('[data-world-build="done"][data-world-intro="done"]'); await world.waitFor();
  await world.evaluate(el => el.__tqaJourney.goTo('milestones'));
  await page.keyboard.press('Escape'); await page.locator('.world-menu input[value="high"]').check(); await page.keyboard.press('Escape');
  await page.bringToFront(); await world.locator('canvas').focus();
  const distance = () => world.evaluate((el, target) => { const p = el.__tqaJourney.position(); return Math.hypot(p.x - target[0], p.z - target[2]); }, poses.front.target);
  let previous = await distance(), key = 'w';
  for (let step = 0; previous > 11 && step < 12; step++) {
    await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
    const next = await distance(); if (next > previous + .2) key = key === 'w' ? 's' : 'w'; previous = next;
  }
  assert(previous <= 12, `Player is ${previous.toFixed(2)} m from the statue; animation evidence requires <=12 m`);
  await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses.front);
  await page.waitForTimeout(7000);
  assert.equal(await world.getAttribute('data-world-quality'), 'high');
  return { context, page, world };
}
try {
  const current = await serve('out', 4531);
  if (mode === 'shots' || mode === 'before') {
    const { context, page, world } = await enter(current, mode === 'shots');
    await page.addStyleTag({ content: '.world-hud,[data-hud-keys],.interaction-hint,.zone-title{visibility:hidden!important}' });
    const frames = [];
    for (const [name, pose] of Object.entries(poses)) {
      await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), pose);
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${output}/high-${name}.png` }); frames.push({ name, quality: 'high', pose });
    }
    await world.evaluate((el, detail) => el.dispatchEvent(new CustomEvent('tqa:postcard', { detail })), poses.front);
    if (mode === 'shots') await page.waitForTimeout(10000); // Continuous High shader-motion segment in the saved recording.
    await world.evaluate(el => el.dispatchEvent(new CustomEvent('tqa:set-quality', { detail: { quality: 'low' } })));
    await page.waitForTimeout(2000); await page.screenshot({ path: `${output}/low-front.png` });
    frames.push({ name: 'front', quality: 'low', pose: poses.front });
    const player = await world.evaluate(el => el.__tqaJourney.position());
    const playerDistance = Math.hypot(player.x - poses.front.target[0], player.z - poses.front.target[2]);
    const video = page.video(); await context.close();
    if (video) await video.saveAs(`${output}/milestones-animation.webm`);
    await writeFile(`${output}/review.json`, JSON.stringify({ frames, staticBudget, requests, errors, playerDistance }, null, 2));
    assert.equal(errors.length, 0, errors.join('\n'));
    if (mode === 'shots') assert(requests.length > 0, 'The deferred statue asset must be requested');
    console.log(JSON.stringify({ output, staticBudget, requests, errors }));
  } else if (mode === 'cpu') {
    const baseline = await serve('node_modules/.cache/ms-c-baseline-out', 4532), samples = [];
    for (const [label, base] of [['A1', baseline], ['B1', current], ['B2', current], ['A2', baseline]]) {
      const { context, page, world } = await enter(base);
      const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
      const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
      const before = await get(); await page.waitForTimeout(10000); const after = await get();
      const seconds = after.Timestamp - before.Timestamp;
      const sample = { label, seconds, scriptMsPerSecond: (after.ScriptDuration - before.ScriptDuration) * 1000 / seconds,
        taskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1000 / seconds,
        quality: await world.getAttribute('data-world-quality') };
      samples.push(sample); console.log(JSON.stringify(sample)); await context.close();
    }
    const mean = prefix => samples.filter(s => s.label.startsWith(prefix)).reduce((sum, s) => sum + s.scriptMsPerSecond, 0) / 2;
    const delta = mean('B') - mean('A');
    await writeFile(`${output}/cpu-abba.json`, JSON.stringify({ samples, delta, pass: delta <= 10,
      baseline: 'Existing 07:01 workspace export, before FISH-01; copied without rebuilding. Comparison includes FISH-01 and MS-C, not an isolated MS-C delta against HEAD.' }, null, 2));
    console.log(`REPORT ADR0019 ABBA script CPU delta: ${delta.toFixed(2)} ms/s; legacy reference +10 ms/s`);
    console.log(`ABBA delta: ${delta.toFixed(2)} ms/s (budget +10 ms/s)`);
  } else throw new Error('Expected before, shots or cpu');
} finally { await browser.close(); for (const server of servers) server.kill(); }
