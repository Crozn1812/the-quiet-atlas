// Lead (batch 25): the gameplay camera used to clip at 100 m, so Duy's coast (sea horizon, the B2-173 peak, far
// ridges) never reached the screen. This is one coarse, shadowless mesh of the whole landscape, coloured by the same
// tile colouring, sunk slightly below the streamed detail terrain so the near tiles always win.
import { BufferAttribute, BufferGeometry, Color, Mesh, type Material } from "three";
import { hex } from "../art/palette";
import { foliageBiomeAt } from "../foliage/scatter";
import { nearestRiver } from "../terrain/samples";
import { createRampMaterial, RAMP_PRESETS, RAMP_STEPS } from "../materials/ramp";
import { worldHeight } from "../terrain/height";
import { createTileMesh } from "../terrain/mesh";

export const FAR_LANDSCAPE = Object.freeze({
  /** World-space minimum corner and edge length (m): the route spans x ±63, z −900…0; the bay, cape and peaks
   * sit inside this square with room for the horizon ridges. */
  originX: -1024,
  originZ: -1600,
  size: 2048,
  cells: 160,
  /** Sink below the detail tiles (and polygon offset) so the two surfaces never fight. */
  sink: 0.6,
});

/** Camera far plane per quality: Low keeps the old short view plus a margin; High shows the whole coast. */
export const GAMEPLAY_FAR = Object.freeze({ Low: 260, Balanced: 500, High: 800 });

const canopyDeep = new Color(hex("forestDeep"));
const canopyLight = new Color(hex("forestLight"));
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
      if (forested <= 0 || nearestRiver(wx, wz).distance < 14) continue;
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
