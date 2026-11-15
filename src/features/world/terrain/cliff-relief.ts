import { BufferGeometry, Float32BufferAttribute, Matrix3, Mesh, Vector3 } from "three";
import { nearestPath } from "./samples";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function cliffRandom(x: number, z: number) {
  let n = Math.imul(Math.floor(x * 97), 374761393) ^ Math.imul(Math.floor(z * 97), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy), fz = smooth(0, 1, z - iz);
  let sum = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    sum += cliffRandom(ix + a + (iy + b) * 113, iz + c)
      * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz);
  }
  return sum;
}

/** Positive, outward-only visual relief. Heights and gameplay triangles stay intact. */
export function cliffRelief(x: number, y: number, z: number) {
  const broad = noise(x * .22, y * .18, z * .22);
  const bed = y * .43 + noise(x * .22, 0, z * .22) * .65;
  const shelf = Math.pow(.5 + .5 * Math.sin(bed * Math.PI * 2), 3);
  return .018 + broad * .3 + noise(x * .7, y * .55, z * .7) * .07
    + shelf * .08 + noise(x * 3.1, y * 2, z * 3.1) * .012;
}

/** Short, interrupted mineral shelves. Broad periodic recesses used to turn
 * the wall into metre-wide rounded waves under its interpolated normals. */
export function springCliffRelief(x: number, y: number, z: number) {
  const broad = noise(x * .12, y * .09, z * .12);
  const bed = y / .72 + noise(x * .6, y * .3, z * .6) * 1.4 + x * .06 + z * .04;
  const phase = bed - Math.floor(bed);
  const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (phase - a) / (b - a)));
  const recess = ramp(.04, .14) * (1 - ramp(.32, .99));
  const exposure = smooth(.24, .68, noise(x * .28, y * .21, z * .28));
  const joint = 1 - smooth(.025, .105, Math.abs(noise(x * .46, y * .035, z * .46) - .49));
  return .12 - recess * (.06 + exposure * .16) - broad * .18 - joint * .16
    - noise(x * 1.3, y * .8, z * 1.3) * .07;
}

/** Only the decorative GLB moves vertically. The terrain and all solids retain Y. */
function crestErosion(x: number, y: number, z: number) {
  return -smooth(9, 18, y) * (.2 + noise(x * .24, 0, z * .24) * 1.3
    + noise(x * .65, 0, z * .65) * .25);
}

function floatPositions(geometry: BufferGeometry) {
  let p = geometry.getAttribute("position");
  if (!(p.array instanceof Float32Array) || p.normalized) {
    const decoded = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) decoded.set([p.getX(i), p.getY(i), p.getZ(i)], i * 3);
    p = new Float32BufferAttribute(decoded, 3); geometry.setAttribute("position", p);
  }
  return p;
}

/** Keep the GLB's attached crest saplings/ferns rooted after carving its rock.
 * This touches the cliff asset only, never the world foliage owners. */
export function erodeSpringCliffPlants(mesh: Mesh) {
  if (mesh.geometry.userData.terrainCliffRelief) return;
  mesh.geometry.userData.terrainCliffRelief = true;
  mesh.updateWorldMatrix(true, false);
  const p = floatPositions(mesh.geometry), inverse = mesh.matrixWorld.clone().invert(), world = new Vector3();
  for (let i = 0; i < p.count; i++) {
    world.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    world.y += crestErosion(world.x, world.y, world.z) * smooth(4.5, 8, nearestPath(world.x, world.z).distance);
    world.applyMatrix4(inverse); p.setXYZ(i, world.x, world.y, world.z);
  }
  p.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
}

/** Subdivide only steep triangles into a separate, raycast-free visual skin.
 * Every attribute is barycentrically interpolated, preserving biome/water masks.
 */
export function createTerrainCliffRelief(mesh: Mesh): BufferGeometry | undefined {
  const source = mesh.geometry, position = source.getAttribute("position"), normal = source.getAttribute("normal");
  const mask = source.getAttribute("cliffSurface");
  if (!position || !normal || !mask || !source.index) return;
  const attributes = Object.entries(source.attributes);
  const arrays = attributes.map(() => [] as number[]);
  const n = new Vector3(), p = new Vector3();
  const divisions = 4;
  const emit = (ids: number[], u: number, v: number) => {
    const weights = [1 - u - v, u, v];
    const values = attributes.map(([, attribute]) => Array.from({ length: attribute.itemSize }, (_, c) =>
      ids.reduce((sum, id, j) => sum + attribute.getComponent(id, c) * weights[j]!, 0)));
    p.fromArray(values[attributes.findIndex(([name]) => name === "position")]!);
    n.fromArray(values[attributes.findIndex(([name]) => name === "normal")]!).normalize();
    const gate = values[attributes.findIndex(([name]) => name === "cliffSurface")]![1]!;
    const relief = cliffRelief(p.x + mesh.position.x, p.y + mesh.position.y, p.z + mesh.position.z)
      * (1 - smooth(.63, .83, n.y)) * gate;
    // Horizontal offset only: neither the heightfield nor its Y coordinates change.
    p.x += n.x * relief; p.z += n.z * relief;
    values[attributes.findIndex(([name]) => name === "position")] = p.toArray();
    values.forEach((value, i) => arrays[i]!.push(...value));
  };
  for (let i = 0; i < source.index.count; i += 3) {
    const ids = [0, 1, 2].map(j => source.index!.getX(i + j));
    if (!ids.some(id => normal.getY(id) < .8 && mask.getY(id) > .1)) continue;
    for (let u = 0; u < divisions; u++) for (let v = 0; v < divisions - u; v++) {
      emit(ids, u / divisions, v / divisions);
      emit(ids, (u + 1) / divisions, v / divisions);
      emit(ids, u / divisions, (v + 1) / divisions);
      if (u + v < divisions - 1) {
        emit(ids, (u + 1) / divisions, v / divisions);
        emit(ids, (u + 1) / divisions, (v + 1) / divisions);
        emit(ids, u / divisions, (v + 1) / divisions);
      }
    }
  }
  if (!arrays[0]!.length) return;
  const raw = new BufferGeometry();
  attributes.forEach(([name, attribute], i) => raw.setAttribute(name, new Float32BufferAttribute(arrays[i]!, attribute.itemSize)));
  // Merge before recomputing normals to avoid a flat triangle mosaic.
  const geometry = mergeVertices(raw); raw.dispose(); geometry.computeVertexNormals();
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  return geometry;
}

