import { BufferGeometry, Float32BufferAttribute } from "three";
import { waterLevelAt } from "../terrain/height";
import { clampProgress, riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { createWaterSurface, type WaterSurface } from "./surface";

/** Sea datum in terrain/height.ts. Its upstream bed still needs Lead alignment:
 * that file currently adds a sloping riverLevel(z), rather than a constant level.
 */
export const WATER_LEVEL = 0;
export const RIBBON_SEGMENTS = 1024;

export function riverWidthAt(t: number): number {
  return 4 + 6 * clampProgress(t);
}

/** Two vertices per row, UV.x across the ribbon, UV.y downstream in metres. */
export function createRibbonGeometry(segments = RIBBON_SEGMENTS): BufferGeometry {
  if (!Number.isInteger(segments) || segments < 1 || segments > 16384) {
    throw new RangeError("Water ribbon segments must be an integer between 1 and 16384");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const length = riverLength();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const halfWidth = riverWidthAt(t) / 2;
    for (const side of [-1, 1]) {
      positions.push(centre.x - tangent.z * halfWidth * side, waterLevelAt(centre.z),
        centre.z + tangent.x * halfWidth * side);
      normals.push(0, 1, 0);
      uvs.push((side + 1) / 2, t * length);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRiverRibbon(quality: Quality): WaterSurface {
  return createWaterSurface(createRibbonGeometry(), createWaterMaterial(quality));
}
