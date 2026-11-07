// Lead (batch 25): the gameplay camera used to clip at 100 m, so Duy's coast (sea horizon, the B2-173 peak, far
// ridges) never reached the screen. This is one coarse, shadowless mesh of the whole landscape, coloured by the same
// tile colouring. Ground stays below streamed detail; B2-241 adds individual distant dawn crowns.
import { BufferAttribute, BufferGeometry, Color, Mesh, type Material } from "three";
import { hex } from "../art/palette";
import { foliageBiomeAt } from "../foliage/scatter";
import { farCanopyAt, farCrownSeed } from "../foliage/far-canopy";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { createRampMaterial, RAMP_PRESETS, RAMP_STEPS } from "../materials/ramp";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { createTileMesh } from "../terrain/mesh";

export const FAR_LANDSCAPE = Object.freeze({
  /** World-space minimum corner and edge length (m): the route spans x ±63, z −900…0; the bay, cape and peaks
   * sit inside this square with room for the horizon ridges. */
  originX: -1024,
  originZ: -1600,
  size: 2048,
  cells: 160,
  /** Sink ground below detail tiles; individual crowns sit above it. */
  sink: 0.6,
});

/** Camera far plane per quality: Low keeps the old short view plus a margin; High shows the whole coast. */
export const GAMEPLAY_FAR = Object.freeze({ Low: 260, Balanced: 500, High: 800 });

const canopyDeep = new Color(hex("forestDeep"));
const canopyLight = new Color(hex("forestLight"));
const canopyMist = new Color(hex("mist"));
/** B2-239 lifted near forest ground to sunlit moss; the far canopy averages moss and crowns so tile edges stay hidden. */
const canopyMoss = new Color(hex("grass")).lerp(new Color(hex("grassDry")), 0.64);
const FAR_CANOPY_MOSS = 0.8;

/**
 * Trees only stream along the path, so far slopes would read as bare lawn. Where the scatter grows forest (the
 * forest biome, and the wooded coastal ridge above the beach) the far mesh takes a broken canopy colour instead.
 * Cliffs keep their rock, water and beach keep theirs.
 */
function* paintFarCanopy(geometry: BufferGeometry, heights: Float32Array) {
  const { originX, originZ, size, cells } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const colors = geometry.getAttribute("color");
  const canopy = new Color();
  const ground = new Color();
  for (let x = 0; x <= cells; x++) {
    yield;
    for (let z = 0; z <= cells; z++) {
      const vertex = z + x * stride;
      const wx = originX + x * step, wz = originZ + z * step;
      const height = heights[vertex]!;
      const biome = foliageBiomeAt(wx, wz);
      const forested = biome === "forest-dawn" ? 1 : biome === "coast-dusk" ? Math.min(1, Math.max(0, (height - 4) / 6)) : 0.25;
      const riverDistance = nearestRiver(wx, wz).distance;
      if (forested <= 0 || riverDistance < 14) continue;
      const dx = (heights[Math.min(cells, x + 1) * stride + z]! - heights[Math.max(0, x - 1) * stride + z]!) / (2 * step);
      const dz = (heights[x * stride + Math.min(cells, z + 1)]! - heights[x * stride + Math.max(0, z - 1)]!) / (2 * step);
      const steep = Math.min(1, Math.max(0, (Math.hypot(dx, dz) - 0.8) / 0.4));
      const speckle = (Math.sin(wx * 0.37 + wz * 0.11) * Math.sin(wz * 0.29 - wx * 0.07) + 1) / 2;
      canopy.copy(canopyDeep).lerp(canopyLight, 0.25 + 0.35 * speckle).lerp(canopyMoss, FAR_CANOPY_MOSS);
      ground.fromBufferAttribute(colors, vertex).lerp(canopy, forested * (1 - steep) * 0.85);
      colors.setXYZ(vertex, ground.r, ground.g, ground.b);
    }
  }
  colors.needsUpdate = true;
}

/** Trade remote ground interiors for separate crowns in the same draw. Full
 * resolution perimeter vertices keep the coarser ground fans watertight. */
