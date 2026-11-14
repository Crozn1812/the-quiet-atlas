import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGFormat } from "three";
import type { Quality } from "../terrain";

const normalData = new Map<number, Uint8Array>();
const modes = Array.from({ length: 24 }, (_, i) => {
  const angle = i * 2.3999632297 + 0.4;
  const frequency = 2 * Math.pow(1.15, i);
  return [Math.round(Math.cos(angle) * frequency), Math.round(Math.sin(angle) * frequency),
    0.07 * Math.pow(0.95, i), (i * 1.61803398875 % 1) * Math.PI * 2] as const;
});

/** Authored periodic slope spectrum, not a downloaded image. Allocated only with
 * the deferred sea material; no fetch, canvas, or per-frame texture uploads. */
export function createSeaNormal(quality: Quality): DataTexture | undefined {
  if (quality === "Low") return;
  const size = quality === "High" ? 512 : 256;
  let data = normalData.get(size);
  if (!data) {
    data = new Uint8Array(size * size * 2);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sx = 0, sz = 0;
      for (const [kx, kz, amplitude, phase] of modes) {
        const wave = Math.cos(2 * Math.PI * (kx * x + kz * y) / size + phase) * amplitude;
        const length = Math.hypot(kx, kz);
        sx += wave * kx / length;
        sz += wave * kz / length;
      }
      const index = (y * size + x) * 2;
      data[index] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, sx * 1.7)));
      data[index + 1] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, sz * 1.7)));
    }
    // Share immutable CPU pixels across live quality swaps, not GPU ownership.
    normalData.set(size, data);
  }
  const texture = new DataTexture(data, size, size, RGFormat);
  texture.name = "sea-multiscale-slopes";
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export const SEA_OPTICS_GLSL = /* glsl */ `
  #ifdef SEA_NORMAL
    uniform sampler2D uSeaNormal;
  #endif
  // Slopes remain in world metres so camera rotation never rotates the waves.
  vec2 seaSlopes(vec2 p, float time) {
    float swellFilter = 1.0 - smoothstep(0.3, 4.0, length(fwidth(p)));
    vec2 slopes = (vec2(0.045, 0.025) * cos(dot(p, vec2(0.16, 0.09)) - time * 0.62
        + 0.7 * sin(dot(p, vec2(0.031, -0.043))))
      + vec2(-0.018, 0.035) * cos(dot(p, vec2(-0.11, 0.21)) - time * 0.48
        + 0.8 * sin(dot(p, vec2(0.023, 0.017))))) * swellFilter;
    #ifdef SEA_NORMAL
      slopes *= 0.4;
      vec2 drift = vec2(time * 0.007, -time * 0.011);
      slopes += (texture2D(uSeaNormal, p / 19.0 + drift).rg * 2.0 - 1.0) * 0.16;
      slopes += (texture2D(uSeaNormal, vec2(-p.y, p.x) / 7.3 - drift * 0.73).rg * 2.0 - 1.0) * 0.075;
      #ifdef WATER_RIPPLES
        slopes += (texture2D(uSeaNormal, p / 2.1 + drift * 1.37).rg * 2.0 - 1.0) * 0.035;
      #endif
    #endif
    return slopes;
  }
  // Finite slope distribution for the low sun: resolves many small glints near
  // the camera and averages to a soft golden path for distant subpixel waves.
  float seaGlitter(float halfAcross, float halfAlong, float variance, float facing) {
    float distribution = exp(-(halfAcross * halfAcross / (variance * 0.48)
      + halfAlong * halfAlong / (variance * 2.4)));
    return distribution * facing;
  }
  float seaMist(float distanceToEye, float viewElevation) {
    return (1.0 - exp(-distanceToEye * 0.00048))
      * (1.0 - smoothstep(0.02, 0.24, viewElevation));
  }
`;
