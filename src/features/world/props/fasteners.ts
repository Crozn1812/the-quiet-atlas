import { BufferGeometry, CylinderGeometry, InstancedMesh, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { surfaceComponents } from "./timber-surface";
import { bakedPropQuality } from "./batched";
import { usesSoftwareRasterizer } from "../foliage/hr-capabilities";

/** Static joinery shares its parent's instance transforms; one High-only draw. */
export function bindFasteners(owner: Mesh, geometry: BufferGeometry) {
  const material = new MeshStandardMaterial({color:0x5f645a,metalness:.74,roughness:.59});
  const detail = owner instanceof InstancedMesh ? new InstancedMesh(geometry,material,owner.count) : new Mesh(geometry,material);
  if (detail instanceof InstancedMesh && owner instanceof InstancedMesh) {
    detail.instanceMatrix=owner.instanceMatrix;detail.boundingBox=owner.boundingBox;detail.boundingSphere=owner.boundingSphere;
  }
  detail.name="weathered-fasteners";detail.raycast=()=>{};detail.visible=false;detail.receiveShadow=true;
  const before=owner.onBeforeRender;
  owner.onBeforeRender=function(renderer,...args) {
    before.call(this,renderer,...args);
    detail.visible=bakedPropQuality(owner)==="High" && !usesSoftwareRasterizer(renderer);
    if(detail.visible && !detail.parent)owner.add(detail);
  };
  let disposed=false;
  return ()=>{
    if(disposed)return;disposed=true;owner.onBeforeRender=before;detail.removeFromParent();
    if(detail instanceof InstancedMesh)detail.dispose();geometry.dispose();material.dispose();
  };
}

export function timberFastenerGeometry(source: BufferGeometry) {
  const flat=source.index?source.toNonIndexed():source, parts:BufferGeometry[]=[],size=new Vector3(),center=new Vector3();
  for(const component of surfaceComponents(flat)) {
    component.bounds.getSize(size);component.bounds.getCenter(center);
    const horizontal=size.x>1.2 && size.y<.6, vertical=size.y>1.2 && size.x<.7;
    if(!horizontal && !vertical)continue;
    for(const side of [-1,1])parts.push(new CylinderGeometry(.018,.02,.008,12).rotateX(Math.PI/2)
      .translate(center.x+(horizontal?side*(size.x/2-.11):0),center.y+(vertical?side*(size.y/2-.2):0),component.bounds.max.z+.003));
  }
  if(flat!==source)flat.dispose();
  const geometry=parts.length?mergeGeometries(parts)!:new BufferGeometry();parts.forEach(p=>p.dispose());return geometry;
}
