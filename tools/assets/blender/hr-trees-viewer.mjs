import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

T.Cache.enabled=true;
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(1600,1000); renderer.setPixelRatio(1);
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
document.body.style.cssText='margin:0;background:#b5c5c2';
document.body.append(renderer.domElement);
const label=document.createElement('div'); label.style.cssText='position:absolute;left:24px;top:20px;font:18px sans-serif;color:#202b22;background:#e5ece0cc;padding:12px'; document.body.append(label);
const ktx=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
const manifest=await(await fetch('/world/lib/manifest.json')).json();
const entries=manifest.assets.filter(a=>a.id.startsWith('hr-tree-'));
const cache=new Map();
async function load(path) {
  if(!cache.has(path)) {
    const gltf=await loader.loadAsync(path);
    // This installed Three version doesn't implement glTF diffuse transmission.
    // Preview the extension with a thin-leaf backlighting approximation. HR-TREE2
    // must preserve the extension and install its equivalent sun/wind shader.
    gltf.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!m.name.includes('leaf-cutout'))continue;
      m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        #if NUM_DIR_LIGHTS > 0
          float hrBackLight=pow(clamp(dot(-normal,directionalLights[0].direction)*.5+.5,0.,1.),2.);
          outgoingLight+=diffuseColor.rgb*directionalLights[0].color*hrBackLight*.32;
        #endif
        #include <opaque_fragment>`);};
      m.customProgramCacheKey=()=> 'hr-thin-leaf-preview-v1';
    }});
    cache.set(path,gltf);
  }
  return cache.get(path);
}
const scene=new T.Scene(); scene.background=new T.Color('#aabfbc'); scene.fog=new T.Fog('#aabfbc',60,160);
scene.add(new T.HemisphereLight('#d4e4ec','#343e25',2.2));
const sun=new T.DirectionalLight('#ffefd6',3.7); sun.position.set(-18,32,20); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:.5,far:100}); sun.shadow.bias=-.0002; scene.add(sun);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#626e42',roughness:1})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const camera=new T.PerspectiveCamera(36,1.6,.05,250);
let subject=null;
function replace(obj) { if(subject)scene.remove(subject); subject=obj.clone(true); subject.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}}); scene.add(subject); }
function fit(box) {
  const center=box.getCenter(new T.Vector3()), size=box.getSize(new T.Vector3());
  const distance=Math.max(size.y,size.x/1.6)*1.95;
  camera.position.copy(center).add(new T.Vector3(distance*.42,distance*.10,distance)); camera.lookAt(center);
  return {center:center.toArray(),size:size.toArray(),camera:camera.position.toArray()};
}
async function single(id,level=0,before=false) {
  const entry=entries.find(e=>e.id===id);
  const actual=(await load(entry.lods[0].path)).scene;
  const bounds=new T.Box3().setFromObject(actual);
  const path=before ? '/world/lib/tree-broadleaf-1-lod0.glb' : level===2 ? entry.impostor.path : entry.lods[level].path;
  replace((await load(path)).scene);
  if(level===2)subject.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  if(before) {
    const b=new T.Box3().setFromObject(subject), s=b.getSize(new T.Vector3());
    const height=bounds.getSize(new T.Vector3()).y;
    subject.scale.multiplyScalar(height/s.y);
    const c=b.getCenter(new T.Vector3()).multiplyScalar(height/s.y);
    subject.position.sub(c).add(bounds.getCenter(new T.Vector3()));
  }
  const view=fit(bounds); floor.visible=true; scene.background=new T.Color('#aabfbc'); scene.fog=new T.Fog('#aabfbc',60,160); label.style.display='block';
  label.textContent=`${before?'BEFORE — existing broadleaf':(id.includes('bamboo')?'HR-TREE1b — ':'HR-TREE1 — ')+id} · ${level===2?'impostor':'LOD'+level}`;
  renderer.render(scene,camera);
  return {...view,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls};
}
async function bake(id) {
  const entry=entries.find(e=>e.id===id); replace((await load(entry.lods[0].path)).scene);
  const bounds=new T.Box3().setFromObject(subject),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  // One square orthographic frame for all azimuths: no clipping when turning.
  const frame=Math.max(size.y,Math.hypot(size.x,size.z))*1.12;
  const ortho=new T.OrthographicCamera(-frame/2,frame/2,frame/2,-frame/2,.1,250);
  const target=new T.WebGLRenderTarget(2048,2048,{format:T.RGBAFormat,type:T.UnsignedByteType});
  target.texture.colorSpace=T.SRGBColorSpace;
  floor.visible=false;scene.background=null;scene.fog=null;
  for(let view=0;view<4;view++) {
    const angle=view*Math.PI/2; ortho.position.copy(center).add(new T.Vector3(Math.sin(angle)*60,0,Math.cos(angle)*60));ortho.lookAt(center);
    const x=view%2*1024,y=Math.floor(view/2)*1024;
    // Three restores a render target's own viewport during render. Configure
    // the target, rather than only the default canvas viewport/scissor.
    target.viewport.set(x,y,1024,1024);target.scissor.set(x,y,1024,1024);target.scissorTest=true;
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,ortho);
  }
  const rgba=new Uint8Array(2048*2048*4);renderer.readRenderTargetPixels(target,0,0,2048,2048,rgba);
  renderer.setScissorTest(false);renderer.setRenderTarget(null);renderer.setViewport(0,0,1600,1000);target.dispose();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const ctx=canvas.getContext('2d');
  const flipped=new Uint8ClampedArray(rgba.length);for(let y=0;y<2048;y++)flipped.set(rgba.subarray(y*8192,(y+1)*8192),(2047-y)*8192);
  let borderAlpha=0;
  for(let i=0;i<2048;i++)for(const line of [1023,1024]){
    borderAlpha+=rgba[(i*2048+line)*4+3]>20?1:0;
    borderAlpha+=rgba[(line*2048+i)*4+3]>20?1:0;
  }
  if(borderAlpha)throw new Error('Impostor views cross tile borders: viewport/scissor or framing error');
  const tilePixels=[];
  for(let view=0;view<4;view++){
    let count=0;for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)if(rgba[((Math.floor(view/2)*1024+y)*2048+view%2*1024+x)*4+3]>20)count++;
    if(count<1000)throw new Error('Empty impostor view '+view);
    tilePixels.push(count);
  }
  ctx.putImageData(new ImageData(flipped,2048,2048),0,0);
  return {png:canvas.toDataURL('image/png').split(',')[1],frame,center:center.toArray(),tilePixels,borderAlpha,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
}
async function sample() {
  const times=[];let previous=performance.now(),start=previous;
  while(performance.now()-start<2500){await new Promise(requestAnimationFrame);renderer.render(scene,camera);const now=performance.now();times.push(now-previous);previous=now;}
  return {elapsedSeconds:(previous-start)/1000,fps:times.length/((previous-start)/1000),frameMs:times.reduce((a,b)=>a+b,0)/times.length,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls};
}
window.__hr={entries,single,bake,sample,load};
