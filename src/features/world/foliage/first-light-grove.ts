import { Box3, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type MeshToonMaterial } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import { ZONES } from "../layout/zones";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { waterLevelAt } from "../terrain/height";
import type { Quality } from "../terrain";

const anchor = ZONES.find(zone => zone.id === "first-light")!;
export const FIRST_LIGHT_GROVE_RADIUS = 48;
export function firstLightGroveWeight(x: number, z: number) {
  const distance = Math.hypot(x - anchor.position.x, z - anchor.position.z);
  const t = Math.max(0, Math.min(1, (distance - 18) / 30));
  return 1 - t * t * (3 - 2 * t);
}
export function inFirstLightGrove(x: number, z: number) {
  return Math.hypot(x - anchor.position.x, z - anchor.position.z) < FIRST_LIGHT_GROVE_RADIUS;
}

/** Smooth local camera composition: only this clearing gets the lower woodland view. */
export function firstLightCameraPitch(x: number, z: number, fallback: number) {
  const weight = firstLightGroveWeight(x, z);
  return fallback - (fallback - Math.PI / 10) * weight;
}

/** R1 dawn surface, preserving the authored First Light path/seat and terrain water/cliff masks. */
export function bindFirstLightGround(material: MeshToonMaterial) {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.vertexShader = "attribute vec2 forestSurface;\nattribute float hillSurface;\nvarying float vHillSurface;\nvarying vec2 vForestSurface;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvForestSurface = forestSurface;\nvHillSurface = hillSurface;");
    shader.fragmentShader = "varying float vHillSurface;\nvarying vec2 vForestSurface;\n" + shader.fragmentShader;
    shader.uniforms.firstLightOrigin = { value: anchor.position.clone() };
    shader.uniforms.firstLightAxis = { value: new Vector3(anchor.lookDirection.z, 0, -anchor.lookDirection.x) };
    shader.uniforms.firstLightForward = { value: new Vector3(anchor.lookDirection.x, 0, anchor.lookDirection.z) };
    shader.uniforms.firstLightMoss = { value: new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.12).lerp(new Color(PALETTE.mist), 0.08) };
    shader.uniforms.firstLightPath = { value: new Color(PALETTE.sand).lerp(new Color(PALETTE.rock), 0.25) };
    shader.uniforms.hillGrass = { value: new Color(PALETTE.grass).lerp(new Color(PALETTE.grassDry), 0.35).lerp(new Color(PALETTE.cloud), 0.09) };
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", "uniform vec3 firstLightOrigin;\nuniform vec3 firstLightAxis;\nuniform vec3 firstLightForward;\nuniform vec3 firstLightMoss;\nuniform vec3 firstLightPath;\nvoid main() {")
      .replace("#include <color_fragment>", `#include <color_fragment>
float firstLightLocal = 1.0 - smoothstep(18.0, 48.0, distance(terrainWorld.xz, firstLightOrigin.xz));
float firstLightMask = max(firstLightLocal, vForestSurface.x);
vec2 firstLightDelta = terrainWorld.xz - firstLightOrigin.xz;
float firstLightAcross = dot(firstLightDelta, firstLightAxis.xz);
float firstLightAlong = dot(firstLightDelta, firstLightForward.xz);
float firstLightGrass = smoothstep(2.4, 3.1, abs(firstLightAcross));
float firstLightSeat = 1.0 - smoothstep(2.5, 5.0, length(vec2(firstLightAcross - 5.0, firstLightAlong + 4.5)));
firstLightGrass *= 1.0 - firstLightSeat * 0.8;
firstLightGrass = mix(vForestSurface.y, firstLightGrass, firstLightLocal);
vec3 firstLightPigment = mix(firstLightPath, firstLightMoss, firstLightGrass);
diffuseColor.rgb = mix(diffuseColor.rgb, firstLightPigment, firstLightMask * 0.92);
vec3 hillPigment = mix(firstLightPath, hillGrass, vForestSurface.y);
diffuseColor.rgb = mix(diffuseColor.rgb, hillPigment, vHillSurface * 0.85);
firstLightMask = max(firstLightMask, vHillSurface);`);
    shader.fragmentShader = "uniform vec3 hillGrass;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("outgoingLight *= terrainDetail(diffuseColor.rgb);", "outgoingLight *= mix(terrainDetail(diffuseColor.rgb), vec3(1.0), firstLightMask * 0.8);");
    // Texture binding wraps this hook later. These statements stay AFTER its inserted normal code,
    // and preserve the clean light BEFORE its final grain multiplication (also valid on Low).
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = mix(normal, normalize(vNormal), firstLightMask * 0.9);")
      .replace("#include <opaque_fragment>", "vec3 firstLightClean = outgoingLight;\n#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, firstLightClean, firstLightMask * 0.92);");
  };
  material.customProgramCacheKey = () => `${key.call(material)}-forest-hill-r1-surface-v3`;
}