/** GLB geometry may use normalized coordinates; sculpt in world metres. */
export function sculptSpringCliff(mesh: Mesh) {
  const geometry = mesh.geometry;
  if (geometry.userData.terrainCliffRelief) return;
  geometry.userData.terrainCliffRelief = true;
  mesh.updateWorldMatrix(true, false);
  const p = floatPositions(geometry);
  const normal = geometry.getAttribute("normal");
  const world = new Vector3(), n = new Vector3(), local = new Vector3();
  const gradient = new Vector3(), adjusted = new Vector3();
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld), toLocalNormal = normalMatrix.clone().invert();
  const smoothNormals = new Float32Array(normal.count * 3);
  const inverse = mesh.matrixWorld.clone().invert();
  // UV/hard-normal seams duplicate positions. A displacement based on each
  // separate face normal tears the closed cap into fins. Weld only the motion
  // direction, preserving the asset's indices, UVs and vertex/triangle count.
  const directions = new Map<string, Vector3>();
  const keys = Array.from({ length: p.count }, (_, i) => {
    const key = `${Math.round(p.getX(i) * 1e5)}:${Math.round(p.getY(i) * 1e5)}:${Math.round(p.getZ(i) * 1e5)}`;
    n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    const existing = directions.get(key);
    if (existing) existing.add(n); else directions.set(key, n.clone());
    return key;
  });
  for (const direction of directions.values()) direction.normalize();
  // The scan's grain normals must not move metre-sized rock. Filter them in
  // world space first; otherwise adjacent cap vertices become alternating fins.
  const normalGrid = new Map<string, Vector3>(), visited = new Set<string>();
  const cell = 1.5;
  for (let i = 0; i < p.count; i++) {
    if (visited.has(keys[i]!)) continue; visited.add(keys[i]!);
    world.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    const key = `${Math.floor(world.x / cell)}:${Math.floor(world.y / cell)}:${Math.floor(world.z / cell)}`;
    const previous = normalGrid.get(key), direction = directions.get(keys[i]!)!;
    if (previous) previous.add(direction); else normalGrid.set(key, direction.clone());
  }
  for (const direction of normalGrid.values()) direction.normalize();
  const filtered = new Vector3();
  for (let i = 0; i < p.count; i++) {
    world.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    n.copy(directions.get(keys[i]!)!);
    const gx = world.x / cell - .5, gy = world.y / cell - .5, gz = world.z / cell - .5;
    const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
    const fx = smooth(0, 1, gx - ix), fy = smooth(0, 1, gy - iy), fz = smooth(0, 1, gz - iz);
    filtered.set(0, 0, 0);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const direction = normalGrid.get(`${ix + a}:${iy + b}:${iz + c}`);
      if (direction && direction.dot(n) > -.4) filtered.addScaledVector(direction,
        (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz));
    }
    if (filtered.lengthSq() > .0001) n.copy(filtered).normalize();
    const route = smooth(4.5, 8, nearestPath(world.x, world.z).distance);
    const weight = (1 - smooth(.15, .45, Math.abs(n.y))) * smooth(7.5, 10, world.y)
      * route;
    // Differentiate the continuous metre-space relief rather than averaging
    // triangles across quantized UV seams. Broad ledges now receive real light.
    const e = .06, { x, y, z } = world;
    gradient.set(springCliffRelief(x + e, y, z) - springCliffRelief(x - e, y, z),
      springCliffRelief(x, y + e, z) - springCliffRelief(x, y - e, z),
      springCliffRelief(x, y, z + e) - springCliffRelief(x, y, z - e)).multiplyScalar(weight / (2 * e));
    gradient.addScaledVector(n, -gradient.dot(n));
    adjusted.copy(n).sub(gradient).normalize().applyMatrix3(toLocalNormal).normalize();
    smoothNormals.set(adjusted.toArray(), i * 3);
    const relief = springCliffRelief(world.x, world.y, world.z) * weight;
    world.x += n.x * relief; world.z += n.z * relief;
    world.y += crestErosion(x, y, z) * route;
    local.copy(world).applyMatrix4(inverse); p.setXYZ(i, local.x, local.y, local.z);
  }
  p.needsUpdate = true;
  // Meshopt GLBs carry quantized Int8 normals. Accumulating tiny normalized-space
  // face vectors into that buffer rounds them to zero and poisons PBR lighting.
  // Lift the smooth derivative normal into Float32; retain UV seam continuity.
  geometry.setAttribute("normal", new Float32BufferAttribute(smoothNormals, 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}
