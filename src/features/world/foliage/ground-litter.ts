import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, MeshLambertMaterial, Object3D, Matrix4, Vector3, IcosahedronGeometry, type PerspectiveCamera, type Scene } from "three";
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
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, width = Math.pow(Math.sin(t * Math.PI), 0.8) * 0.095;
      for (let side = -1; side <= 1; side++) push(side * width, 0.016 + Math.sin(t * Math.PI) * 0.028 + Math.abs(side) * 0.018, (t - 0.5) * 0.42, side === 0 ? 0.72 : 0.9 + 0.1 * Math.sin(i * 2));
      if (i < 6) for (let s = 0; s < 2; s++) {
        const a = i * 3 + s; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  } else {
    for (let blade = 0; blade < 7; blade++) {
      const a = blade * 2.39996, c = Math.cos(a), s = Math.sin(a), start = p.length / 3;
      for (let i = 0; i <= 2; i++) {
        const t = i / 2, bend = t * t * 0.22, width = (1 - t) * 0.035;
        for (const side of [-1, 1]) push(c * bend - s * width * side, t * (0.35 + blade * 0.055), s * bend + c * width * side, 0.35 + t * 0.65);
        if (i < 2) { const q = start + i * 2; indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(p, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

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
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        ${kind === "grass" ? "transformed.xz+=vec2(sin(floorTime*1.2+instanceMatrix[3].x*0.6),cos(floorTime+instanceMatrix[3].z*0.4))*position.y*position.y*0.16;" : ""}
        transformed*=1.0-smoothstep(floorRadius-8.0,floorRadius,distance(instanceMatrix[3].xz,cameraPosition.xz));
        vFloorWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = "varying vec3 vFloorWorld;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float fiber=sin(vFloorWorld.x*180.0+sin(vFloorWorld.z*80.0))*0.035;
        diffuseColor.rgb*=1.0+fiber;`);
    };
    material.customProgramCacheKey = () => `hr-floor-${kind}-v2`;
    const mesh = new InstancedMesh(forestFloorGeometry(kind), material, kind === "leaf" ? 16000 : kind === "grass" ? 14000 : kind === "root" ? 384 : 1024);
    mesh.name = `hr-floor-${kind}`; mesh.count = 0; mesh.receiveShadow = true;
    mesh.frustumCulled = false; group.add(mesh); return mesh;
  });
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
  const add = (type: number, x: number, y: number, z: number, yaw: number, scale: number, color: Color, stretch = 1) => {
    const mesh = meshes[type]!; if (mesh.count >= mesh.instanceMatrix.count) return;
    transform.position.set(x, y, z); transform.quaternion.setFromUnitVectors(up, normal);
    transform.rotateY(yaw); transform.scale.set(scale * stretch, scale, scale);
    transform.updateMatrix(); mesh.setMatrixAt(mesh.count, transform.matrix); mesh.setColorAt(mesh.count++, color);
  };
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
      if (biome === "coast-dusk") continue;
      const path = nearestPath(px, pz);
      if (path.distance < 1.65 || nearestRiver(px, pz).distance < 7.5
        || PATH_BRIDGES.some(b => path.t >= b.tStart && path.t <= b.tEnd && path.distance < 6)) continue;
      const y = surface(px, pz); if (y < waterLevelAt(pz) + 0.25) continue;
      const dx = (surface(px + 0.3, pz) - surface(px - 0.3, pz)) / 0.6;
      const dz = (surface(px, pz + 0.3) - surface(px, pz - 0.3)) / 0.6;
      if (Math.hypot(dx, dz) > 1.1) continue;
      normal.set(-dx, 1, -dz).normalize();
      const padEdge = Math.min(1, ...ZONES.map(zone => Math.hypot(px - zone.position.x, pz - zone.position.z) / zone.radius));
      // Low litter can dress pads; tall grass stays outside their interaction space.
      const gap = Math.sin(px * 0.13 + Math.sin(pz * 0.09) * 2) * Math.cos(pz * 0.17);
      const type = biome === "hill" || gap > 0.12 ? 1 : 0;
      const count = type === 0 ? 16 : Math.round(2 + 7 * padEdge * padEdge * (3 - 2 * padEdge));
      for (let n = 0; n < count; n++) {
        const ox = (hash(gx, gz, 30 + n) - 0.5) * 0.85, oz = (hash(gx, gz, 80 + n) - 0.5) * 0.85;
        if (path.distance + ox * (px - path.x) / path.distance + oz * (pz - path.z) / path.distance < 1.6) continue;
        const size = type === 0 ? 0.55 + hash(gx, gz, n + 9) * 0.65 : 0.6 + hash(gx, gz, n + 9) * 0.8;
        tint.copy(type === 0 ? leafColors[n % leafColors.length]! : green);
        if (type === 1) tint.lerp(dry, hash(gx, gz, n + 11) * 0.48);
        add(type, px + ox, y + dx * ox + dz * oz + 0.025, pz + oz, hash(gx, gz, n) * Math.PI * 2, size, tint);
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
      const key = `${Math.floor(x / 8)},${Math.floor(z / 8)},${quality}`;
      if (key !== center) { center = key; meshes.forEach(mesh => { mesh.count = 0; }); build = populate(Math.floor(x / 8) * 8 + 4, Math.floor(z / 8) * 8 + 4, quality === "High" ? 36 : 26); }
      if (!build) return;
      const counts = meshes.map(m => m.count), start = performance.now();
      for (let i = 0; i < 80; i++) { if (build.next().done) { build = undefined; break; } if (performance.now() - start > 0.6) break; }
      meshes.forEach((mesh, i) => {
        const from = Math.min(counts[i]!, mesh.count), added = mesh.count - from;
        if (added <= 0) return;
        mesh.instanceMatrix.addUpdateRange(from * 16, added * 16); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) { mesh.instanceColor.addUpdateRange(from * 3, added * 3); mesh.instanceColor.needsUpdate = true; }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true; build = undefined; group.removeFromParent(); group.clear();
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
    },
  };
}
