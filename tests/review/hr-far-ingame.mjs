// Exercise the repository's production in-game capture tool with matched poses.
import { captureIngame } from '../../tools/review/ingame-shots.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const quality=process.argv[2]??'high',baseUrl=process.argv[3]??'http://127.0.0.1:4307';
const warmupMs=quality==='high'?45000:10000;
const outDir=`test-results/hr-far/${process.env.HR_FAR_INGAME_LABEL??'round2-ingame'}-${quality}`;
const baseline=JSON.parse(await readFile(process.env.HR_FAR_POSES??'test-results/hr-far/round2-before/metrics.json','utf8'));
const errors=[],poses=[];
await captureIngame({outDir,baseUrl,locale:'en',showcase:{quality,
  async onPage(page){
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  },
  async onZone(page,world,zone){
    if(!['workshop','old-trail','horizon','milestones'].includes(zone)||quality==='low'&&zone!=='horizon')return;
    const sample=baseline.samples.find(s=>s.zone===zone&&s.quality===quality)
      ?? baseline.samples.find(s=>quality==='low'&&s.zone===zone&&s.quality==='high'); assert.ok(sample);
    for(const [suffix,pose] of quality==='high'?[['',sample.pose],['-far',sample.farPose]]:[['',sample.pose]]){
      await world.evaluate((el,detail)=>el.dispatchEvent(new CustomEvent('tqa:postcard',{detail})),pose);
      await page.waitForTimeout(suffix?1500:warmupMs);
      assert.equal(await world.getAttribute('data-world-quality'),quality);
      await world.locator('canvas').screenshot({path:`${outDir}/${zone}${suffix}.png`});
      poses.push({zone,suffix,quality,pose,warmupMs:suffix?1500:warmupMs});
    }
    await world.evaluate(el=>el.dispatchEvent(new CustomEvent('tqa:postcard',{detail:null})));
  },
  async onComplete(){assert.deepEqual(errors,[]);await writeFile(`${outDir}/poses.json`,JSON.stringify(poses,null,2));}
}});
console.log(`ingame-shots ${quality}: ${poses.length} matched captures; zero page/shader errors`);
