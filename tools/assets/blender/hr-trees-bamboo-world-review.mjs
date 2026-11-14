// Same final static build and fixed First Light stream-bank camera. Before
// replays ONLY the saved original bamboo GLBs + original manifest in memory.
// No runtime edits, injected trees, storage, or URL state.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureIngame } from '../../review/ingame-shots.mjs';
import { createOutServer } from '../../serve-out/index.mjs';
import { createServer } from 'vite';

const evidence='tools/assets/blender/hr-trees-bamboo-review';
await mkdir(evidence,{recursive:true});
const label=process.argv[2]??'after';
if(!['before','after','low'].includes(label))throw new Error('Expected before | after | low');
const server=createOutServer(resolve('out'));
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const baseUrl=`http://127.0.0.1:${server.address().port}`;
const report={label,quality:label==='low'?'low':'high',errors:[],requests:[],poses:[]};
const stop=new Error('First Light bamboo captured');
let cdp;
const source=await createServer({server:{middlewareMode:true}});
const {nearestRiver}=await source.ssrLoadModule('/src/features/world/terrain/samples.ts');
await source.close();
try {
  await captureIngame({outDir:evidence,baseUrl,showcase:{quality:report.quality,
    async onPage(page){
      await page.emulateMedia({reducedMotion:'reduce'});
      cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
      page.on('pageerror',e=>report.errors.push(e.message));
      page.on('request',r=>{if(r.url().includes('/world/lib/hr-tree-bamboo-'))report.requests.push(r.url().split('/world/')[1]);});
      if(label==='before') {
        await page.route('**/world/lib/manifest.json',route=>route.fulfill({path:resolve('tmp/hr-trees-bamboo-before/manifest.json'),contentType:'application/json'}));
        await page.route('**/world/lib/hr-tree-bamboo-*.glb',route=>route.fulfill({path:resolve('tmp/hr-trees-bamboo-before',route.request().url().split('/').at(-1)),contentType:'model/gltf-binary'}));
      }
      await page.addInitScript(()=>{
        window.__bambooScenes=[];window.__bambooRenderers=[];
        window.__bambooFrames=[];
        const stats={calls:0,triangles:0};
        for(const [name,indexed,instanced] of [['drawElements',true,false],['drawArrays',false,false],['drawElementsInstanced',true,true],['drawArraysInstanced',false,true]]) {
          const original=WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name]=function(...args){
            stats.calls++;
            if(args[0]===4)stats.triangles+=args[indexed?1:2]/3*(instanced?args[indexed?4:3]:1);
            return original.apply(this,args);
          };
        }
        let previous=performance.now();
        const frame=now=>{
          if(stats.calls)window.__bambooFrames.push({ms:now-previous,calls:stats.calls,triangles:stats.triangles});
          if(window.__bambooFrames.length>3000)window.__bambooFrames.shift();
          previous=now;stats.calls=stats.triangles=0;requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        window.__THREE_DEVTOOLS__=new EventTarget();
        window.__THREE_DEVTOOLS__.addEventListener('observe',e=>{
          if(e.detail.isScene)window.__bambooScenes.push(e.detail);
          if(e.detail.isWebGLRenderer)window.__bambooRenderers.push(e.detail);
        });
        const timing={clicked:null,playable:null};window.__bambooTiming=timing;
        document.addEventListener('click',e=>{if(e.target.closest?.('button')?.textContent.trim()==='Enter World')timing.clicked=performance.now();},true);
        new MutationObserver(()=>{if(timing.clicked!==null&&timing.playable===null&&document.querySelector('.world-viewport[data-world-build="done"][data-world-intro="done"]'))timing.playable=performance.now();}).observe(document,{subtree:true,childList:true,attributes:true});
      });
    },
    async onZone(page,world,zone){
      if(zone!=='first-light')return;
      console.info('First Light: waiting for streaming');
      await page.waitForTimeout(25000);
      report.player=await world.evaluate(e=>e.__tqaJourney.position());
      const p=report.player;
      // Widen the review frustum before inspecting batches, so offscreen bank
      // clumps can be chosen instead of the nearest upstream/back-facing one.
      await world.evaluate((e,p)=>e.dispatchEvent(new CustomEvent('tqa:postcard',{detail:{position:[p.x+28,p.y+40,p.z+65],target:[p.x,p.y,p.z-40]}})),p);
      await page.waitForTimeout(8000);
      report.bambooSites=await page.evaluate(()=>{
        const sites=[];
        for(const scene of window.__bambooScenes)scene.traverse(o=>{
          if(!o.name.startsWith('hr-tree-bamboo-')||!o.children.length)return;
          const mesh=o.children.find(c=>c.isInstancedMesh);if(!mesh)return;
          for(let i=0;i<mesh.count;i++){
            const matrix=mesh.matrixWorld.clone();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
            const root=mesh.position.clone().set(0,0,0).applyMatrix4(matrix);
            const top=mesh.position.clone().set(0,8,0).applyMatrix4(matrix);
            sites.push({id:o.name,root:root.toArray(),top:top.toArray()});
          }
        });
        return sites;
      });
      // Establish the camera on the final assets, then replay exactly for old
      // assets and Low. The player stays at the normal First Light spawn.
      let pose;
      if(label==='after') {
        const candidates=report.bambooSites.map(s=>({...s,river:nearestRiver(s.root[0],s.root[2])}))
          .filter(s=>s.root[1]>-10&&s.root[2]<5&&s.root[2]>-100&&s.river.distance<24)
          .sort((a,b)=>Math.hypot(a.root[0]-p.x,a.root[2]-p.z)-Math.hypot(b.root[0]-p.x,b.root[2]-p.z));
        if(!candidates.length)throw new Error('No streamed stream-bank bamboo visible in First Light; do not claim an integration capture. Sites: '+JSON.stringify(report.bambooSites));
        const chosen=candidates[0], [x,y,z]=chosen.root;
        const height=Math.max(6,chosen.top[1]-y);
        const dx=chosen.river.x-x,dz=chosen.river.z-z,d=Math.hypot(dx,dz)||1;
        pose={position:[x+dx/d*height*1.2-dz/d*height*.6,y+height*.24,z+dz/d*height*1.2+dx/d*height*.6],target:[x,y+height*.43,z]};
        await writeFile(`${evidence}/world-pose.json`,JSON.stringify({pose,chosen,player:p},null,2)+'\n');
      } else pose=JSON.parse(await readFile(`${evidence}/world-pose.json`,'utf8')).pose;
      console.info('First Light: fixed stream-bank pose',pose);
      await world.evaluate((e,pose)=>e.dispatchEvent(new CustomEvent('tqa:postcard',{detail:pose})),pose);
      await page.waitForTimeout(18000);
      report.poses.push(pose);report.reportedQuality=await world.getAttribute('data-world-quality');
      await page.screenshot({path:`${evidence}/world-${label}-${report.quality}.png`});
      report.timing=await page.evaluate(()=>window.__bambooTiming);
      report.timeToPlayableMs=report.timing.playable-report.timing.clicked;
      const cpu=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
      const a=await cpu();
      await page.evaluate(()=>{window.__bambooFrames=[];});
      report.render=await page.evaluate(async()=>{
        const renderer=window.__bambooRenderers[0];
        await new Promise(done=>setTimeout(done,5000));
        const frames=window.__bambooFrames;
        const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
        return {frames:frames.length,fps:1000/(frames.reduce((s,f)=>s+f.ms,0)/frames.length),drawCalls:frames.reduce((s,f)=>s+f.calls,0)/frames.length,triangles:frames.reduce((s,f)=>s+f.triangles,0)/frames.length,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable'};
      });
      const b=await cpu();report.cpuTaskMsPerSecond=(b.TaskDuration-a.TaskDuration)*1000/(b.Timestamp-a.Timestamp);
      throw stop;
    },
  }});
} catch(error){if(error!==stop){report.errors.push(error.message);process.exitCode=1;}}
finally {await new Promise(done=>server.close(done));}
await writeFile(`${evidence}/world-${label}-metrics.json`,JSON.stringify(report,null,2)+'\n');
console.info(JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
