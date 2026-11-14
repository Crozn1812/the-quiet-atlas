// Run against the single completed static build. Asset-only ticket: these are
// regression pictures of the unchanged game, not an HR-TREE2 integration claim.
import { writeFile } from 'node:fs/promises';
import { captureIngame } from '../../review/ingame-shots.mjs';
import { createOutServer } from '../../serve-out/index.mjs';
import { resolve } from 'node:path';

const outDir='tools/assets/blender/hr-trees-review';
const owned=process.argv[2]?null:createOutServer(resolve('out'));
if(owned)await new Promise(done=>owned.listen(0,'127.0.0.1',done));
const baseUrl=process.argv[2]??`http://127.0.0.1:${owned.address().port}`;
const stop=new Error('HR first-light capture complete');
const sessions=[];
try {
for(const [label,quality] of [['before','high'],['after','high'],['low','low']]) {
  const session={label,quality,hrAssetRequests:[],errors:[]};
  let started;
  try {
    await captureIngame({outDir,baseUrl,locale:'en',showcase:{quality,
      async onPage(page){
        await page.addInitScript(()=>{
          const timing={clicked:null,playable:null};window.__hrEntryTimes=timing;
          document.addEventListener('click',event=>{
            if(event.target.closest?.('button')?.textContent.trim()==='Enter World')timing.clicked=performance.now();
          },true);
          new MutationObserver(()=>{
            if(timing.clicked!==null && timing.playable===null && document.querySelector('.world-viewport[data-world-build="done"][data-world-intro="done"]')) {
              timing.playable=performance.now();
            }
          }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-world-build','data-world-intro']});
        });
        page.on('pageerror',e=>session.errors.push(e.message));
        page.on('request',r=>{if(r.url().includes('/world/lib/hr-'))session.hrAssetRequests.push(r.url());});
        page.on('request',r=>{if(r.url().includes('/en/'))started??=performance.now();});
      },
      async onZone(page,world,zone){
        if(zone!=='first-light')return;
        session.navigationThroughCaptureMs=performance.now()-started;
        session.reportedQuality=await world.getAttribute('data-world-quality');
        session.timeToPlayable=await page.evaluate(()=>{
          const t=window.__hrEntryTimes;
          return {clickToBuiltIntroDoneMs:t.playable-t.clicked,method:'DOM build=done + intro=done; QA skip intro; current game without HR integration'};
        });
        await page.screenshot({path:`${outDir}/world-${label}-${quality}.png`});
        throw stop;
      },
    }});
  } catch(error){if(error!==stop)throw error;}
  sessions.push(session);
}
await writeFile(`${outDir}/world-metrics.json`,JSON.stringify({
  note:'Same asset-only build and camera for before/after; new trees are not wired into the game. Timing includes menu and screenshot waits, NOT time to playable.',
  sessions,
},null,2)+'\n');
if(sessions.some(s=>s.hrAssetRequests.length||s.errors.length))throw new Error('Unexpected HR preload or world errors');
} finally {if(owned)await new Promise(done=>owned.close(done));}
