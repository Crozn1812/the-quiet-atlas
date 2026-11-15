import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from "three";

/** Original deterministic periodic noise, generated only after the first sky draw. No network asset. */
export function createCloudNoise(size = 64): Data3DTexture {
  const data = new Uint8Array(size ** 3);
  const hash = (x: number, y: number, z: number, period: number) => {
    let n = ((x % period) * 73856093) ^ ((y % period) * 19349663) ^ ((z % period) * 83492791);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, z: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    let value = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      value += hash(ix + dx, iy + dy, iz + dz, period) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    }
    return value;
  };
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value = 0;
    for (let octave = 0; octave < 4; octave++) {
      const frequency = 4 * 2 ** octave;
      value += noise(x / size * frequency, y / size * frequency, z / size * frequency, frequency) * 2 ** (-octave - 1);
    }
    data[x + size * (y + size * z)] = Math.round(value / 0.9375 * 255);
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.name = "sky-original-periodic-density";
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Optical fields, rather than display colours: the same bake can follow the world grade. */
export const CLOUD_VOLUME_FRAGMENT = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D volumeNoise;
  uniform vec3 sunDirection;
  varying vec2 bakeUv;
  const float PI = 3.14159265359;
  float noiseAt(vec3 p) { return texture(volumeNoise, p / 8.0).r; }
  float densityAt(vec3 p) {
    float h = p.y - 1.0;
    if (h <= 0.0 || h >= 1.6) return 0.0;
    // Weather varies more slowly than the billows. Condensation has a shallow,
    // cool flat base, but its top and sides erode at three independent scales.
    float weather = noiseAt(vec3(p.x * 0.18 + 3.1, 1.7, p.z * 0.18 - 2.4));
    float billow = noiseAt(p * vec3(2.4, 1.7, 2.4) + vec3(4.7, 0.0, 1.8));
    float top = 0.38 + 1.1 * smoothstep(0.36, 0.72, weather);
    float profile = 1.0 - smoothstep(top * 0.28, top, h);
    float erosion = noiseAt(p * 13.7 + 5.3);
    float field = billow - 0.50 + (weather - 0.5) * 0.65;
    field += (noiseAt(p * 7.3 + 2.7) - 0.5) * 0.22;
    field -= (1.0 - profile) * 0.30 + (1.0 - erosion) * 0.16;
    return max(0.0, field) * smoothstep(0.0, 0.045, h) * 22.0;
  }
  vec4 marchCloud(vec3 ray) {
    if (ray.y <= 0.015) return vec4(0.0);
    float start = 1.0 / ray.y;
    float lengthInLayer = min(1.6 / ray.y, 18.0);
    float stepLength = lengthInLayer / 96.0;
    // Stable stratified quadrature breaks marching bands at shallow elevation.
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float transmittance = 1.0;
    float light = 0.0;
    float height = 0.0;
    for (int i = 0; i < 96; i++) {
      vec3 p = ray * (start + (float(i) + jitter) * stepLength);
      float density = densityAt(p);
      if (density > 0.001) {
        // Three expanding cone taps integrate self-shadow toward the world's sun.
        float opticalDepth = densityAt(p + sunDirection * 0.16) * 0.24;
        opticalDepth += densityAt(p + sunDirection * 0.48) * 0.48;
        opticalDepth += densityAt(p + sunDirection * 1.12) * 0.8;
        float sun = exp(-opticalDepth * 3.2);
        float alpha = 1.0 - exp(-density * stepLength * 5.0);
        float weight = transmittance * alpha;
        light += weight * sun;
        height += weight * clamp((p.y - 1.0) / 1.25, 0.0, 1.0);
        transmittance *= 1.0 - alpha;
        if (transmittance < 0.008) break;
      }
    }
    float opacity = 1.0 - transmittance;
    return vec4(opacity, light / max(opacity, 0.001), height / max(opacity, 0.001), 0.0);
  }
  void main() {
    float azimuth = (bakeUv.x - 0.5) * 2.0 * PI;
    float elevation = (bakeUv.y - 0.5) * PI;
    vec3 ray = vec3(cos(azimuth) * cos(elevation), sin(elevation), sin(azimuth) * cos(elevation));
    vec4 fields = marchCloud(ray);
    // Separate high-altitude ice layer. Anisotropic domain warp produces wisps,
    // not a second population of low cumulus with the same silhouette.
    if (ray.y > 0.02) {
      vec2 p = ray.xz * (3.6 / (ray.y + 0.15));
      float warp = noiseAt(vec3(p * 0.27, 7.2));
      float streaks = noiseAt(vec3(p.x * 0.15 + warp * 0.6, 8.4, p.y * 1.8));
      float breakup = noiseAt(vec3(p * 0.35, 2.3));
      fields.a = smoothstep(0.54, 0.69, streaks) * smoothstep(0.40, 0.66, breakup) * 0.32;
      fields.a *= smoothstep(0.02, 0.16, ray.y);
    }
    gl_FragColor = fields;
  }
`;
