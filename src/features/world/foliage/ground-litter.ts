import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Frustum, Group, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, Matrix4, Sphere, Vector3, IcosahedronGeometry, type PerspectiveCamera, type Scene } from "three";
import { PALETTE } from "../art/palette";
import { ZONES } from "../layout/zones";
import type { Quality } from "../terrain";
import { createSurfaceSampler, waterLevelAt } from "../terrain/height";
import { foliageBiomeAt } from "./scatter";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { PATH_BRIDGES } from "../layout/path";

const hash = (x: number, z: number, salt = 0) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ salt;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

/** Curled leaf, bent grass fan and tapered surface root, all authored in code. */
export function forestFloorGeometry(kind: "leaf" | "grass" | "root" | "stone") {
  if (kind === "stone") {
    const stone = new IcosahedronGeometry(0.1, 0);
    stone.setAttribute("color", new Float32BufferAttribute(new Float32Array(stone.getAttribute("position").count * 3).fill(1), 3));
    return stone;
  }
  const p: number[] = [], indices: number[] = [], colors: number[] = [];
  const push = (x: number, y: number, z: number, light: number) => {
    p.push(x, y, z); colors.push(light, light, light);
  };
  if (kind === "root") {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, radius = 0.14 * (1 - t) + 0.008;
      for (let side = 0; side < 6; side++) {
        const a = side * Math.PI / 3;
        push((t - 0.5) * 1.8, Math.sin(a) * radius + 0.015, Math.sin(t * 4) * 0.12 + Math.cos(a) * radius, 0.65 + Math.max(0, Math.sin(a)) * 0.35);
      }
      if (i < 10) for (let s = 0; s < 6; s++) {
        const a = i * 6 + s, b = i * 6 + (s + 1) % 6;
        indices.push(a, b, a + 6, b, b + 6, a + 6);
      }
    }
  } else if (kind === "leaf") {
    // A shallow cup stays under 1 cm, including instance curl and root offset.
    // Six longitudinal segments retain the outline at 30% of the old triangles.
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, width = Math.pow(Math.sin(t * Math.PI), 0.8) * 0.03;
      for (let rib = -1; rib <= 1; rib++) {
        const side = rib, edge = Math.abs(side);
        push(side * width + t * t * t * 0.009,
          Math.sin(t * Math.PI) * 0.0008 + edge * edge * width * 0.07 + Math.pow(t, 5) * 0.0035,
          (t - 0.5) * 0.15, rib === 0 ? 0.68 : 0.86 + 0.12 * Math.sin(i * 2 + rib));
      }
      if (i < 6) for (let s = 0; s < 2; s++) {
        const a = i * 3 + s; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  } else {
    for (let blade = 0; blade < 7; blade++) {
      const a = blade * 2.39996, c = Math.cos(a), s = Math.sin(a), start = p.length / 3;
      for (let i = 0; i <= 5; i++) {
        const t = i / 5, bend = t * t * 0.22, width = Math.pow(1 - t, 0.7) * 0.024;
        for (const side of [-1, 1]) push(c * bend - s * width * side, t * (0.35 + blade * 0.055), s * bend + c * width * side, 0.58 + t * 0.42);
        if (i < 5) { const q = start + i * 2; indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(p, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// A 3x3 lattice patch covers the entire blade, including cell/diagonal seams.
// Match surfaceHeight's two Float32 triangles rather than a tangent-plane guess.
const floorPatchShader = `
attribute vec3 floorPatch0, floorPatch1, floorPatch2;
float floorHeight(vec2 p) {
  vec2 origin = floor(instanceMatrix[3].xz / 2.0 + 0.5) * 2.0 - 2.0;
  vec2 cell = clamp(floor((p-origin)/2.0), vec2(0.0), vec2(1.0));
  vec2 uv = (p-origin)/2.0-cell;
  vec3 row0 = cell.y < 0.5 ? floorPatch0 : floorPatch1;
  vec3 row1 = cell.y < 0.5 ? floorPatch1 : floorPatch2;
  float a = cell.x < 0.5 ? row0.x : row0.y, b = cell.x < 0.5 ? row0.y : row0.z;
  float c = cell.x < 0.5 ? row1.x : row1.y, d = cell.x < 0.5 ? row1.y : row1.z;
  return uv.x+uv.y <= 1.0 ? a+(b-a)*uv.x+(c-a)*uv.y : d+(c-d)*(1.0-uv.x)+(b-d)*(1.0-uv.y);
}`;
const drapeLeafShader = `
vec4 floorPoint=instanceMatrix*vec4(transformed,1.0);
float contactHeight=floorHeight(floorPoint.xz)+0.002+position.y*length(instanceMatrix[1].xyz);
vec3 vertical=vec3(instanceMatrix[0].y/dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),instanceMatrix[1].y/dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),instanceMatrix[2].y/dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));
transformed+=vertical*(contactHeight-floorPoint.y);`;

/** Deferred near field. Only changed ranges upload while a cell is being filled.
 * Once stationary, the CPU does no scatter queries and uploads no instance buffers. */
export function createForestFloor(scene?: Scene) {
  const group = new Group(); group.name = "hr-forest-floor";
  const clock = { value: 0 }, fadeRadius = { value: 32 };
  const kinds = ["leaf", "grass", "root", "stone"] as const;
  const meshes = kinds.map(kind => {
    const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.floorTime = clock; shader.uniforms.floorRadius = fadeRadius;
      shader.vertexShader = "uniform float floorTime,floorRadius;\nvarying vec3 vFloorWorld;\n" + shader.vertexShader;
      if (kind === "leaf") shader.vertexShader = floorPatchShader + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        ${kind === "grass" ? "transformed.xz+=vec2(sin(floorTime*1.2+instanceMatrix[3].x*0.6),cos(floorTime+instanceMatrix[3].z*0.4))*position.y*position.y*0.16;" : ""}
        transformed*=1.0-smoothstep(floorRadius-8.0,floorRadius,distance(instanceMatrix[3].xz,cameraPosition.xz));
        ${kind === "leaf" ? drapeLeafShader : ""}
        vFloorWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = "varying vec3 vFloorWorld;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float fiber=sin(vFloorWorld.x*180.0+sin(vFloorWorld.z*80.0))*0.035;
        diffuseColor.rgb*=1.0+fiber;`);
    };
    material.customProgramCacheKey = () => `hr-floor-${kind}-v3`;
    const mesh = new InstancedMesh(forestFloorGeometry(kind), material, kind === "leaf" ? 16000 : kind === "grass" ? 14000 : kind === "root" ? 384 : 1024);
    mesh.name = `hr-floor-${kind}`; mesh.count = 0; mesh.receiveShadow = true;
    if (kind === "leaf") for (let row = 0; row < 3; row++) mesh.geometry.setAttribute(`floorPatch${row}`, new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3));
    mesh.frustumCulled = false; group.add(mesh); return mesh;
  });
  const leaves = meshes[0]!;
  const contactGeometry = new BufferGeometry();
  contactGeometry.setAttribute("position", new Float32BufferAttribute([-0.032,0,-0.075, 0.032,0,-0.075, -0.032,0,0.075, 0.032,0,0.075], 3));
  contactGeometry.setAttribute("uv", new Float32BufferAttribute([0,0,1,0,0,1,1,1], 2)); contactGeometry.setIndex([0,2,1,1,2,3]);
  for (let row = 0; row < 3; row++) contactGeometry.setAttribute(`floorPatch${row}`, leaves.geometry.getAttribute(`floorPatch${row}`));
  const contactMaterial = new MeshBasicMaterial({ color: "#3b3021", transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  contactMaterial.onBeforeCompile = shader => {
    shader.uniforms.floorRadius = fadeRadius;
    shader.vertexShader = floorPatchShader + "uniform float floorRadius;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed*=1.0-smoothstep(floorRadius-8.0,floorRadius,distance(instanceMatrix[3].xz,cameraPosition.xz));
      ${drapeLeafShader.replace("+0.002+position.y*length(instanceMatrix[1].xyz)", "+0.0008")}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `diffuseColor.a*=1.0-smoothstep(0.15,0.5,length((vUv-0.5)*vec2(1.2,1.0)));
      #include <opaque_fragment>`);
    shader.defines = { ...shader.defines, USE_UV: "" };
  };
  contactMaterial.customProgramCacheKey = () => "hr-leaf-contact-v1";
  const contacts = new InstancedMesh(contactGeometry, contactMaterial, leaves.instanceMatrix.count);
  contacts.name = "hr-floor-leaf-contact"; contacts.instanceMatrix = leaves.instanceMatrix; contacts.count = 0; contacts.frustumCulled = false; group.add(contacts);
  const transform = new Object3D(), tint = new Color(), normal = new Vector3(), up = new Vector3(0, 1, 0);
  const dry = new Color(PALETTE.grassDry), green = new Color("#788748");
  const leafColors = ["#79502c", "#a17a3c", "#b09450", "#684530", "#59442f"].map(c => new Color(c));
  let surface = createSurfaceSampler();
  // Read existing transforms only; no edits to tree assets or their LOD system.
  const treeBases: Vector3[] = [], matrix = new Matrix4(), point = new Vector3();
  scene?.updateMatrixWorld(true);
  scene?.traverse(object => {
    if (object instanceof InstancedMesh && object.name.startsWith("first-light-grove-trees-")) {
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld);
        treeBases.push(new Vector3().setFromMatrixPosition(matrix));
      }
    }
  });
  scene?.traverse(object => {
    if (object.name.startsWith("first-light-grove-trees-")) return;
    if (treeBases.length >= 350) return;
    if (object instanceof InstancedMesh && object.castShadow) {
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox!, size = box.getSize(new Vector3());
      if (size.y < 1 || size.y < size.x * 2 || size.y < size.z * 2) return;
      for (let i = 0; i < object.count && treeBases.length < 350; i++) {
        object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld);
        point.set(0, box.min.y, 0).applyMatrix4(matrix);
        treeBases.push(point.clone());
      }
    }
  });
  let center = "", build: Generator<void> | undefined, disposed = false;
  const add = (type: number, x: number, y: number, z: number, yaw: number, scale: number, color: Color, stretch = 1, curl = 1) => {
    const mesh = meshes[type]!; if (mesh.count >= mesh.instanceMatrix.count) return;
    transform.position.set(x, y, z); transform.quaternion.setFromUnitVectors(up, normal);
    transform.rotateY(yaw); transform.scale.set(scale * stretch, scale * curl, scale);
    transform.updateMatrix(); mesh.setMatrixAt(mesh.count, transform.matrix); mesh.setColorAt(mesh.count, color);
    if (type === 0) {
      const x0 = Math.round(x / 2) * 2 - 2, z0 = Math.round(z / 2) * 2 - 2;
      for (let row = 0; row < 3; row++) mesh.geometry.getAttribute(`floorPatch${row}`).setXYZ(mesh.count, surface(x0,z0+row*2), surface(x0+2,z0+row*2), surface(x0+4,z0+row*2));
    }
    mesh.count++;
  };
  const frustum = new Frustum(), cellBounds = new Sphere(new Vector3(), 5), view = new Matrix4();
  const direction = new Vector3(), lastDirection = new Vector3();
  function* populate(x: number, z: number, radius: number) {
    surface = createSurfaceSampler();
    // Roots are radial, anchored to real tree bases rather than random ground specks.
    normal.copy(up);
    for (const base of treeBases) {
      if (Math.hypot(base.x - x, base.z - z) > radius) continue;
      for (let n = 0; n < 6; n++) {
        const a = n * Math.PI / 3 + hash(Math.floor(base.x), Math.floor(base.z));
        const px = base.x + Math.cos(a) * 0.9, pz = base.z - Math.sin(a) * 0.9;
        if (nearestPath(px, pz).distance < 1.7 || nearestRiver(px, pz).distance < 7) continue;
        normal.set(-(surface(px + 0.3, pz) - surface(px - 0.3, pz)) / 0.6, 1, -(surface(px, pz + 0.3) - surface(px, pz - 0.3)) / 0.6).normalize();
        add(2, px, surface(px, pz) + 0.05, pz, a + Math.PI, 1.2, leafColors[4]!, 1.5);
      }
      yield;
    }
    // Walk outward: the visible foreground fills before distant margins.
    for (let ring = 0; ring <= radius; ring++) for (let ix = -ring; ix <= ring; ix++) for (let iz = -ring; iz <= ring; iz++) {
      if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
      yield;
      const gx = Math.floor(x) + ix, gz = Math.floor(z) + iz;
      const px = gx + hash(gx, gz, 3), pz = gz + hash(gx, gz, 7);
      if (Math.hypot(px - x, pz - z) > radius) continue;
      const biome = foliageBiomeAt(px, pz);
      const path = nearestPath(px, pz);
      if (path.distance < 1.65 || nearestRiver(px, pz).distance < 7.5
        || PATH_BRIDGES.some(b => path.t >= b.tStart && path.t <= b.tEnd && path.distance < 6)) continue;
      const y = surface(px, pz); if (y < waterLevelAt(pz) + 0.25) continue;
      cellBounds.center.set(px, y, pz); if (!frustum.intersectsSphere(cellBounds)) continue;
      const dx = (surface(px + 0.3, pz) - surface(px - 0.3, pz)) / 0.6;
      const dz = (surface(px, pz + 0.3) - surface(px, pz - 0.3)) / 0.6;
      if (Math.hypot(dx, dz) > 1.1) continue;
      normal.set(-dx, 1, -dz).normalize();
      const padEdge = Math.min(1, ...ZONES.map(zone => Math.hypot(px - zone.position.x, pz - zone.position.z) / zone.radius));
      // Low litter can dress pads; tall grass stays outside their interaction space.
      const gap = Math.sin(px * 0.13 + Math.sin(pz * 0.09) * 2) * Math.cos(pz * 0.17);
      const type = biome === "hill" || biome === "coast-dusk" || gap > 0.12 ? 1 : 0;
      const distance = Math.hypot(px-x,pz-z), density = distance < 12 ? 1 : distance < 22 ? 0.65 : 0.35;
      const count = Math.max(1, Math.round((type === 0 ? 16 : 2 + 7 * padEdge * padEdge * (3 - 2 * padEdge)) * density));
      for (let n = 0; n < count; n++) {
        const ox = (hash(gx, gz, 30 + n) - 0.5) * 0.85, oz = (hash(gx, gz, 80 + n) - 0.5) * 0.85;
        if (path.distance + ox * (px - path.x) / path.distance + oz * (pz - path.z) / path.distance < 1.6) continue;
        const size = type === 0 ? (1 + hash(gx, gz, n + 9) * 2) / 3 : 0.6 + hash(gx, gz, n + 9) * 0.8;
        tint.copy(type === 0 ? leafColors[Math.floor(hash(gx, gz, n + 151) * leafColors.length)]! : green);
        if (type === 0) tint.lerp(leafColors[Math.floor(hash(gx, gz, n + 181) * leafColors.length)]!, hash(gx, gz, n + 191) * 0.5);
        if (type === 1) tint.lerp(dry, hash(gx, gz, n + 11) * 0.48);
        if (type === 0) {
          const lx = px + ox, lz = pz + oz, epsilon = 0.005;
          normal.set(-(surface(lx+epsilon,lz)-surface(lx-epsilon,lz))/(epsilon*2),1,-(surface(lx,lz+epsilon)-surface(lx,lz-epsilon))/(epsilon*2)).normalize();
        }
        add(type, px + ox, surface(px+ox,pz+oz) + (type === 0 ? 0.002 : 0.025), pz + oz, hash(gx, gz, n) * Math.PI * 2, size, tint,
          type === 0 ? 0.65 + hash(gx, gz, n + 201) * 0.5 : 1, type === 0 ? 0.35 + hash(gx, gz, n + 211) * 1.25 : 1);
      }
      if (path.distance < 3.8 && hash(gx, gz, 111) > 0.4) {
        tint.set(PALETTE.rock).multiplyScalar(0.65 + hash(gx, gz, 114) * 0.4);
        add(3, px, y + 0.04, pz, hash(gx, gz) * 6, 0.4 + hash(gx, gz, 112) * 1.2, tint, 1.4);
      }
    }
  }
  return {
    group,
    update(camera: PerspectiveCamera, quality: Quality, dt: number, reducedMotion = false) {
      if (disposed) return;
      group.visible = quality !== "Low"; if (quality === "Low") return;
      fadeRadius.value = quality === "High" ? 32 : 22;
      if (!reducedMotion) clock.value += dt;
      const { x, z } = camera.position;
      camera.updateMatrixWorld(); camera.getWorldDirection(direction);
      const key = `${Math.floor(x / 8)},${Math.floor(z / 8)},${quality}`;
      if (key !== center || direction.dot(lastDirection) < 0.966) {
        center = key; lastDirection.copy(direction); meshes.forEach(mesh => { mesh.count = 0; }); contacts.count = 0;
        frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        build = populate(Math.floor(x / 8) * 8 + 4, Math.floor(z / 8) * 8 + 4, quality === "High" ? 36 : 26);
      }
      if (!build) return;
      const counts = meshes.map(m => m.count), start = performance.now();
      for (let i = 0; i < 80; i++) { if (build.next().done) { build = undefined; break; } if (performance.now() - start > 0.6) break; }
      meshes.forEach((mesh, i) => {
        const from = Math.min(counts[i]!, mesh.count), added = mesh.count - from;
        if (added <= 0) return;
        mesh.instanceMatrix.addUpdateRange(from * 16, added * 16); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) { mesh.instanceColor.addUpdateRange(from * 3, added * 3); mesh.instanceColor.needsUpdate = true; }
        if (i === 0) for (let row = 0; row < 3; row++) { const attribute = mesh.geometry.getAttribute(`floorPatch${row}`) as InstancedBufferAttribute; attribute.addUpdateRange(from*3,added*3); attribute.needsUpdate = true; }
      });
      contacts.count = leaves.count;
    },
    dispose() {
      if (disposed) return;
      disposed = true; build = undefined; group.removeFromParent(); group.clear();
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
      contacts.dispose(); contactGeometry.dispose(); contactMaterial.dispose();
    },
  };
}
