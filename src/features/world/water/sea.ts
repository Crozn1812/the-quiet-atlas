import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverLength, riverPointAt } from "../layout/river";
import type { Quality } from "../terrain";
import { worldHeight } from "../terrain/height";
import { createWaterMaterial, SEA_SHORE_SAMPLES, type WaterMaterialOptions } from "./material";
import { WATER_LEVEL } from "./ribbon";
import { createWaterSurface, type WaterSurface } from "./surface";

export const SEA_SIZE = 800;
// 250 m: B2-152b's bay reaches z ≈ −680 (mouth −900). Land north of it is above sea level, so the plane stays hidden.
export const SEA_INLAND_OVERLAP = 250;

/** Static terrain samples, uploaded as uniforms once; no extra geometry or texture. */
function sampleShoreline(left: number, near: number): number[] {
  return Array.from({ length: SEA_SHORE_SAMPLES }, (_, i) => {
    const x = left + i * SEA_SIZE / (SEA_SHORE_SAMPLES - 1);
    let sea = near - SEA_INLAND_OVERLAP * 4;
    let land = sea;
    // The first crossing preserves the Last Postcard headland as well as the beach.
    while (land < near && worldHeight(x, land) < WATER_LEVEL) land += 2;
    // Leave the estuary open: no fictitious foam line across a submerged channel.
    if (worldHeight(x, land) < WATER_LEVEL) return near + 16;
    sea = land - 2;
    for (let step = 0; step < 12; step++) {
      const middle = (sea + land) / 2;
      if (worldHeight(x, middle) < WATER_LEVEL) sea = middle;
      else land = middle;
    }
    return (sea + land) / 2;
  });
}

/** Hide the near edge beneath land; the terrain/sea intersection draws the shore. */
export function createSea(quality: Quality, options: Pick<WaterMaterialOptions, "sunDirection"> = {}): WaterSurface {
  const mouth = riverPointAt(1);
  const left = mouth.x - SEA_SIZE / 2;
  const right = mouth.x + SEA_SIZE / 2;
  const far = mouth.z - SEA_SIZE;
  const near = mouth.z + SEA_INLAND_OVERLAP;
  const distance = riverLength();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    left, WATER_LEVEL, near, right, WATER_LEVEL, near,
    left, WATER_LEVEL, far, right, WATER_LEVEL, far,
  ], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([
    0, distance - SEA_INLAND_OVERLAP, 1, distance - SEA_INLAND_OVERLAP,
    0, distance + SEA_SIZE, 1, distance + SEA_SIZE,
  ], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return createWaterSurface(geometry, createWaterMaterial(quality, {
    ...options, surface: "sea", skyMix: 1,
    shoreline: { minX: left, width: SEA_SIZE, z: sampleShoreline(left, near) },
  }));
}
