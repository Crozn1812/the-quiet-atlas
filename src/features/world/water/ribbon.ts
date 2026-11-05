import { BufferGeometry, Float32BufferAttribute } from "three";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { clampProgress, riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { createWaterSurface, type WaterSurface } from "./surface";

/** Sea datum shared with terrain/height.ts. */
export const WATER_LEVEL = 0;
export const RIBBON_SEGMENTS = 1024;

function mouthBlend(t: number): number {
  const progress = Math.max(0, (t - 0.96) / 0.04);
  return progress * progress * (3 - 2 * progress);
}

export function riverWidthAt(t: number): number {
  const progress = clampProgress(t);
  const width = 4 + 6 * progress + 50 * mouthBlend(progress);
  const source = Math.min(1, progress / 0.03);
  const blend = source * source * (3 - 2 * source);
  return width + (0.6 - width) * (1 - blend);
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
  const source = riverPointAt(0);
  const sourceTangent = riverTangentAt(0);
  const sourceHalfWidth = riverWidthAt(0) / 2;
  const sourceBed = Math.min(...[-1, 0, 1].map(side => worldHeight(
    source.x - sourceTangent.z * sourceHalfWidth * side,
    source.z + sourceTangent.x * sourceHalfWidth * side,
  )));
  // Bury the entire cap with 6 cm clearance, then emerge smoothly inside the 4 m spring pool.
  const sourceSink = Math.max(0, waterLevelAt(source.z) - sourceBed + 0.06);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const halfWidth = riverWidthAt(t) / 2;
    const emergence = Math.min(1, t * length / 4);
    const sink = sourceSink * (1 - emergence * emergence * (3 - 2 * emergence));
    const level = waterLevelAt(centre.z) - 0.05 * mouthBlend(t) - sink;
    for (const side of [-1, 1]) {
      positions.push(centre.x - tangent.z * halfWidth * side, level,
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
