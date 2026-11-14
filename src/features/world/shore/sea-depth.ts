import { DataTexture, LinearFilter, RGFormat, Vector2, Vector4 } from "three";
import { riverLength, riverPointAt } from "../layout/river";
import { createSurfaceSampler, riverWidthAt } from "../terrain/height";
import { nearestRiver } from "../terrain/samples";
import { SEA_INLAND_OVERLAP } from "../water/bounds";

export interface SeaDepthField {
  texture: DataTexture;
  /** x/z origin and width/length, in world metres. */
  bounds: Vector4;
  size: Vector2;
}

const smoothstep = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
let cached: Uint8Array | undefined;

/** Static 2 m lattice sampled on the rendered heightfield, like stream depth.
 * R encodes signed -1..3 m depth; G keeps the inland stream out of the sea draw.
 * Pixels are immutable/shared; each surface owns and disposes its GPU texture.
 */
export function createSeaDepth(): SeaDepthField {
  const mouth = riverPointAt(1);
  const bounds = new Vector4(mouth.x - 600, mouth.z - 600, 1200, 600 + SEA_INLAND_OVERLAP);
  const size = new Vector2(bounds.z / 2 + 1, bounds.w / 2 + 1);
  if (!cached) {
    const height = createSurfaceSampler(), length = riverLength();
    const data = new Uint8Array(size.x * size.y * 2);
    for (let row = 0; row < size.y; row++) for (let column = 0; column < size.x; column++) {
      const x = bounds.x + column * 2, z = bounds.y + row * 2;
      const river = nearestRiver(x, z);
      // A lateral opening of the bay is not the stream mouth. Preserve the
      // ribbon all the way to its final reach, even where it sits below sea Y.
      const seaBlend = smoothstep(1 - 16 / length, 1 - 2 / length, river.t);
      const halfWidth = riverWidthAt(river.t) / 2;
      const outsideStream = smoothstep(Math.max(0, halfWidth - 2), halfWidth, river.distance);
      const index = (row * size.x + column) * 2;
      data[index] = Math.round(Math.max(0, Math.min(1, (1 - height(x, z)) / 4)) * 255);
      data[index + 1] = Math.round((seaBlend + (1 - seaBlend) * outsideStream) * 255);
    }
    cached = data;
  }
  const texture = new DataTexture(cached, size.x, size.y, RGFormat);
  texture.name = "sea-terrain-depth-coverage";
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return { texture, bounds, size };
}

export const SEA_DEPTH_GLSL = /* glsl */ `
  #ifdef SEA_DEPTH
    uniform sampler2D uSeaDepth;
    uniform vec4 uSeaDepthBounds;
    uniform vec2 uSeaDepthSize;
  #endif
  float seaShallows(float depth) {
    // The authored seabed levels off at 2.5 m. Join that shelf continuously
    // to offshore pigment, without a coastline/secant or a quad-edge mask.
    return 1.0 - smoothstep(0.05, 2.5, max(depth, 0.0));
  }
`;
