import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverWidthAt, waterLevelAt, worldHeight } from "../terrain/height";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { createWaterSurface, type WaterSurface } from "./surface";
import { SEA_INLAND_OVERLAP } from "./bounds";

/** Sea datum shared with terrain/height.ts. */
export const WATER_LEVEL = 0;
export const RIBBON_SEGMENTS = 1024;

function mouthBlend(t: number): number {
  const progress = Math.max(0, (t - 0.96) / 0.04);
  return progress * progress * (3 - 2 * progress);
}

/** Only the final reach may hand its surface to the sea. The sea quad also
 * extends behind inland reaches, where a z-only test would erase the stream. */
function estuaryJoinT(): number {
  const near = riverPointAt(1).z + SEA_INLAND_OVERLAP;
  for (let row = 0; row <= 256; row++) {
    const t = 0.95 + 0.05 * row / 256;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    // Probe beyond the carved channel: its submerged bed alone does not mean
    // open sea. A bank disappearing is the first lateral opening to the coast.
    const bank = riverWidthAt(t) / 2 + 3;
    for (const offset of [-bank, bank]) {
      const x = centre.x - tangent.z * offset;
      const z = centre.z + tangent.x * offset;
      if (z <= near && worldHeight(x, z) < WATER_LEVEL) return t;
    }
  }
  return 1;
}

export { riverWidthAt } from "../terrain/height";

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
  const join = estuaryJoinT();
  const blendStart = Math.max(0.95, join - 16 / length);
  const blendEnd = Math.max(blendStart + 0.00001, join - 2 / length);
  // Explicit transition rows keep even coarse ribbons from spanning the join
  // with a triangle that is still above the sea. Upstream rows are untouched.
  const rows = [...new Set([
    ...Array.from({ length: segments + 1 }, (_, i) => i / segments),
    ...(length / segments > 2 ? [blendStart, blendEnd] : []),
  ])].sort((a, b) => a - b);
  const source = riverPointAt(0);
  const sourceTangent = riverTangentAt(0);
  const sourceHalfWidth = riverWidthAt(0) / 2;
  const sourceBed = Math.min(...[-1, 0, 1].map(side => worldHeight(
    source.x - sourceTangent.z * sourceHalfWidth * side,
    source.z + sourceTangent.x * sourceHalfWidth * side,
  )));
  // Bury the entire cap with 6 cm clearance, then emerge smoothly inside the 4 m spring pool.
  const sourceSink = Math.max(0, waterLevelAt(source.z) - sourceBed + 0.06);
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i]!;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const halfWidth = riverWidthAt(t) / 2;
    const emergence = Math.min(1, t * length / 4);
    const sink = sourceSink * (1 - emergence * emergence * (3 - 2 * emergence));
    const originalLevel = waterLevelAt(centre.z) - 0.05 * mouthBlend(t) - sink;
    const blend = Math.max(0, Math.min(1, (t - blendStart) / (blendEnd - blendStart)));
    const level = originalLevel + (Math.min(originalLevel, WATER_LEVEL - 0.05) - originalLevel)
      * blend * blend * (3 - 2 * blend);
    for (const side of [-1, 1]) {
      positions.push(centre.x - tangent.z * halfWidth * side, level,
        centre.z + tangent.x * halfWidth * side);
      normals.push(0, 1, 0);
      uvs.push((side + 1) / 2, t * length);
    }
    if (i < rows.length - 1) {
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