function colored(geometry: BufferGeometry, pigment: Color) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const p = flat.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const facet = 0.94 + 0.08 * Math.sin(Math.floor(i / 3) * 1.73);
    colors.push(pigment.r * facet, pigment.g * facet, pigment.b * facet);
  }
  flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

/** Three hand-composed, faceted silhouettes; no boxes, texture or per-frame work. */
export function createFirstLightTree(variant: number) {
  const parts: BufferGeometry[] = [];
  const bark = new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), 0.16);
  const leaf = new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.22).lerp(new Color(PALETTE.mist), 0.12);
  const stem = (a: Vector3, b: Vector3, bottom: number, top: number) => {
    const g = new CylinderGeometry(top, bottom, a.distanceTo(b), 5, 1);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q).translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    parts.push(colored(g, bark));
  };
  const lean = (variant - 1) * 0.8;
  stem(new Vector3(), new Vector3(lean * 0.35, 3.5, 0.2), 0.58, 0.33);
  stem(new Vector3(lean * 0.35, 3.5, 0.2), new Vector3(lean, 7.2, 0.15), 0.33, 0.13);
  const lobes = [
    [-2.5, 6.5, 0.5, 2.8, 1.6, 2.4], [2.1, 7.2, -0.7, 3, 1.8, 2.6],
    [-0.8, 8.6, -1.1, 2.6, 1.8, 2.5], [0.4, 9.1, 1.2, 2.8, 1.6, 2.6],
    [-2.6, 7.8, 2.2, 2, 1.3, 2.2], [2.9, 8.5, 1.3, 1.8, 1.5, 2.1],
  ];
  for (const [i, lobe] of lobes.entries()) {
    const [x, y, z, sx, sy, sz] = lobe as [number, number, number, number, number, number];
    const dx = x + Math.sin(variant * 2 + i) * 0.6;
    stem(new Vector3(lean * 0.5, 4.5 + i * 0.2, 0), new Vector3(dx * 0.8, y - 0.5, z * 0.7), 0.16, 0.05);
    const g = new IcosahedronGeometry(1, 0).scale(sx, sy, sz).rotateY(variant * 0.43 + i * 0.7).translate(dx, y, z);
    const pigment = leaf.clone().lerp(new Color(i % 2 ? PALETTE.grass : PALETTE.mist), 0.12 + i * 0.025);
    parts.push(colored(g, pigment));
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(g => g.dispose());
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

export function createFirstLightGrove(sampleHeight: (x: number, z: number) => number, zoneBounds: readonly Box3[], deferredGround = false) {
  // Non-indexed cushion faces repeat the same vertices. Sample each XZ once
  // during construction; the cache dies with this build and never affects streaming.
  const heights = new Map<number, Map<number, number>>();
  const heightAt = (x: number, z: number) => {
    let column = heights.get(x);
    if (!column) { column = new Map(); heights.set(x, column); }
    if (!column.has(z)) column.set(z, sampleHeight(x, z));
    return column.get(z)!;
  };
  const group = new Group(); group.name = "first-light-authored-grove";
  const yaw = Math.atan2(anchor.lookDirection.x, anchor.lookDirection.z);
  const sites: { x: number; y: number; z: number; scale: number; variant: number }[] = [];
  const toWorld = (x: number, z: number) => ({
    x: anchor.position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
    z: anchor.position.z - x * Math.sin(yaw) + z * Math.cos(yaw),
  });
  // An open centre, asymmetrical foreground frame and three receding woodland layers.
  const candidates = [
    [-13,-13,1.16], [14,-12,1.08], [-17,7,1.02], [19,10,1.2],
    [-26,-22,1.1], [-15,-27,0.98], [-6,-32,1.12], [7,-31,1.04], [20,-25,1.18], [30,-18,1.08],
    [-5,-19,0.86], [6,-22,1.22], [-18,-18,1.24], [19,-16,0.92], [1,-26,1.1],
    [-23,-9,0.88], [25,-5,1.13], [-8,-40,1.26], [5,-42,0.9], [17,-37,1.07],
    [-30,-4,1.15], [31,-1,1.1], [-28,16,1.05], [30,18,1.12],
    [-21,29,1.12], [-10,35,1.05], [4,37,1.12], [17,32,1.14], [27,28,1.04],
    [-12,18,0.92], [-20,20,1.22], [-8,26,1.18], [-18,34,0.98], [-28,26,1.18],
    [11,17,1.18], [20,21,1.04], [9,27,0.92], [22,34,1.22], [2,30,1.16],
    [-6,43,1.18], [8,43,1.06], [-20,39,1.13], [18,41,0.95],
    [18,1,1.18], [21,7,0.88], [25,13,1.12], [25,22,0.96],
    [31,-1,0.91], [33,8,1.14], [35,19,1.02], [39,-7,1.08], [39,5,0.92], [41,14,1.18],
    [-36,-13,0.9], [-34,9,0.96], [37,8,0.98], [-25,-35,0.94], [28,-32,0.98],
  ];
  for (const [i, [lx, lz, scale]] of candidates.entries()) {
    const { x, z } = toWorld(lx!, lz!);
    const y = heightAt(x, z);
    if (!Number.isFinite(y) || y < waterLevelAt(z) + 0.6 || nearestPath(x,z).distance < 6.8
      || nearestRiver(x,z).distance < 7 || zoneBounds.some(b => x > b.min.x - 1 && x < b.max.x + 1 && z > b.min.z - 1 && z < b.max.z + 1)) continue;
    sites.push({ x, y: y - 0.04, z, scale: scale!, variant: i % 3 });
  }
  const material = createRampMaterial(0xffffff, { steps: 4, soft: false });
  material.vertexColors = true;
  const renderSites = sites;
  const meshes = [0,1,2].map(variant => {
    const geometry = createFirstLightTree(variant);
    const items = renderSites.filter(s => s.variant === variant);
    const mesh = new InstancedMesh(geometry, material, items.length);
    mesh.name = `first-light-grove-trees-${variant}`;
    const matrix = new Matrix4();
    items.forEach((s,i) => {
      matrix.makeRotationY(i * 1.94 + variant * 0.7).scale(new Vector3(s.scale,s.scale,s.scale));
      matrix.setPosition(s.x,s.y,s.z); mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh); return mesh;
  });
  // Physics/camera volumes match the visible trunks, never the overhanging crowns.
  const colliderGeometry = new CylinderGeometry(0.45,0.45,5.2,6);
  const colliderMaterial = new MeshBasicMaterial();
  const trunks = sites.map(s => {
    const m = new Mesh(colliderGeometry,colliderMaterial);
    m.position.set(s.x,s.y+2.6*s.scale,s.z); m.scale.set(1,s.scale,1); m.updateMatrixWorld(true); return m;
  });
  const groundParts: BufferGeometry[] = [];
  const groundGeometry = new BufferGeometry();
  const groundMesh = new Mesh(groundGeometry, material);
  groundMesh.name = "first-light-authored-understorey";
  groundMesh.receiveShadow = true; groundMesh.visible = !deferredGround; group.add(groundMesh);
  // Ground dressing can join the existing post-control queue. Trunks and
  // their colliders remain synchronous; each small patch yields to input.
  const buildGround = (function* (): Generator<void> {
    try {
  for (const [index, site] of sites.entries()) {
    yield;
    if (index % 4 !== 1) continue;
    // A moss cushion seats each root; irregular overlapping leaf masses are bushes, not miniature trees.
    const cushion = new IcosahedronGeometry(1, 0).scale(2.2, 0.09, 2.0);
    const cp = cushion.getAttribute("position");
    for(let i=0;i<cp.count;i++){ const x=site.x+cp.getX(i),z=site.z+cp.getZ(i);cp.setXYZ(i,x,heightAt(x,z)+cp.getY(i)+0.045,z); }
    groundParts.push(colored(cushion,new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass),0.5)));
    for (const side of [-1, 0.4, 1.4]) {
      const x=site.x+side*(2.4+index%3*0.55),z=site.z+Math.sin(index*2.1+side)*3.1;
      if(nearestPath(x,z).distance<4.5 || nearestRiver(x,z).distance<4 || zoneBounds.some(b=>b.containsPoint(new Vector3(x,heightAt(x,z),z))))continue;
      for(let j=0;j<3;j++) {
        const g=new IcosahedronGeometry(1,0).scale(0.72+j*0.09,0.45+j*0.05,0.65);
        g.rotateY(index+j).translate(x+(j-1)*0.5,heightAt(x,z)+0.35+j*0.1,z+Math.sin(j+index)*0.4);
        groundParts.push(colored(g,new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass),0.35+j*0.15)));
      }
    }
  }
  // Two asymmetric foreground patches frame the clearing without filling the walking corridor.
  for (const [index, local] of [[-7.5,-6],[-9,6]].entries()) {
    yield;
    const {x,z}=toWorld(local[0]!,local[1]!);
    if(nearestPath(x,z).distance<4.5 || nearestRiver(x,z).distance<4)continue;
    for(let j=0;j<5;j++) {
      const dx=Math.sin(j*2.3+index)*0.75,dz=Math.cos(j*1.7)*0.7;
      const g=new IcosahedronGeometry(1,0).scale(0.75+j%2*0.35,0.4+j%3*0.1,0.8);
      g.rotateY(j+index).translate(x+dx,heightAt(x+dx,z+dz)+0.35+j%3*0.1,z+dz);
      groundParts.push(colored(g,new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass),0.3+j*0.08)));
    }
  }

      const merged = mergeGeometries(groundParts, false)!;
      groundGeometry.copy(merged); merged.dispose(); groundMesh.visible = true;
    } finally {
      groundParts.forEach(part => part.dispose()); groundParts.length = 0;
    }
  })();
  if (!deferredGround) while (!buildGround.next().done) { /* Standalone parity. */ }
  const maxCounts = meshes.map(m => m.count);
  function setQuality(quality: Quality) {
    // Silhouette and collision remain stable; Low draws a spatially interleaved subset.
    meshes.forEach((m,i) => { m.count = quality === "Low" ? Math.ceil(maxCounts[i]! * 0.7) : maxCounts[i]!; });
  }
  let disposed = false;
  return { group, sites, meshes, trunks, setQuality, buildGround,
    dispose() {
      if (disposed) return; disposed = true;
      buildGround.return(undefined);
      meshes.forEach(m=>m.geometry.dispose()); material.dispose();
      groundGeometry.dispose(); colliderGeometry.dispose(); colliderMaterial.dispose(); group.removeFromParent(); group.clear();
    },
  };
}
