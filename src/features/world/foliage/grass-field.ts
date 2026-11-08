import { inFirstLightGrove } from "./first-light-grove";
import { type Box3, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Object3D, Vector2 } from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import type { Quality } from "../terrain";
import { TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { foliageBiomeAt, isGroundCoverExcluded } from "./scatter";

// Lead render check (2026-11-06): single 5 cm blades at 0.5 m read as bare ground; one 4-blade tuft per
// 0.7 m cell within 18/12 m reads as a meadow and stays under the 60k-triangle cap.
export const GRASS_FIELD_RADII = { High: 18, Balanced: 12, Low: 0 } as const;
export const GRASS_FIELD_SPACING = 0.7;
const S = GRASS_FIELD_SPACING;

/** Conservative clearance also covers the bent blade's horizontal footprint. */
export function grassFieldAllowed(x: number, z: number, zoneBounds: readonly Box3[] = []): boolean {
  if (inFirstLightGrove(x, z)) return false;
  const biome = foliageBiomeAt(x, z);
  if (biome !== "hill" && biome !== "coast-dusk"
    && biome !== "forest-dawn") return false;
  return [[0, 0], [-0.18, 0], [0.18, 0], [0, -0.18], [0, 0.18]].every(([dx, dz]) => {
    const px = x + dx!, pz = z + dz!;
    return !isGroundCoverExcluded(px, pz, zoneBounds) && worldHeight(px, pz) > waterLevelAt(pz) + 0.15;
  });
}

/** World-cell seed, independent of camera, slot, quality and visit order. */
export function grassFieldBlade(cx: number, cz: number) {
  let seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ TERRAIN_SEED) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const x = (cx + 0.5) * S + (random() - 0.5) * 0.45;
  const z = (cz + 0.5) * S + (random() - 0.5) * 0.45;
  const forest = foliageBiomeAt(x, z) === "forest-dawn";
  return { forest, x, z,
    height: forest ? 0.15 + random() * 0.2 : 0.25 + random() * 0.35, yaw: random() * Math.PI * 2 };
}

