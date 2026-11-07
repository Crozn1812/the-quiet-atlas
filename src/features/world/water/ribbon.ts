import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverWidthAt, waterLevelAt, worldHeight } from "../terrain/height";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { SEA_INLAND_OVERLAP } from "./bounds";
import { createWaterSurface, type WaterSurface } from "./surface";

/** Sea datum shared with terrain/height.ts. */
export const WATER_LEVEL = 0;
export const RIBBON_SEGMENTS = 1024;

/** End before either bank can overdraw the sea's inland edge. */
export function riverSeaJoinT(): number {
  const near = riverPointAt(1).z + SEA_INLAND_OVERLAP;
  let upstream = 0, downstream = 1;
  for (let i = 0; i < 40; i++) {
    const t = (upstream + downstream) / 2;
    const centre = riverPointAt(t);
    const bankZ = Math.abs(riverTangentAt(t).x) * riverWidthAt(t) / 2;
    if (centre.z - bankZ > near) upstream = t;
    else downstream = t;
  }
  return upstream;
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
  const endT = riverSeaJoinT();
  const near = riverPointAt(1).z + SEA_INLAND_OVERLAP;
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
    const t = i / segments * endT;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const halfWidth = riverWidthAt(t) / 2;
    const emergence = Math.min(1, t * length / 4);
    const sink = sourceSink * (1 - emergence * emergence * (3 - 2 * emergence));
    // Ease down during the final 16 m; the sea owns all of the overlap.
    const remaining = (endT - t) * length;
    const blend = Math.min(1, remaining / 16);
    const level = waterLevelAt(centre.z) * blend * blend * (3 - 2 * blend) - sink;
    for (const side of [-1, 1]) {
      positions.push(centre.x - tangent.z * halfWidth * side, level,
        i === segments ? near : centre.z + tangent.x * halfWidth * side);
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
