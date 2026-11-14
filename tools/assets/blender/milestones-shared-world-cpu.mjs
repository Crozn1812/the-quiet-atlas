// ABBA in one warmed world/renderer, with exact pre-MS-C and current factories.
// Both alternatives stay registered; only the active branch renders/raycasts/updates.
// This removes browser/context/driver startup from the measured difference.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { Vector3 } from 'three';

const directory = 'tmp/ms-c2/shared', output = 'test-results/ms-c2/shared-world', revision = '00e1850^';
await mkdir(directory, { recursive: true }); await mkdir(output, { recursive: true });
const old = execFileSync('git', ['show', `${revision}:src/features/world/zones/milestones.ts`], { encoding: 'utf8', windowsHide: true });
await writeFile(`${directory}/baseline.ts`, old.replaceAll('"../../../content/', '"/src/content/').replaceAll('"../', '"/src/features/world/').replaceAll('"./', '"/src/features/world/zones/'));
const cleanup = () => rmSync(`${directory}/baseline.ts`, { force: true });
process.once('exit', cleanup);
const target = path.resolve('src/features/world/zones/milestones.ts').replaceAll('\\', '/').toLowerCase();
const source = await readFile('src/features/world/zones/milestones.ts', 'utf8');
const paired = `import { createMilestonesScene as baselineFactory } from '/${directory}/baseline.ts';
${source.replace(/export (const|function) createMilestonesScene/, '$1 currentFactory')}
export function createMilestonesScene(context) {
  const a=baselineFactory(context), b=currentFactory(context), group=new Group();
  group.name='milestones-shared-review';group.add(a.group,b.group);
  let active='B';
  for(const [version,zone] of [['A',a],['B',b]]) zone.group.traverse(node=>{
    if(!node.isMesh && !node.isPoints) return;
    const ray=node.raycast.bind(node);
    node.raycast=(...args)=>{if(active===version)ray(...args);};
  });
  const select=version=>{active=version;a.group.visible=version==='A';b.group.visible=version==='B';};
  globalThis.__msShared={select,ready:()=>!!b.group.userData.statue.ready,version:()=>active,revision:${JSON.stringify(revision)}};
  select('B');
  return {...b,group,update(dt,rm){(active==='A'?a:b).update?.(dt,rm);},dispose(){a.dispose();b.dispose();group.clear();}};
}`;
await writeFile(`${directory}/viewer.html`, '<!doctype html><html><head><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#world{width:100%;height:100%;position:relative}canvas{display:block}[data-world-interaction-hint],[data-hud-keys]{visibility:hidden}</style></head><body><div id="world" tabindex="0"></div><script type="module" src="./viewer.js"></script></body></html>');
await writeFile(`${directory}/viewer.js`, `import {mountWorld} from '/src/features/world/index.ts';
window.review={ready:false}; const el=document.getElementById('world');
window.review.dispose=await mountWorld(el,{locale:'en',quality:'high'});
el.dispatchEvent(new CustomEvent('tqa:set-quality',{detail:{quality:'high'}}));window.review.ready=true;`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/ms-c2-shared',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [{ name: 'read-only-shared-ms-factories', enforce: 'pre', load(id) {
    if(id.split('?')[0].replaceAll('\\','/').toLowerCase()===target)return paired;
  } }], server: { host: '127.0.0.1', port: 4537, strictPort: true } });
await server.listen();
const { placeZoneScenes } = await server.ssrLoadModule('/src/features/world/zones/index.ts');
const { surfaceHeight } = await server.ssrLoadModule('/src/features/world/scene/compose.ts');
const [zone] = placeZoneScenes(surfaceHeight, ['milestones']); zone.group.updateMatrixWorld(true);
const statue = zone.group.getObjectByName('milestones-walking-statue');
const pose = { position: statue.localToWorld(new Vector3(Math.sin(.12)*9,4,Math.cos(.12)*9)).toArray(),
  target: statue.localToWorld(new Vector3(0,3,0)).toArray() };
