import { Box3, BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from "three";
import { bindHrProps, type HrPropSite } from "./hr-props";
import { surfaceComponents } from "./timber-surface";

/** Replace only closed decorative masses inside an authored batch. Retained
 * timber, flowers, stems and all gameplay/collision objects keep their anchors.
 */
export function bindAuthoredDetail(mesh: Mesh, kind: "wood" | "stone" | "green" | "moss" | "understorey") {
  const original = mesh.geometry, source = original.index ? original.toNonIndexed() : original;
  const removed = new Set<number>(), sites: HrPropSite[] = [];
  const size = new Vector3(), center = new Vector3();
  if(kind === "green") for(const part of (original.userData.parts ?? []) as {name:string;start:number;count:number}[]) {
    if(part.name !== "welcome-fern")continue;
    const bounds=new Box3(),p=source.getAttribute("position"),point=new Vector3();
    for(let i=part.start;i<part.start+part.count;i++){bounds.expandByPoint(point.fromBufferAttribute(p,i));removed.add(i);}
    bounds.getSize(size);bounds.getCenter(center);
    sites.push({asset:"hr-prop-fern-arching",x:center.x,z:center.z,baseY:bounds.min.y,size:[size.x,size.y,size.z],yaw:0,tint:1});
  }
  // The authored five-frond kit also occurs without names beside the greeting.
  // Recognise its topology and shared root, rather than relying on batch offsets.
  if(kind === "green" || kind === "moss") {
    const p=source.getAttribute("position"),a=new Vector3(),b=new Vector3(),root=new Vector3();
    const same=(i:number,j:number)=>a.fromBufferAttribute(p,i).distanceToSquared(b.fromBufferAttribute(p,j))<1e-10;
    for(let start=0;start+120<=p.count;start+=3) {
      if(removed.has(start))continue;
      root.fromBufferAttribute(p,start);
      let fern=true;
      for(let frond=0;frond<5 && fern;frond++) {
        const i=start+frond*24;
        fern=same(i+1,i+3)&&same(i+2,i+5)
          &&a.fromBufferAttribute(p,i).distanceToSquared(root)<.008
          &&a.fromBufferAttribute(p,i).distanceToSquared(b.fromBufferAttribute(p,i+1))<.003;
      }
      if(!fern)continue;
      const bounds=new Box3();
      for(let i=start;i<start+120;i++)bounds.expandByPoint(a.fromBufferAttribute(p,i));
      bounds.getSize(size);bounds.getCenter(center);
      if(size.y<.15 || size.y>1.5 || Math.max(size.x,size.z)>2)continue;
      for(let i=start;i<start+120;i++)removed.add(i);
      sites.push({asset:"hr-prop-fern-arching",x:center.x,z:center.z,baseY:bounds.min.y,size:[size.x,size.y,size.z],yaw:0,tint:1});
      start+=117;
    }
  }
  for (const component of surfaceComponents(source)) {
    if(component.vertices.some(i=>removed.has(i)))continue;
    component.bounds.getSize(size); component.bounds.getCenter(center);
    const width = Math.max(size.x,size.z);
    const selected = kind === "understorey" ? component.vertices.length === 60 && width > .4
      : kind === "wood" ? width > 2 && size.y < 1.5
      : kind === "stone" ? width > .22
        : kind === "green" ? component.vertices.length >= 60 && width > .22 && size.y < 1.5 && component.bounds.max.y < 2.3
          : component.vertices.length <= 120 && width > .15 && size.y < .4;
    if (!selected || Math.min(size.x,size.y,size.z) < .005) continue;
    component.vertices.forEach(i=>removed.add(i));
    sites.push({ asset: kind === "wood" ? "hr-prop-log-moss" : kind === "stone" ? "hr-rock-river"
      : kind === "moss" ? "hr-prop-bush-needle" : kind === "understorey" && size.y < .4 ? "hr-prop-fern-round" : "hr-prop-bush-broadleaf",
    x:center.x,z:center.z,baseY:component.bounds.min.y,size:[size.x,size.y,size.z],yaw:0,tint:1 });
  }
  if (!sites.length) { if (source !== original) source.dispose(); return () => {}; }
  const retained = new BufferGeometry();
  for (const [key,attribute] of Object.entries(source.attributes)) {
    const values:number[]=[];
    for(let i=0;i<attribute.count;i++) if(!removed.has(i)) for(let j=0;j<attribute.itemSize;j++) values.push(attribute.array[i*attribute.itemSize+j]!);
    retained.setAttribute(key,new Float32BufferAttribute(values,attribute.itemSize));
  }
  retained.computeBoundingBox();retained.computeBoundingSphere();
  if (source !== original) source.dispose();
  const controller = bindHrProps(mesh,sites,()=>0,retained,undefined,kind === "understorey" ? {radius:28} : {});
  return controller.dispose;
}
