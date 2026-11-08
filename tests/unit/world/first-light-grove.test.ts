import { describe, expect, it } from 'vitest';
import { createFirstLightGrove, createFirstLightTree, firstLightCameraPitch, firstLightGroveWeight, inFirstLightGrove } from '../../../src/features/world/foliage/first-light-grove';
import { surfaceHeight } from '../../../src/features/world/scene/compose';
import { ZONES } from '../../../src/features/world/layout/zones';
import { nearestPath, nearestRiver } from '../../../src/features/world/terrain/samples';
import { ShaderLib, Texture, type Mesh, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { createRampMaterial, RAMP_STEPS } from '../../../src/features/world/materials/ramp';
import { bindFirstLightGround } from '../../../src/features/world/foliage/first-light-grove';
import { attachTerrainDetail } from '../../../src/features/world/terrain/detail';
import { createFarLandscape } from '../../../src/features/world/scene/far-landscape';

describe('FirstLight bounded woodland prototype',()=>{
 it('keeps geometry faceted, deterministic and under tree budget',()=>{
  const gs=[0,1,2].map(createFirstLightTree);
  expect(new Set(gs.map(g=>Array.from(g.getAttribute('position').array).slice(0,30).join(','))).size).toBe(3);
  for(const g of gs){expect(g.getAttribute('position').count/3).toBeLessThanOrEqual(1200);expect(g.index).toBeNull();g.dispose();}
 });
 it('builds a bounded grove with dry clear trunks and stable collision across quality',()=>{
  const grove=createFirstLightGrove(surfaceHeight,[]);
  console.log('FL01',grove.sites.length,'trees',grove.meshes.reduce((n,m)=>n+m.count*m.geometry.getAttribute('position').count/3,0),'triangles', 'draws',grove.group.children.length);
  expect(grove.sites.length).toBeGreaterThan(20);
  expect(grove.group.children).toHaveLength(4);
  for(const s of grove.sites){expect(inFirstLightGrove(s.x,s.z)).toBe(true);expect(nearestPath(s.x,s.z).distance).toBeGreaterThanOrEqual(6.8);expect(nearestRiver(s.x,s.z).distance).toBeGreaterThanOrEqual(7);}
  const n=grove.trunks.length;grove.setQuality('Low');expect(grove.trunks).toHaveLength(n);grove.setQuality('High');expect(grove.trunks).toHaveLength(n);grove.dispose();grove.dispose();
 });
 it('returns exact old camera and zero treatment outside the clearing',()=>{
  const a=ZONES[0]!.position;
  expect(firstLightCameraPitch(a.x,a.z,Math.PI/6)).toBeCloseTo(Math.PI/10);
  expect(firstLightCameraPitch(a.x+48,a.z,Math.PI/6)).toBe(Math.PI/6);
  expect(firstLightGroveWeight(a.x+100,a.z)).toBe(0);
  expect(firstLightGroveWeight(a.x+30,a.z)).toBeGreaterThan(0);
  expect(firstLightGroveWeight(a.x+30,a.z)).toBeLessThan(1);
 });
 it('preserves local palette and clean normal/light through the later texture hook and quality changes',()=>{
  const material=createRampMaterial(0xffffff,RAMP_STEPS.terrain);
  bindFirstLightGround(material);
  const textures=Array.from({length:5},()=>new Texture());
  const detail=attachTerrainDetail(material,textures);
  for(const quality of ['Low','Balanced','High'] as const){
   detail.setQuality(quality);
   const shader={...ShaderLib.toon,uniforms:{}} as WebGLProgramParametersWithUniforms;
   material.onBeforeCompile(shader,{} as WebGLRenderer);
   const f=shader.fragmentShader;
   expect(f).toContain('firstLightPigment');
   // terrainDetail is vec3: mixing it with a scalar silently broke GPU compilation in an early prototype.
   expect(f).toContain('mix(terrainDetail(diffuseColor.rgb), vec3(1.0), firstLightMask * 0.8)');
   expect(f).not.toContain('mix(terrainDetail(diffuseColor.rgb), 1.0,');
   expect(shader.uniforms.firstLightOrigin).toBeDefined();
   if(quality!=='Low'){
    expect(f.indexOf('groundRelief')).toBeLessThan(f.indexOf('normal = mix(normal, normalize(vNormal), firstLightMask'));
    expect(f.indexOf('vec3 firstLightClean = outgoingLight')).toBeLessThan(f.indexOf('outgoingLight *= groundDetail(vColor.rgb)'));
   }
  }
  detail.dispose();textures.forEach(t=>t.dispose());material.dispose();
 });
 it('suppresses only the remote backdrop in the local view without distorting playable terrain',()=>{
  const far=createFarLandscape();
  try {
   const shader={...ShaderLib.toon,uniforms:{}} as WebGLProgramParametersWithUniforms;
   far.mesh.material.onBeforeCompile(shader,{} as WebGLRenderer);
   expect(shader.uniforms.firstLightView!.value).toBe(0);
   far.setFirstLightView(1);expect(shader.uniforms.firstLightView!.value).toBe(1);
   far.setFirstLightView(0);expect(shader.uniforms.firstLightView!.value).toBe(0);
   expect(shader.vertexShader).not.toContain('transformed.y = mix');
   expect(shader.fragmentShader).toContain('if (firstLightDither < firstLightView) discard');
   expect(far.mesh.geometry.getAttribute('farCrownFlag')).toBeUndefined();
  } finally {far.dispose();}

 });
});

it('defers understorey with exact geometry parity and cancels partial work',()=>{
 const full=createFirstLightGrove(surfaceHeight,[]), deferred=createFirstLightGrove(surfaceHeight,[],true);
 const ground=(grove:typeof full)=>grove.group.getObjectByName('first-light-authored-understorey') as Mesh;
 try {
  expect(deferred.sites).toEqual(full.sites);
  expect(ground(deferred).visible).toBe(false);
  let steps=0;while(!deferred.buildGround.next().done) expect(++steps).toBeLessThan(100);
  expect(steps).toBeGreaterThan(1);expect(ground(deferred).visible).toBe(true);
  for(const attribute of ['position','normal','color']) expect(Array.from(ground(deferred).geometry.getAttribute(attribute).array)).toEqual(Array.from(ground(full).geometry.getAttribute(attribute).array));
 }finally{full.dispose();deferred.dispose();}
 const cancelled=createFirstLightGrove(surfaceHeight,[],true);
 for(let i=0;i<10;i++)cancelled.buildGround.next();
 cancelled.dispose();expect(cancelled.buildGround.next().done).toBe(true);expect(cancelled.group.children).toHaveLength(0);
});
