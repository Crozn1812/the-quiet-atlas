import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {BoxGeometry, Mesh, MeshStandardMaterial, Vector3} from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import {expect,it,vi} from "vitest";
import {NodeIO} from "@gltf-transform/core";
import {ALL_EXTENSIONS} from "@gltf-transform/extensions";
import {MeshoptDecoder} from "meshoptimizer";
import {timberSurfaceGeometry} from "../../../src/features/world/props/timber-surface";
import {bindAuthoredDetail} from "../../../src/features/world/props/authored-detail";
import {createFern} from "../../../src/features/world/foliage/ground";
import {setBakedPropQuality} from "../../../src/features/world/props/batched";

it("keeps longitudinal grain and metre density continuous across sawn triangles and separate solids",()=>{
  const first=new BoxGeometry(3,.12,.4).toNonIndexed(),second=new BoxGeometry(.2,2,.2).toNonIndexed().translate(5,1,0);
  const merged=mergeGeometries([first,second])!,before=merged.getAttribute("position").array.slice();
  const detailed=timberSurfaceGeometry(merged),p=detailed.getAttribute("position"),uv=detailed.getAttribute("uv"),n=detailed.getAttribute("normal"),t=detailed.getAttribute("tangent");
  expect(detailed.getAttribute("position").array).toEqual(before);
  const shared=new Map<string,[number,number]>();
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].join();
    if(shared.has(key))expect([uv.getX(i),uv.getY(i)]).toEqual(shared.get(key));else shared.set(key,[uv.getX(i),uv.getY(i)]);
    expect(new Vector3().fromBufferAttribute(n,i).dot(new Vector3(t.getX(i),t.getY(i),t.getZ(i)))).toBeCloseTo(0,6);
    if(n.getZ(i)>.99)expect(uv.getY(i)).toBeCloseTo((p.getX(i)<3?p.getX(i):p.getY(i))/2,6);
  }
  for(let i=0;i<p.count;i+=3){
    const area=(uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getX(i+2)-uv.getX(i))*(uv.getY(i+1)-uv.getY(i));
    expect(Math.abs(area)).toBeGreaterThan(1e-8);
  }
  first.dispose();second.dispose();merged.dispose();detailed.dispose();
});

it("recognises unnamed authored fern topology while preserving Low geometry and teardown ownership",()=>{
  const geometry=createFern().toNonIndexed(),material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);
  const before=geometry.getAttribute("position").array.slice(),release=bindAuthoredDetail(mesh,"green");
  const dispose=vi.spyOn(geometry,"dispose");
  setBakedPropQuality(mesh,"Low");expect(mesh.geometry).toBe(geometry);
  expect(geometry.getAttribute("position").array).toEqual(before);
  release();release();expect(mesh.geometry).toBe(geometry);expect(dispose).not.toHaveBeenCalled();
  geometry.dispose();material.dispose();
});

it("ships ticket-owned meshopt LODs and licensed shared 2K PBR bakes with exact hashes",async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"meshopt.decoder":MeshoptDecoder});
  const manifest=JSON.parse(await readFile("public/world/lib/manifest.json","utf8"));
  const licenses=(await readFile("assets/LICENSES.csv","utf8")).split("\n");
  for(const id of ["hr-prop-sawn-timber","hr-prop-coastal-coating","hr-prop-storm-lantern"]){
    const entry=manifest.assets.find((a:{id:string})=>a.id===id);expect(entry.license).toBe("CC0-1.0");expect(entry.delivery).toBe("deferred-after-play");
    expect(entry.lods[1].triangles).toBeLessThan(entry.lods[0].triangles);
    for(const lod of entry.lods){
      const file=`public${lod.path}`,bytes=await readFile(file);
      expect(bytes.length).toBe(lod.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(lod.sha256);
      expect(licenses.filter(row=>row.startsWith(file+","))).toHaveLength(1);
      const doc=await io.read(file);expect(doc.getRoot().listExtensionsRequired().map(e=>e.extensionName)).toContain("EXT_meshopt_compression");
      for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())expect(Array.from(primitive.getAttribute("POSITION")!.getArray()!).every(Number.isFinite)).toBe(true);
      for(const texture of lod.sharedTextures){
        const file=`public${texture.path}`,bytes=await readFile(file),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        expect([view.getUint32(20,true),view.getUint32(24,true)]).toEqual([2048,2048]);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(texture.sha256);
        expect(licenses.filter(row=>row.startsWith(file+","))).toHaveLength(1);
      }
    }
  }
},15000);
