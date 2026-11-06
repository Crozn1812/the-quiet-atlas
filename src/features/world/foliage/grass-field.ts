import { BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Object3D, Vector2 } from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import type { Quality } from "../terrain";
import { TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { foliageBiomeAt, forestHillDistanceAt, isFoliageExcluded } from "./scatter";

export const GRASS_FIELD_RADII = { High: 25, Balanced: 15, Low: 0 } as const;
export const GRASS_FIELD_SPACING = 0.5;

/** Conservative clearance also covers the bent blade's horizontal footprint. */
export function grassFieldAllowed(x: number, z: number): boolean {
  const biome = foliageBiomeAt(x, z);
  if (biome !== "hill" && biome !== "coast-dusk"
    && !(biome === "forest-dawn" && forestHillDistanceAt(x, z) <= 12)) return false;
  return [[0, 0], [-0.18, 0], [0.18, 0], [0, -0.18], [0, 0.18]].every(([dx, dz]) => {
    const px = x + dx!, pz = z + dz!;
    return !isFoliageExcluded(px, pz) && worldHeight(px, pz) > waterLevelAt(pz) + 0.15;
  });
}

/** World-cell seed, independent of camera, slot, quality and visit order. */
export function grassFieldBlade(cx: number, cz: number) {
  let seed = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ TERRAIN_SEED) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return { x: (cx + 0.5) * 0.5 + (random() - 0.5) * 0.3,
    z: (cz + 0.5) * 0.5 + (random() - 0.5) * 0.3,
    height: 0.25 + random() * 0.35, yaw: random() * Math.PI * 2 };
}

export function createGrassField(quality: Quality) {
  const radius = GRASS_FIELD_RADII[quality];
  // Square torus includes a guard cell; shader clips it to the exact moving circle.
  const half = Math.ceil(radius / 0.5) + 1, side = half * 2 + 1;
  const capacity = radius ? side * side : 0;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.025, 0, 0, 0.025, 0, 0, 0.005, 0.55, 0.035, 0.04, 0.55, 0.035, 0.1, 1, 0.08,
  ], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const root = new Color(PALETTE.grass), tip = new Color(PALETTE.grassDry);
  geometry.setAttribute("color", new Float32BufferAttribute([root, root, root.clone().lerp(tip, 0.55), root.clone().lerp(tip, 0.55), tip].flatMap(c => c.toArray()), 3));
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
uniform vec2 grassCenter;
uniform float grassRadius, grassTime, grassWind;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vec2 grassRoot = instanceMatrix[3].xz;
float grassFade = 1.0 - smoothstep(grassRadius - 4.0, grassRadius, distance(grassRoot, grassCenter));
transformed.xz += vec2(sin(grassTime * 1.7 + dot(grassRoot, vec2(0.37, 0.21))), 0.3) * position.y * position.y * 0.08 * grassWind;
transformed *= grassFade;`);
  };
  material.customProgramCacheKey = () => "grass-field-ramp-v1";
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const group = new Group();
  group.add(mesh);
  const cellsX = new Float64Array(capacity).fill(Infinity), cellsZ = new Float64Array(capacity).fill(Infinity);
  const transform = new Object3D();
  let cursor = 0, remaining = 0, centerX = Infinity, centerZ = Infinity;
  let disposed = false;
  /** Sampling is incremental (0.65 ms soft budget, at most 128 new cells/frame).
   * Initial fill/teleports converge over several frames; retained cells never resample.
   * Call with the player/camera XZ, elapsed seconds and current motion preference.
   */
  function update(x: number, z: number, time: number, reducedMotion = false) {
    if (disposed || !radius) return { sampled: 0, pending: 0 };
    const start = performance.now();
    uniforms.grassCenter.value.set(x, z);
    uniforms.grassTime.value = time;
    uniforms.grassWind.value = reducedMotion ? 0 : 1;
    const nx = Math.floor(x / 0.5), nz = Math.floor(z / 0.5);
    if (nx !== centerX || nz !== centerZ) {
      centerX = nx; centerZ = nz; remaining = capacity;
    }
    let sampled = 0;
    mesh.instanceMatrix.clearUpdateRanges();
    while (remaining > 0 && sampled < 128 && performance.now() - start < 0.65) {
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
      const allowed = grassFieldAllowed(blade.x, blade.z);
      transform.position.set(blade.x, allowed ? worldHeight(blade.x, blade.z) : 0, blade.z);
      transform.rotation.set(0, blade.yaw, 0);
      transform.scale.setScalar(allowed ? 1 : 0);
      transform.scale.y *= blade.height;
      transform.updateMatrix();
      mesh.setMatrixAt(slot, transform.matrix);
      mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
      sampled++;
    }
    if (sampled) mesh.instanceMatrix.needsUpdate = true;
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
