import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedMesh, Mesh, MeshStandardMaterial, RepeatWrapping, type WebGLRenderer } from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { bakedPropQuality } from "./batched";
import { acquireHrProp, bindHrProps } from "./hr-props";
import { Vector3 } from "three";
import { usesSoftwareRasterizer } from "../foliage/hr-capabilities";
import { bindTimberUv, timberSurfaceGeometry } from "./timber-surface";
import { bindAuthoredDetail } from "./authored-detail";
import { bindFasteners, timberFastenerGeometry } from "./fasteners";
import { bindSetpieces } from "../zones/setpiece-hr";

/** Keep the authored solid and every walking/contact face. Only the render copy
 * gains crease normals and photographic base/normal/roughness atlas samples.
 * No collision mesh, group transform or interaction anchor is modified.
 */
export function hrStructureGeometry(source: BufferGeometry, wood: boolean) {
  const geometry = toCreasedNormals(source, wood ? 0.45 : 0.8);
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal"), uv: number[] = [], tangents: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), face = new Vector3(), edge = new Vector3();
  const normal = new Vector3(), tangent = new Vector3(), bitangent = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    face.crossVectors(edge.subVectors(b, a), bitangent.subVectors(c, a));
    const x = Math.abs(face.x), y = Math.abs(face.y), z = Math.abs(face.z);
    const uAxis = x > y && x > z ? "z" : "x", vAxis = y > x && y > z ? "z" : "y";
    const vertices = [a, b, c], us = vertices.map(v => v[uAxis]), vs = vertices.map(v => v[vAxis]);
    const minU = Math.min(...us), minV = Math.min(...vs);
    // One projection per face. Wrapping individual vertices or choosing axes
    // from smoothed vertex normals collapses UV triangles and normal tangents.
    // Fit each face inside its atlas tile without crossing a gutter.
    const repeat = Math.min(wood ? 0.65 : 0.45, 0.98 / Math.max(1, Math.max(...us) - minU, Math.max(...vs) - minV));
    const offsetU = ((minU * repeat % 1 + 1) % 1) * (0.98 - (Math.max(...us) - minU) * repeat);
    const offsetV = ((minV * repeat % 1 + 1) % 1) * (0.98 - (Math.max(...vs) - minV) * repeat);
    for (let j = 0; j < 3; j++) {
      uv.push((wood ? 0.5 : 0) + 0.006 + (offsetU + (us[j]! - minU) * repeat) * 0.488,
        0.006 + (offsetV + (vs[j]! - minV) * repeat) * 0.488);
      normal.fromBufferAttribute(n, i + j);
      tangent.set(uAxis === "x" ? 1 : 0, 0, uAxis === "z" ? 1 : 0).addScaledVector(normal, -normal[uAxis]);
      if (tangent.lengthSq() < 1e-10) tangent.crossVectors(normal, Math.abs(normal.y) < 0.9 ? b.set(0, 1, 0) : b.set(1, 0, 0));
      tangent.normalize(); bitangent.crossVectors(normal, tangent);
      tangents.push(tangent.x, tangent.y, tangent.z, bitangent[vAxis] < 0 ? -1 : 1);
    }
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("tangent", new Float32BufferAttribute(tangents, 4));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function bindHrStructure(mesh: Mesh, wood: boolean, coating = false, grain?: "x" | "y" | "z") {
  const sawn=wood && (/^(first-light-wood|weathered-trail-timber|workshop-wood|workshop-roof|bridge-transverse-timbers|bridge-posts-and-bowed-handrails)$/.test(mesh.name) || mesh.userData.kind === "signpost" || mesh.userData.kind === "desk");
  const moss=mesh.name === "bridge-edge-moss";
  const roofMoss=mesh.name === "workshop-moss";
  const before = mesh.onBeforeRender;
  const copies = new Map<BufferGeometry, BufferGeometry>();
  const attached: (()=>void)[]=[];
  let discovered=false;
  let detail: MeshStandardMaterial | undefined;
  const empty = new BufferGeometry();
  const render = mesh instanceof InstancedMesh ? new InstancedMesh(empty, mesh.material, mesh.count) : new Mesh(empty, mesh.material);
  if (render instanceof InstancedMesh && mesh instanceof InstancedMesh) {
    render.instanceMatrix = mesh.instanceMatrix;
    // Timber has its own calibrated albedo; retain subtle plank-to-plank ageing.
    for (let i = 0; i < mesh.count; i++) render.setColorAt(i, new Color().setScalar(.87 + Math.sin(i*17.13)*.08));
  }
  render.name = "hr-structural-render"; render.visible = false; render.raycast = () => {};
  let lease: ReturnType<typeof acquireHrProp> | undefined, disposed = false;
  mesh.onBeforeRender = function (renderer, scene, camera, ...args) {
    before.call(this, renderer, scene, camera, ...args);
    const source = mesh.geometry;
    if (!discovered && mesh.parent && /^(workshop-wood|first-light-wood|weathered-trail-timber)$/.test(mesh.name)) {
      discovered=true;
      attached.push(bindFasteners(mesh,timberFastenerGeometry(source)));
      if(mesh.name === "workshop-wood") {
        const roof=mesh.parent.getObjectByName("workshop-roof");
        if(roof instanceof Mesh) attached.push(bindHrStructure(roof,true));
        const growth=mesh.parent.getObjectByName("workshop-moss");
        if(growth instanceof Mesh) attached.push(bindHrStructure(growth,false));
      }
    }
    const high = bakedPropQuality(mesh) === "High" && !usesSoftwareRasterizer(renderer);
    if (high && !lease && renderer.domElement?.closest('[data-world-build="done"][data-world-intro="done"][data-world-paused="false"]')) {
      lease = acquireHrProp(renderer, moss || roofMoss ? "hr-rock-moss-river" : coating ? "hr-prop-coastal-coating" : sawn ? "hr-prop-sawn-timber" : wood ? "hr-prop-log-moss" : "hr-rock-river");
      void lease.ready.then(asset => {
        if (disposed) return;
        detail = (asset.lods[0]![0]!.material as MeshStandardMaterial).clone();
        detail.vertexColors = coating; detail.color.setScalar(coating ? 1.08 : sawn ? .96 : mesh.userData.milestonesSurface === "future" ? 1 : .88);
        if(sawn || coating) bindTimberUv(detail,coating);
        if(mesh.name === "workshop-roof") {
          const compile=detail.onBeforeCompile;
          detail.onBeforeCompile=(shader,renderer)=>{
            compile(shader,renderer);
            shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
#ifdef USE_MAP
float joint=fract(vMapUv.x*.5/.18);
diffuseColor.rgb*=.64+.36*smoothstep(.006,.024,min(joint,1.0-joint));
#endif`);
          };
          detail.customProgramCacheKey=()=>"sawn-roof-boards-v1";
        }
        if(sawn) {detail.emissiveMap=detail.map;detail.emissive.setScalar(.065);}
        if(moss) {
          detail.side=DoubleSide;detail.forceSinglePass=true;detail.roughness=1;
          detail.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
vec2 hrMossUv=(vMapUv-vec2(.506))/.488;
float edge=min(min(hrMossUv.x,1.0-hrMossUv.x),min(hrMossUv.y,1.0-hrMossUv.y));
float fleck=sin(hrMossUv.x*113.0+sin(hrMossUv.y*19.0))*sin(hrMossUv.y*83.0);
if(edge < .065+fleck*.11 || fleck > .79) discard;`);};
          detail.customProgramCacheKey=()=>"bridge-photographic-broken-moss-v1";
        }
        if(roofMoss){detail.color.setRGB(.73,.86,.61);detail.roughness=1;}
        for (const map of [detail.map, detail.normalMap, detail.roughnessMap, detail.metalnessMap]) if (map) {
          map.wrapS = map.wrapT = RepeatWrapping; map.anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy() ?? 1); map.needsUpdate = true;
        }
        detail.name = wood ? "hr-structural-wood" : "hr-structural-stone";
        // The contact solid still owns depth/shadows/interactions. A separate
        // render child keeps each normal-mapped material paired with its UVs
        // and tangents even when a deferred controller replaces the solid.
        // Swapping geometry/material inside onBeforeRender is too late for
        // Three's captured render item and can poison an HDR frame with NaNs.
        detail.polygonOffset = true; detail.polygonOffsetFactor = -1; detail.polygonOffsetUnits = -1;
      }).catch(error => { mesh.userData.hrStructureError = String(error); });
    }
    if (high && detail && source.getAttribute("position")?.count) {
      let geometry = copies.get(source);
      if (!geometry) {
        geometry = sawn || coating ? timberSurfaceGeometry(source, grain) : hrStructureGeometry(source, wood);
        if(moss) {
          const p=geometry.getAttribute("position"),uv=geometry.getAttribute("uv");
          for(let i=0;i<p.count;i++)uv.setXY(i,.506+(p.getX(i)+.5)*.488,.506+(p.getZ(i)+.5)*.488);
        }
        if(roofMoss) {
          const uv=geometry.getAttribute("uv");
          for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)+.5,uv.getY(i)+.5);
        }
        copies.set(source, geometry);
      }
      geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
      render.geometry = geometry; render.material = detail; render.receiveShadow = mesh.receiveShadow;
      render.castShadow = false;
      if (render instanceof InstancedMesh && mesh instanceof InstancedMesh) {
        render.count = mesh.count; render.boundingBox = mesh.boundingBox; render.boundingSphere = mesh.boundingSphere;
      }
      if (!render.parent) mesh.add(render);
      render.visible = true;
    } else render.visible = false;
    if((moss || roofMoss) && !Array.isArray(mesh.material)){mesh.material.colorWrite=!render.visible;mesh.material.depthWrite=!render.visible;}
  };
  return () => {
    if (disposed) return; disposed = true;
    attached.reverse().forEach(release=>release());
    mesh.onBeforeRender = before; render.removeFromParent(); empty.dispose();
    if((moss || roofMoss) && !Array.isArray(mesh.material)){mesh.material.colorWrite=true;mesh.material.depthWrite=true;}
    if (render instanceof InstancedMesh) render.dispose();
    copies.forEach(geometry => geometry.dispose()); copies.clear(); detail?.dispose(); lease?.release();
  };
}

/** HR-SETPIECE-B: the Quiet Shore shelter as joinery, not boxes. The zone records the vertex
 * ranges of its "porch" prop in every pigment batch; the authored frame, board deck, corrugated
 * roof and landing replace exactly those ranges. Colliders, the piano target and Low are untouched.
 */
export function bindQuietShoreShelter(anchor: Mesh, load?: import("../zones/setpiece-hr").SetpieceLoader) {
  const zone = anchor.parent, porch = zone?.getObjectByName("porch"), piano = zone?.getObjectByName("piano");
  const batches = porch?.userData.batches as { mesh: string; start: number; count: number }[] | undefined;
  if (!zone || !porch || !piano || !Array.isArray(batches)) return undefined;
  // The piano stands 0.85 m path-side of the shelter centre, on the deck: that fixes side and floor.
  const side = piano.position.x < porch.position.x ? 1 : -1, floor = piano.position.y;
  const hide: { mesh: Mesh; ranges: { start: number; count: number }[] }[] = [];
  let landing = -Infinity;
  for (const batch of batches) {
    const mesh = zone.getObjectByName(batch.mesh);
    if (!(mesh instanceof Mesh) || mesh === anchor) continue;
    hide.push({ mesh, ranges: [{ start: batch.start, count: batch.count }] });
    const position = mesh.geometry.getAttribute("position");
    if (batch.mesh !== "quiet-shore-wood" || !position || position.count < batch.start + batch.count) continue;
    // The landing is the only shelter timber beyond the path-side posts; the radio and dog rest on its top.
    for (let i = batch.start; i < batch.start + batch.count; i++) {
      if ((position.getX(i) - porch.position.x) * side < -1.45) landing = Math.max(landing, position.getY(i));
    }
  }
  if (!hide.length) return undefined;
  if (!Number.isFinite(landing)) landing = floor - 0.1;
  return bindSetpieces(anchor, {
    file: "porch", hide, load,
    place(asset, add) {
      const shelter = asset.piece("porch");
      shelter.position.set(porch.position.x, floor, porch.position.z); shelter.rotation.y = side < 0 ? Math.PI : 0;
      const step = asset.piece("stepdeck");
      step.position.set(porch.position.x - side * 1.76, landing, porch.position.z); step.rotation.y = shelter.rotation.y;
      add(shelter, zone); add(step, zone);
    },
  });
}

/** Dressing is the zone-owned lifecycle anchor. Discover once after assembly,
 * before streaming; Roots is explicitly excluded from this ticket's rollout.
 */
export function bindHrZoneStructures(anchor: Mesh) {
  const after = anchor.onAfterRender, releases: (() => void)[] = [];
  let started = false, disposed = false;
  let groveBound=false;
  anchor.onAfterRender = function (renderer: WebGLRenderer, ...args) {
    after.call(this, renderer, ...args);
    if(!disposed && !groveBound && anchor.parent?.name === "first-light-clearing"
      && bakedPropQuality(anchor)==="High" && renderer?.domElement && !usesSoftwareRasterizer(renderer)) {
      const grove=anchor.parent.parent?.getObjectByName("first-light-authored-understorey");
      // Ground is generated in the existing deferred queue. Its final geometry
      // must exist before extracting the authored shrub envelopes once.
      if(grove instanceof Mesh && grove.visible && grove.geometry.getAttribute("position")?.count) {
        groveBound=true;releases.push(bindAuthoredDetail(grove,"understorey"));
      }
    }
    if (started || disposed || !anchor.parent || !/^(first-light-clearing|milestones-hillside|old-trail|horizon-overlook|quiet-shore|last-postcard)$/.test(anchor.parent.name)) return;
    started = true;
    if (anchor.parent.name === "quiet-shore") { const release = bindQuietShoreShelter(anchor); if (release) releases.push(release); }
    anchor.parent.traverse(object => {
      if (!(object instanceof Mesh) || object === anchor) return;
      const wood = object.userData.photoSurface === "bark" || /^(first-light-wood|quiet-shore-wood|last-postcard-wood|weathered-trail-timber)$/.test(object.name);
      const stone = object.name === "rock-stack-stones" || /^(first-light-stone|last-postcard-stone)$/.test(object.name);
      if (wood || stone || object.name === "horizon-natural") releases.push(bindHrStructure(object, wood || object.name === "horizon-natural"));
      if (object.name === "first-light-wood") releases.push(bindAuthoredDetail(object,"wood"));
      if (object.name === "first-light-stone") releases.push(bindAuthoredDetail(object,"stone"));
      if (object.name === "first-light-green") releases.push(bindAuthoredDetail(object,"green"));
      if (object.name === "moss-washes") releases.push(bindAuthoredDetail(object,"moss"));
      if (object.name === "storm-lantern-frame") {
        object.geometry.computeBoundingBox();
        const bounds=object.geometry.boundingBox!,size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
        const controller=bindHrProps(object,[{asset:"hr-prop-storm-lantern",x:center.x,z:center.z,baseY:bounds.min.y,size:[size.x,size.y,size.z],yaw:0,tint:1}],()=>0);
        const previous=object.onAfterRender;
        const siblings=object.parent!.children.filter(child=>child.name === "storm-lantern-warm-core" || child.name === "storm-lantern-flower-wick");
        object.onAfterRender=function(...args) {
          previous.apply(this,args);
          const streamed=object.getObjectByName("hr-props-streamed");
          siblings.forEach(child=>{child.visible=!streamed?.visible;});
        };
        releases.push(()=>{object.onAfterRender=previous;siblings.forEach(child=>{child.visible=true;});controller.dispose();});
      }
      if (object.name === "old-trail-r1-tree") {
        object.geometry.computeBoundingBox();
        const bounds = object.geometry.boundingBox!, size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
        releases.push(bindHrProps(object, [{ asset: "hr-tree-spreading-crown", x: center.x, z: center.z, baseY: bounds.min.y,
          size: [size.x, size.y, size.z], yaw: 0, tint: 1 }], () => 0).dispose);
      }
    });
  };
  return () => { if (disposed) return; disposed = true; anchor.onAfterRender = after; releases.reverse().forEach(release => release()); };
}