export function createGrassField(quality: Quality, zoneBounds: readonly Box3[] = []) {
  const radius = GRASS_FIELD_RADII[quality];
  // Square torus includes a guard cell; shader clips it to the exact moving circle.
  const half = Math.ceil(radius / S) + 1, side = half * 2 + 1;
  const capacity = radius ? side * side : 0;
  const geometry = new BufferGeometry();
  // Four bent blades fanned around the tuft centre (12 triangles).
  const blade = [-0.04, 0, 0, 0.04, 0, 0, 0.01, 0.55, 0.05, 0.06, 0.55, 0.05, 0.14, 1, 0.12];
  const positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const root = new Color(PALETTE.grass), tip = new Color(PALETTE.grassDry), mid = root.clone().lerp(tip, 0.55);
  for (let b = 0; b < 4; b++) {
    const angle = b * Math.PI / 4 + (b % 2) * 0.3, c = Math.cos(angle), sn = Math.sin(angle);
    const offset = positions.length / 3, lean = 0.8 + 0.15 * b;
    for (let i = 0; i < 15; i += 3) {
      const x = blade[i]! * lean, y = blade[i + 1]! * (0.85 + 0.1 * b), z = blade[i + 2]! * lean;
      positions.push(x * c - z * sn, y, x * sn + z * c);
    }
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2, offset + 2, offset + 3, offset + 4);
    colors.push(...root.toArray(), ...root.toArray(), ...mid.toArray(), ...mid.toArray(), ...tip.toArray());
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("grassForest", new InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.computeVertexNormals();
  const material = createRampMaterial(0xffffff);
  material.vertexColors = true;
  material.side = DoubleSide;
  const uniforms = { grassCenter: { value: new Vector2() }, grassRadius: { value: radius },
    grassTime: { value: 0 }, grassWind: { value: 1 } };
  const rampCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    rampCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute float grassForest;
uniform vec2 grassCenter;
uniform float grassRadius, grassTime, grassWind;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vec2 grassRoot = instanceMatrix[3].xz;
float grassFade = 1.0 - smoothstep(grassRadius - 4.0, grassRadius, distance(grassRoot, grassCenter));
transformed.xz += vec2(sin(grassTime * 1.7 + dot(grassRoot, vec2(0.37, 0.21))), 0.3) * position.y * position.y * 0.08 * grassWind;
transformed *= grassFade;`)
      .replace("#include <color_vertex>", `#include <color_vertex>
if (grassForest > 0.5) vColor.rgb = mix(vec3(${new Color(PALETTE.forestDeep).toArray().join(",")}), vec3(${new Color(PALETTE.grass).toArray().join(",")}), position.y / 1.15);`);
  };
  material.customProgramCacheKey = () => "grass-field-ramp-v2";
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  // Hidden until the deferred dressing update starts sampling; construction never fills cells.
  mesh.visible = false;
  mesh.receiveShadow = true;
  const group = new Group();
  group.add(mesh);
  const cellsX = new Float64Array(capacity).fill(Infinity), cellsZ = new Float64Array(capacity).fill(Infinity);
  const transform = new Object3D();
  let cursor = 0, remaining = 0, centerX = Infinity, centerZ = Infinity;
  let boundsCount = zoneBounds.length;
  let disposed = false;
  let started = false;
  /** Sampling is incremental (0.9 ms soft budget, at most 384 new cells/frame; ~2 s to fill on desktop).
   * Initial fill/teleports converge over several frames; retained cells never resample.
   * Call with the player/camera XZ, elapsed seconds and current motion preference.
   */
  function update(x: number, z: number, time: number, reducedMotion = false) {
    if (disposed || !radius) return { sampled: 0, pending: 0 };
    uniforms.grassCenter.value.set(x, z);
    uniforms.grassTime.value = time;
    uniforms.grassWind.value = reducedMotion ? 0 : 1;
    // Scene composition calls update once before the first render. Keep that frame free of dressing.
    if (!started) { started = true; return { sampled: 0, pending: capacity }; }
    const start = performance.now();
    // Forest uses the same torus and incremental sampling budget as the meadow.
    if (zoneBounds.length !== boundsCount) {
      boundsCount = zoneBounds.length;
      cellsX.fill(Infinity); cellsZ.fill(Infinity);
      remaining = capacity;
    }
    const nx = Math.floor(x / S), nz = Math.floor(z / S);
    if (nx !== centerX || nz !== centerZ) {
      centerX = nx; centerZ = nz; remaining = capacity;
    }
    let sampled = 0;
    mesh.instanceMatrix.clearUpdateRanges();
    while (remaining > 0 && sampled < 384 && performance.now() - start < 0.9) {
      const slot = cursor;
      cursor = (cursor + 1) % capacity;
      remaining--;
      const sx = slot % side, sz = Math.floor(slot / side);
      const minX = centerX - half, minZ = centerZ - half;
      const cx = minX + ((sx - minX) % side + side) % side;
      const cz = minZ + ((sz - minZ) % side + side) % side;
      if (cellsX[slot] === cx && cellsZ[slot] === cz) continue;
      cellsX[slot] = cx; cellsZ[slot] = cz;
      const blade = grassFieldBlade(cx, cz);
      const allowed = grassFieldAllowed(blade.x, blade.z, zoneBounds);
      geometry.getAttribute("grassForest").setX(slot, blade.forest ? 1 : 0);
      transform.position.set(blade.x, allowed ? worldHeight(blade.x, blade.z) : 0, blade.z);
      transform.rotation.set(0, blade.yaw, 0);
      transform.scale.setScalar(allowed ? 1 : 0);
      transform.scale.y *= blade.height / (blade.forest ? 1.15 : 1);
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
      sampled++;
    }
    if (sampled) {
      mesh.instanceMatrix.needsUpdate = true;
      geometry.getAttribute("grassForest").needsUpdate = true;
    }
    // Compile/draw only after the deferred initial fill; retain visibility while scrolling.
    if (!remaining) mesh.visible = true;
    return { sampled, pending: remaining };
  }
  // Unfilled slots must not render identity blades at the origin.
  mesh.instanceMatrix.array.fill(0);
  for (let slot = 0; slot < capacity; slot++) mesh.instanceMatrix.array[slot * 16 + 15] = 1;
  return { group, mesh, radius, update, dispose() {
    if (disposed) return;
    disposed = true; group.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose();
  } };
}
