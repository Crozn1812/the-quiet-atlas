import { BufferGeometry, Float32BufferAttribute } from "three";
import { riverLength, riverPointAt } from "../layout/river";
import type { Quality } from "../terrain";
import { worldHeight } from "../terrain/height";
import { createWaterMaterial, SEA_SHORE_SAMPLES, type WaterMaterialOptions } from "./material";
import { WATER_LEVEL } from "./ribbon";
import { SEA_INLAND_OVERLAP } from "./bounds";
import { createWaterSurface, type WaterSurface } from "./surface";
import { createSurf } from "../shore/surf";

export const SEA_SIZE = 800;
/** Render coverage exceeds the 2 km cinematic view; shore sampling keeps its original 800 m span. */
export const SEA_RENDER_SIZE = 6000;
// 250 m: B2-152b's bay reaches z ≈ −680 (mouth −900). Land north of it is above sea level, so the plane stays hidden.
export { SEA_INLAND_OVERLAP } from "./bounds";

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

/** Reject secants across a submerged inlet or the far side of a headland.
 * A one-dimensional coast is only trusted where it follows a real zero crossing. */
function shoreValidity(left: number, near: number, shore: readonly number[]): number[] {
  const spacing = SEA_SIZE / (SEA_SHORE_SAMPLES - 1);
  return shore.map((z, i) => {
    if (i === shore.length - 1 || z > near || shore[i + 1]! > near) return 0;
    for (let j = 0; j <= 16; j++) {
      const t = j / 16;
      const x = left + (i + t) * spacing;
      const height = worldHeight(x, z + (shore[i + 1]! - z) * t);
      if (Math.abs(height) > 0.08) return 0;
    }
    return 1;
  });
}

/** Hide the near edge beneath land; the terrain/sea intersection draws the shore. */
export function createSea(quality: Quality, options: Pick<WaterMaterialOptions, "sunDirection"> = {}): WaterSurface {
  const mouth = riverPointAt(1);
  const shoreLeft = mouth.x - SEA_SIZE / 2;
  const left = mouth.x - SEA_RENDER_SIZE / 2;
  const right = mouth.x + SEA_RENDER_SIZE / 2;
  const far = mouth.z - SEA_RENDER_SIZE;
  const near = mouth.z + SEA_INLAND_OVERLAP;
  const distance = riverLength();
  const shore = sampleShoreline(shoreLeft, near);
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
  const surface = createWaterSurface(geometry, createWaterMaterial(quality, {
    ...options, surface: "sea", skyMix: 1,
    shoreline: { minX: shoreLeft, width: SEA_SIZE, z: shore, valid: shoreValidity(shoreLeft, near, shore) },
  }));
  const surf = createSurf(() => surface.mesh.material);
  surface.mesh.add(surf.mesh);
  return { ...surface, dispose() { surf.dispose(); surface.dispose(); } };
}