zone.dispose();
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const errors = [], requests = [], samples = [];
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(r.url().includes('/world/milestones/'))requests.push(r.url());});
  await page.addInitScript(()=>{
    window.__tqaJourney=true;window.__tqaSkipIntro=true;
    const nativeRAF=window.requestAnimationFrame.bind(window), pending=new Map();
    let sequence=0, scheduled=false, previous=-Infinity;
    window.__msCadence={frames:0,hz:60};
    function pump(now){
      scheduled=false;if(!pending.size)return;
      if(previous===-Infinity)previous=now-1000/60;
      if(now-previous>=1000/60-.25){
        previous+=1000/60*Math.max(1,Math.floor((now-previous+.25)/(1000/60)));window.__msCadence.frames++;
        const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(now);
      }
      if(pending.size&&!scheduled){scheduled=true;nativeRAF(pump);}
    }
    window.requestAnimationFrame=callback=>{const id=++sequence;pending.set(id,callback);if(!scheduled){scheduled=true;nativeRAF(pump);}return id;};
    window.cancelAnimationFrame=id=>{pending.delete(id);};
  });
  await page.goto(`http://127.0.0.1:4537/${directory}/viewer.html`);await page.waitForFunction(()=>window.review?.ready);
  const world=page.locator('#world[data-world-build="done"][data-world-intro="done"]');await world.waitFor();
  await page.bringToFront();await world.locator('canvas').focus();
  await world.evaluate(el=>el.__tqaJourney.goTo('milestones'));
  const distance=()=>world.evaluate((el,target)=>{const p=el.__tqaJourney.position();return Math.hypot(p.x-target[0],p.z-target[2]);},pose.target);
  let previous=await distance(), key='w';
  for(let step=0;previous>11&&step<12;step++){
    await page.keyboard.down(key);await page.waitForTimeout(500);await page.keyboard.up(key);
    const next=await distance();if(next>previous+.2)key=key==='w'?'s':'w';previous=next;
  }
  assert(previous<=12);
  await world.evaluate((el,detail)=>el.dispatchEvent(new CustomEvent('tqa:postcard',{detail})),pose);
  // Precompile/load BOTH alternatives in this same renderer before any sample.
  await page.waitForFunction(()=>globalThis.__msShared?.ready());
  for(const version of ['B','A']){
    await page.evaluate(version=>globalThis.__msShared.select(version),version);await page.waitForTimeout(15000);
  }
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  for(const label of ['A1','B1','B2','A2']){
    await page.evaluate(version=>globalThis.__msShared.select(version),label[0]);await page.waitForTimeout(3000);
    const status=await world.evaluate(el=>({quality:el.dataset.worldQuality,paused:el.dataset.worldPaused,
      version:globalThis.__msShared.version(),ready:globalThis.__msShared.ready(),position:el.__tqaJourney.position()}));
    assert.equal(status.quality,'high');assert.equal(status.paused,'false');assert.equal(status.version,label[0]);assert(status.ready);
    await page.screenshot({path:`${output}/${label}.png`});
    const firstFrame=await page.evaluate(()=>window.__msCadence.frames), start=await metrics();
    await page.waitForTimeout(10000);
    const end=await metrics(), frames=await page.evaluate(()=>window.__msCadence.frames)-firstFrame, seconds=end.Timestamp-start.Timestamp;
    const sample={label,seconds,frames,fps:frames/seconds,scriptMsPerSecond:(end.ScriptDuration-start.ScriptDuration)*1000/seconds,
      taskMsPerSecond:(end.TaskDuration-start.TaskDuration)*1000/seconds,scriptMsAt60fps:(end.ScriptDuration-start.ScriptDuration)*1000/frames*60,status};
    samples.push(sample);console.log(JSON.stringify(sample));
  }
  const mean=(prefix,key)=>samples.filter(s=>s.label[0]===prefix).reduce((sum,s)=>sum+s[key],0)/2;
  const delta=mean('B','scriptMsPerSecond')-mean('A','scriptMsPerSecond');
  const normalizedDelta=mean('B','scriptMsAt60fps')-mean('A','scriptMsAt60fps');
  const cadencePass=samples.every(s=>s.fps>=58&&s.fps<=61);
  const report={revision,samples,delta,normalizedDelta,cadencePass,errors,requests,pass:cadencePass&&errors.length===0&&delta<=10&&normalizedDelta<=10,
    scope:'Same complete world, renderer, Rapier/post/SURF/terrain/character/environment/dressing and warmed driver; exact pre-MS-C/current Milestones alternatives selected in place. Inactive render/raycast/update skipped; identical static traversal registration for both. Reviewer-only 60 Hz, every sample >=58 fps; both raw and normalized deltas <=10 ms/s.'};
  await writeFile(`${output}/abba.json`,JSON.stringify(report,null,2));
  assert(report.pass,`Shared world ABBA: raw ${delta.toFixed(2)}, normalized ${normalizedDelta.toFixed(2)} ms/s; cadence=${cadencePass}; errors=${errors.join(';')}`);
  console.log(`PASS: shared full-world ABBA ${delta.toFixed(2)} ms/s <= +10 ms/s`);
} finally {await browser.close();await server.close();cleanup();}
