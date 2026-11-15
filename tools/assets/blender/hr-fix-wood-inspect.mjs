import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hooks=registerHooks({
  resolve(s,c,next){if(s.startsWith('.')&&c.parentURL?.includes('/src/')){
    const f=fileURLToPath(new URL(s,c.parentURL));for(const name of [f+'.ts',f+'/index.ts'])if(existsSync(name))return{url:pathToFileURL(name).href,shortCircuit:true};
  }return next(s,c);},
  load(url,c,next){if(url.endsWith('.ts')&&url.includes('/src/'))return{format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};
    if(url.endsWith('.json')&&url.includes('/src/'))return{format:'module',source:'export default '+readFileSync(fileURLToPath(url),'utf8'),shortCircuit:true};return next(url,c);}
});
try{
  const [{placeZoneScenes},{surfaceHeight},{surfaceComponents}]=await Promise.all(['zones/index.ts','terrain/height.ts','props/timber-surface.ts'].map(f=>import(pathToFileURL(root+'src/features/world/'+f))));
  const zones=placeZoneScenes(surfaceHeight);
  try{
    for(const zone of zones.filter(z=>['first-light','workshop','old-trail'].includes(z.zoneId))){
      console.log(zone.zoneId,zone.group.position.toArray());
      zone.group.updateMatrixWorld(true);
      if(zone.zoneId==='first-light')console.log('green low wide',surfaceComponents(zone.group.getObjectByName('first-light-green').geometry).filter(c=>c.bounds.max.y<3&&Math.max(c.bounds.max.x-c.bounds.min.x,c.bounds.max.z-c.bounds.min.z)>.25).map(c=>({vertices:c.vertices.length,min:c.bounds.min.toArray(),max:c.bounds.max.toArray()})));
      for(const name of ['first-light-green','first-light-wood','moss-washes']){
        const mesh=zone.group.getObjectByName(name);if(!mesh)continue;
        console.log(name,surfaceComponents(mesh.geometry).filter(c=>c.vertices.length>=60).map(c=>({vertices:c.vertices.length,min:c.bounds.min.toArray(),max:c.bounds.max.toArray()})));
      }
    }
  }finally{zones.forEach(z=>z.dispose());}
}finally{hooks.deregister();}