function* addFarCrowns(geometry: BufferGeometry) {
  const { cells, size, originX, originZ } = FAR_LANDSCAPE;
  const stride = cells + 1, step = size / cells;
  const positions = Array.from(geometry.getAttribute("position").array);
  const normals = Array.from(geometry.getAttribute("normal").array);
  const colors = Array.from(geometry.getAttribute("color").array);
  const indices: number[] = [];
  for (let x = 0; x < cells; x += 8) {
    yield;
    for (let z = 0; z < cells; z += 8) {
      const wx = originX + (x + 4) * step, wz = originZ + (z + 4) * step;
      if (nearestPath(wx, wz).distance > 300) {
        const ring: number[] = [];
        for (let i = 0; i < 8; i++) ring.push((x + i) * stride + z);
        for (let i = 0; i < 8; i++) ring.push((x + 8) * stride + z + i);
        for (let i = 0; i < 8; i++) ring.push((x + 8 - i) * stride + z + 8);
        for (let i = 0; i < 8; i++) ring.push(x * stride + z + 8 - i);
        const center = (x + 4) * stride + z + 4;
        for (let i = 0; i < 32; i++) indices.push(center, ring[(i + 1) % 32]!, ring[i]!);
      } else {
        for (let dx = 0; dx < 8; dx++) for (let dz = 0; dz < 8; dz++) {
          const a = (x + dx) * stride + z + dz, b = a + stride;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
  }
  const capacity = Math.floor((cells * cells * 6 - indices.length) / 36);
  let count = 0;
  const color = new Color();
  // World-space lattice, unrelated to tile edges. The crown's alternating rim
  // radii make distinct 6–12 m lobes rather than a connected raised heightfield.
  for (let gx = -32; gx <= 32; gx++) {
    yield;
    for (let gz = -26; gz <= 16; gz++) {
      if (count >= capacity) continue;
      const a = farCrownSeed(gx, gz), b = farCrownSeed(gz + 19, gx - 7);
      const x = gx * 12 + (a - 0.5) * 6, z = gz * 12 + (b - 0.5) * 6;
      if (foliageBiomeAt(x, z) !== "forest-dawn") continue;
      const y = worldHeight(x, z);
      const slope = Math.hypot(worldHeight(x + 2, z) - worldHeight(x - 2, z), worldHeight(x, z + 2) - worldHeight(x, z - 2)) / 4;
      const mask = farCanopyAt(x, z, nearestRiver(x, z).distance, slope);
      const edge = Math.max(0, Math.min(1, Math.min(384 - Math.abs(x), z + 312, 192 - z) / 48));
      const fade = edge * edge * (3 - 2 * edge);
      mask.weight *= fade;
      mask.lift *= fade;
      if (mask.weight < 0.01 || y < waterLevelAt(z) + 1) continue;
      const base = positions.length / 3;
      color.copy(canopyLight).lerp(canopyMoss, 0.3).lerp(canopyMist, 0.12 + a * 0.48);
      positions.push(x - originX, y + mask.lift, z - originZ);
      normals.push(0, 1, 0); colors.push(color.r, color.g, color.b);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6 + b * Math.PI;
        const radius = (i % 2 ? 5.5 : 7 + a * 2) * mask.weight;
        const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
        positions.push(px - originX, worldHeight(px, pz) + mask.lift * (0.6 + 0.12 * (i % 2)), pz - originZ);
        normals.push(Math.cos(angle) * 0.28, 0.96, Math.sin(angle) * 0.28);
        const rim = color.clone().lerp(canopyDeep, 0.1 + (i % 2) * 0.1);
        colors.push(rim.r, rim.g, rim.b);
      }
      for (let i = 0; i < 12; i++) indices.push(base, base + 1 + (i + 1) % 12, base + 1 + i);
      count++;
    }
  }
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.userData.farCrowns = count;
}

/** Same single draw and vertex data as the synchronous terrain factory. Only construction is sliced.
 * Small square patches reuse the terrain painter; they are copied into one mesh, never added to the scene.
 */
export function createFarLandscape({ deferred = false } = {}) {
  const { originX, originZ, size, cells, sink } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const material = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
  material.color.setRGB(1, 1, 1);
  material.polygonOffset = true;
  material.polygonOffsetFactor = 2;
  material.polygonOffsetUnits = 4;
  const geometry = new BufferGeometry();
  const mesh = new Mesh<BufferGeometry, Material>(geometry, material);
  mesh.position.set(originX, -sink, originZ);
  mesh.name = "far-landscape";
  mesh.visible = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  mesh.updateMatrixWorld(true);
  let disposed = false;
  function* construct() {
    const heights = new Float32Array(stride * stride);
    const positions = new Float32Array(heights.length * 3);
    const normals = new Float32Array(positions.length);
    const colors = new Float32Array(positions.length);
    const indices = new Uint16Array(cells * cells * 6);
    for (let x = 0; x <= cells; x++) {
      for (let z = 0; z <= cells; z++) {
        const vertex = z + x * stride;
        heights[vertex] = worldHeight(originX + x * step, originZ + z * step);
        positions.set([x * step, heights[vertex]!, z * step], vertex * 3);
        if (x < cells && z < cells) {
          const next = vertex + stride;
          indices.set([vertex, vertex + 1, next, next, vertex + 1, next + 1], (x * cells + z) * 6);
        }
      }
      yield;
    }
    const patchCells = 4;
    for (let x = 0; x < cells; x += patchCells) for (let z = 0; z < cells; z += patchCells) {
      const patchHeights = new Float32Array((patchCells + 1) ** 2);
      for (let px = 0; px <= patchCells; px++) for (let pz = 0; pz <= patchCells; pz++) {
        patchHeights[pz + px * (patchCells + 1)] = heights[z + pz + (x + px) * stride]!;
      }
      const patch = createTileMesh({ cells: patchCells, size: patchCells * step, heights: patchHeights,
        origin: { x: originX + x * step, y: 0, z: originZ + z * step } }, material).geometry;
      try {
        for (let px = 0; px <= patchCells; px++) for (let pz = 0; pz <= patchCells; pz++) {
          const source = (pz + px * (patchCells + 1)) * 3;
          const target = (z + pz + (x + px) * stride) * 3;
          normals.set(patch.getAttribute("normal").array.subarray(source, source + 3), target);
          colors.set(patch.getAttribute("color").array.subarray(source, source + 3), target);
        }
      } finally { patch.dispose(); }
      yield;
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    yield* paintFarCanopy(geometry, heights);
    yield* addFarCrowns(geometry);
    geometry.computeBoundingBox();
    yield;
    geometry.computeBoundingSphere();
    mesh.visible = true;
  }
  const build = construct();
  if (!deferred) while (!build.next().done) { /* Compatibility for standalone callers. */ }
  return {
    mesh, build,
    dispose() {
      if (disposed) return;
      disposed = true;
      build.return();
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
