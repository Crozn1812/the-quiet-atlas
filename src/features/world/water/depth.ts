import { Float32BufferAttribute, type BufferGeometry } from "three";
import { createSurfaceSampler } from "../terrain/height";

/** Bake once against the rendered terrain, never query the heightfield per frame.
 * Ribbon rows carry left/centre/right depths so the two-vertex strip can still
 * reveal its bed in the middle. Other surfaces interpolate vertex depths.
 */
export function bakeWaterDepth(geometry: BufferGeometry, ribbon = false, height = createSurfaceSampler()): void {
  const positions = geometry.getAttribute("position");
  const depths = new Float32Array(positions.count * 3);
  const depthAt = (x: number, y: number, z: number) => Math.max(0, y - height(x, z));
  if (ribbon) {
    for (let i = 0; i < positions.count; i += 2) {
      const left = depthAt(positions.getX(i), positions.getY(i), positions.getZ(i));
      const right = depthAt(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
      const centre = depthAt((positions.getX(i) + positions.getX(i + 1)) / 2,
        positions.getY(i), (positions.getZ(i) + positions.getZ(i + 1)) / 2);
      depths.set([left, centre, right, left, centre, right], i * 3);
    }
  } else {
    for (let i = 0; i < positions.count; i++) {
      const depth = depthAt(positions.getX(i), positions.getY(i), positions.getZ(i));
      depths.fill(depth, i * 3, i * 3 + 3);
    }
  }
  geometry.setAttribute("waterBedDepth", new Float32BufferAttribute(depths, 3));
}
