/** Gentle ground only. Reuses the licensed resident photo atlas and its packed GL normals/roughness. */
export const groundSurfaceShader = /* glsl */ `
varying vec4 photoGround;
float groundHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * 0.1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1, 0)), f.x),
    mix(groundHash(i + vec2(0, 1)), groundHash(i + vec2(1)), f.x), f.y);
}
struct GroundPhoto { vec3 color; vec3 surface; };
GroundPhoto groundRead(float tile, vec2 uv, float blend) {
  // Two incommensurate projections with continuous patch selection. The same
  // coordinates/weights apply to colour, roughness and rotated normal vectors.
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  vec2 other = turn * uv * 0.731 + vec2(0.37, 0.61);
  vec3 a = photoRead(photoSurface, uv, tile);
  vec3 b = photoRead(photoSurface, other, tile);
  b.rg = transpose(turn) * (b.rg * 2.0 - 1.0) * 0.731 * 0.5 + 0.5;
  return GroundPhoto(mix(photoRead(photoColor, uv, tile), photoRead(photoColor, other, tile), blend), mix(a, b, blend));
}
GroundPhoto groundMix(GroundPhoto a, GroundPhoto b, float weight) {
  return GroundPhoto(mix(a.color, b.color, weight), mix(a.surface, b.surface, weight));
}
GroundPhoto groundSurface(vec3 n, float sandWeight) {
  vec2 p = photoWorld.xz;
  // 10–50 m colour islands survive distant mip levels. No tile-local seed.
  float broad = 0.6 * groundNoise(p / 47.0) + 0.4 * groundNoise(p / 19.0 + 7.3);
  float groundPatch = groundNoise(p / 11.0 + vec2(broad * 2.0, -broad));
  float blend = smoothstep(0.25, 0.75, groundNoise(p / 7.7));
  vec2 warp = vec2(groundNoise(p / 23.0), groundNoise(p / 29.0 + 13.7)) - 0.5;
  vec2 uv = p / 2.8 + warp * 0.6;
  float moisture = clamp(photoGround.y, 0.0, 1.0);
  float dry = smoothstep(0.28, 0.8, broad + photoGround.x * 0.18
    + smoothstep(4.0, 30.0, photoGround.z) * 0.12 - moisture * 0.35);
  vec3 green = mix(vec3(0.065, 0.105, 0.023), vec3(0.16, 0.21, 0.055), smoothstep(0.25, 0.75, groundPatch));
  vec3 pigment = mix(green, vec3(0.29, 0.215, 0.085), dry * (1.0 - photoMask.x * 0.75));
  GroundPhoto result = groundRead(1.0, uv, blend);
  result.color = result.color / 0.42 * pigment;
  float litter = photoMask.x * smoothstep(0.22, 0.65, groundPatch + moisture * 0.18);
  if (litter > 0.001) {
    GroundPhoto forest = groundRead(0.0, uv, blend);
    forest.color *= mix(vec3(0.24, 0.18, 0.105), vec3(0.13, 0.16, 0.072), moisture) / 0.42;
    result = groundMix(result, forest, litter);
  }
  float exposed = smoothstep(0.10, 0.45, 1.0 - n.y) * smoothstep(0.38, 0.73, groundPatch);
  float soil = max(photoMask.y, max(exposed * 0.7, smoothstep(0.57, 0.78, groundPatch) * dry * 0.72)) * photoGround.w;
  if (soil > 0.001) {
    GroundPhoto dirt = groundRead(5.0, uv, blend);
    // Iron-rich dry hill soil; the existing walking line stays mineral brown.
    vec3 earth = mix(vec3(0.22, 0.095, 0.043), vec3(0.27, 0.22, 0.13), photoMask.y);
    dirt.color *= earth / 0.42;
    result = groundMix(result, dirt, soil);
  }
  if (photoMask.z > 0.001) {
    GroundPhoto gravel = groundRead(2.0, uv, blend);
    gravel.color *= vec3(0.32, 0.29, 0.23) / 0.42;
    result = groundMix(result, gravel, photoMask.z);
  }
  result.color *= (0.72 + broad * 0.65) * (1.0 - moisture * 0.26);
  if (sandWeight > 0.001) {
    GroundPhoto sand = groundRead(3.0, uv, blend);
    float wet = 1.0 - smoothstep(0.08, 0.95, photoGround.z + (groundPatch - 0.5) * 0.16);
    float wrack = pow(0.5 + 0.5 * sin(photoGround.z * 27.0 + groundNoise(p / 5.0) * 2.0), 12.0)
      * wet * smoothstep(-0.1, 0.15, photoGround.z);
    sand.color *= mix(vec3(0.56, 0.45, 0.30), vec3(0.23, 0.205, 0.155), wet) / 0.42;
    sand.color *= (0.88 + groundPatch * 0.22) * (1.0 - wrack * 0.14);
    sand.surface.b = mix(sand.surface.b, 0.38, wet * 0.85);
    sand.surface.rg = mix(sand.surface.rg, vec2(0.5), wet * 0.55);
    result = groundMix(result, sand, sandWeight);
  }
  return result;
}
`;
