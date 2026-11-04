import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverLength, riverPointAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { WATER_LEVEL } from "./ribbon";
import { createWaterSurface, type WaterSurface } from "./surface";

export const SEA_SIZE = 800;
export const SEA_INLAND_OVERLAP = 80;

/** Hide the near edge beneath land; the terrain/sea intersection draws the shore. */
export function createSea(quality: Quality): WaterSurface {
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
  return createWaterSurface(geometry, createWaterMaterial(quality, { surface: "sea", skyMix: 1 }));
}
