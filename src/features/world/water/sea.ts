import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverLength, riverPointAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { WATER_LEVEL } from "./ribbon";
import { createWaterSurface, type WaterSurface } from "./surface";

export const SEA_SIZE = 800;

/** The near edge meets the river mouth; the plane extends offshore into coast-dusk. */
export function createSea(quality: Quality): WaterSurface {
  const mouth = riverPointAt(1);
  const left = mouth.x - SEA_SIZE / 2;
  const right = mouth.x + SEA_SIZE / 2;
  const far = mouth.z - SEA_SIZE;
  const distance = riverLength();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    left, WATER_LEVEL, mouth.z, right, WATER_LEVEL, mouth.z,
    left, WATER_LEVEL, far, right, WATER_LEVEL, far,
  ], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([
    0, distance, 1, distance, 0, distance + SEA_SIZE, 1, distance + SEA_SIZE,
  ], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return createWaterSurface(geometry, createWaterMaterial(quality, { surface: "sea", skyMix: 1 }));
}
