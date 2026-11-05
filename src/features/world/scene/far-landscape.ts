// Lead (batch 25): the gameplay camera used to clip at 100 m, so Duy's coast (sea horizon, the B2-173 peak, far
// ridges) never reached the screen. This is one coarse, shadowless mesh of the whole landscape, coloured by the same
// tile colouring, sunk slightly below the streamed detail terrain so the near tiles always win.
import { BufferGeometry, Color, Mesh, type Material } from "three";
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

/**
 * Trees only stream along the path, so far slopes would read as bare lawn. Where the scatter grows forest (the
 * forest biome, and the wooded coastal ridge above the beach) the far mesh takes a broken canopy colour instead.
 * Cliffs keep their rock, water and beach keep theirs.
 */
function paintFarCanopy(geometry: BufferGeometry, heights: Float32Array) {
  const { originX, originZ, size, cells } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const colors = geometry.getAttribute("color");
  const canopy = new Color();
  const ground = new Color();
  for (let x = 0; x <= cells; x++) for (let z = 0; z <= cells; z++) {
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
    canopy.copy(canopyDeep).lerp(canopyLight, 0.25 + 0.35 * speckle);
    ground.fromBufferAttribute(colors, vertex).lerp(canopy, forested * (1 - steep) * 0.85);
    colors.setXYZ(vertex, ground.r, ground.g, ground.b);
  }
  colors.needsUpdate = true;
}

export function createFarLandscape(): { mesh: Mesh<BufferGeometry, Material>; dispose(): void } {
  const { originX, originZ, size, cells, sink } = FAR_LANDSCAPE;
  const stride = cells + 1;
  const step = size / cells;
  const heights = new Float32Array(stride * stride);
  for (let x = 0; x <= cells; x++) for (let z = 0; z <= cells; z++) {
    heights[z + x * stride] = worldHeight(originX + x * step, originZ + z * step);
  }
  const material = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
  material.color.setRGB(1, 1, 1);
  material.polygonOffset = true;
  material.polygonOffsetFactor = 2;
  material.polygonOffsetUnits = 4;
  // Colour at true height (shore bands stay right), then sink the whole mesh.
  const mesh = createTileMesh({ cells, size, heights, origin: { x: originX, y: 0, z: originZ } }, material);
  mesh.position.y -= sink;
  paintFarCanopy(mesh.geometry, heights);
  mesh.name = "far-landscape";
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  // Visual only: never a walking surface, camera obstacle or interaction target.
  mesh.raycast = () => {};
  mesh.updateMatrixWorld(true);
  let disposed = false;
  return {
    mesh,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
