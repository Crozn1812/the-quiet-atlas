import { DoubleSide, MeshStandardMaterial, type Texture } from "three";

const atlases = new WeakMap<MeshStandardMaterial, {
  cliffAtlas: { value: Texture | null }; cliffAtlasSurface: { value: Texture | null }; cliffAtlasSize: { value: number };
}>();

/** Borrow the resident leaf/soil photo, with a stippled feather at the talus edge. */
export function createCliffCoverMaterial() {
  const uniforms = { coverAtlas: { value: null as Texture | null }, coverAtlasSize: { value: 0 } };
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec2 cliffCover; varying vec2 coverInfo; varying vec3 coverWorld;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
        coverWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; coverInfo = cliffCover;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec2 coverInfo; varying vec3 coverWorld; uniform sampler2D coverAtlas; uniform float coverAtlasSize;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (coverInfo.x > 0.5) {
          float fleck = fract(sin(dot(floor(coverWorld.xz * 65.0), vec2(127.1, 311.7))) * 43758.5453);
          if (coverInfo.y < 0.04 + fleck * 0.42) discard;
          if (coverAtlasSize > 0.0) {
            vec2 extent = coverAtlasSize > 1024.0 ? vec2(8.0, 3.0) : vec2(4.0, 2.0);
            vec2 cell = coverAtlasSize > 1024.0 ? vec2(2.0, 2.0) : vec2(1.0, 1.0);
            float pad = 4.0 / min(coverAtlasSize, 1024.0);
            vec2 scale = (1.0 - 2.0 * pad) / extent, uv = coverWorld.xz / 3.0;
            vec2 atlasUV = (cell + pad) / extent + fract(uv) * scale; atlasUV.y = 1.0 - atlasUV.y;
            vec3 soil = textureGrad(coverAtlas, atlasUV, dFdx(uv) * scale * vec2(1.0, -1.0), dFdy(uv) * scale * vec2(1.0, -1.0)).rgb;
            diffuseColor.rgb *= clamp(soil / 0.42, vec3(0.55), vec3(1.6));
          }
        }`);
  };
  material.customProgramCacheKey = () => "terrain-cliff-cover-v1";
  return { material, setTextures(textures: readonly Texture[], size: number) {
    uniforms.coverAtlas.value = textures[0] ?? null; uniforms.coverAtlasSize.value = size;
  } };
}

/** Metre-based weathering shared by terrain and the authored spring escarpment. */
export const cliffWeathering = /* glsl */ `
float cliffHash(vec3 p) {
  p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float cliffNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cliffHash(i), cliffHash(i + vec3(1,0,0)), f.x),
    mix(cliffHash(i + vec3(0,1,0)), cliffHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(cliffHash(i + vec3(0,0,1)), cliffHash(i + vec3(1,0,1)), f.x),
    mix(cliffHash(i + vec3(0,1,1)), cliffHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// x: sediment seam, y: fissure, z: wet runoff, w: moss. No screen/UV-space bands.
vec4 cliffWeather(vec3 p, vec3 n, float moisture) {
  float broad = cliffNoise(p * 0.12);
  float bed = fract(p.y / 2.7 + cliffNoise(vec3(p.x * 0.16, p.y * 0.12, p.z * 0.16)) * 0.9 + p.x * 0.012 + p.z * 0.008);
  float seam = smoothstep(0.04, 0.14, bed) * (1.0 - smoothstep(0.32, 0.99, bed));
  float fracture = abs(cliffNoise(vec3(p.x * 1.2, p.y * 0.19, p.z * 1.2)) - 0.5);
  float crack = (1.0 - smoothstep(0.004, 0.018, fracture)) * smoothstep(0.48, 0.7, broad);
  float flow = cliffNoise(vec3(p.x * 2.1, p.y * 0.035, p.z * 2.1));
  float runoff = smoothstep(0.48, 0.73, flow) * (0.3 + moisture * 0.7);
  float moss = smoothstep(0.46, 0.7, broad + flow * 0.22)
    * (0.35 + 0.65 * max(n.y, 0.0)) * moisture;
  return vec4(seam, crack, runoff, moss);
}
vec3 cliffPigment(vec3 color, vec4 weather) {
  color *= 1.0 - weather.x * 0.2 - weather.y * 0.3 - weather.z * 0.48;
  return mix(color, color * vec3(0.3, 0.52, 0.16), weather.w * 0.9);
}
`;

/** Retain the existing CC0 triplanar samplers and add irregular sediment/weathering. */
export function weatherSpringCliff(material: MeshStandardMaterial, textures?: readonly Texture[], size = 0) {
  const existing = atlases.get(material);
  if (existing) {
    existing.cliffAtlas.value = textures?.[0] ?? null;
    existing.cliffAtlasSurface.value = textures?.[1] ?? null;
    existing.cliffAtlasSize.value = size;
  }
  if (material.userData.terrainCliffWeather) return;
  material.userData.terrainCliffWeather = true;
  const uniforms = { cliffAtlas: { value: textures?.[0] ?? null }, cliffAtlasSurface: { value: textures?.[1] ?? null },
    cliffAtlasSize: { value: size } };
  atlases.set(material, uniforms);
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace("cliffN = normalize(mat3(modelMatrix) * objectNormal);",
      "cliffN = normalize(inverseTransformDirection(transformedNormal, viewMatrix));");
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${cliffWeathering}
      uniform sampler2D cliffAtlas; uniform sampler2D cliffAtlasSurface; uniform float cliffAtlasSize;
      // Rock-face and river-stone photographs already resident in the terrain atlas.
      vec3 cliffAtlasRead(sampler2D atlas, vec2 uv, bool river) {
        vec2 cell = river ? vec2(2.0, 0.0) : vec2(0.0, 1.0);
        vec2 extent = vec2(4.0, 2.0); float span = 1.0;
        float pad = 4.0 / max(cliffAtlasSize, 512.0);
        if (cliffAtlasSize > 1024.0) {
          extent = vec2(8.0, 3.0); cell = river ? vec2(2.0, 0.0) : vec2(4.0, 0.0);
          span = 2.0; pad = 4.0 / 1024.0;
        }
        vec2 scale = (span - 2.0 * pad) / extent;
        vec2 sampleUV = (cell + pad + fract(uv) * (span - 2.0 * pad)) / extent;
        sampleUV.y = 1.0 - sampleUV.y;
        return textureGrad(atlas, sampleUV, dFdx(uv) * scale * vec2(1.0, -1.0), dFdy(uv) * scale * vec2(1.0, -1.0)).rgb;
      }
      vec3 cliffSoilRead(vec2 uv) {
        vec2 extent = cliffAtlasSize > 1024.0 ? vec2(8.0, 3.0) : vec2(4.0, 2.0);
        vec2 cell = cliffAtlasSize > 1024.0 ? vec2(2.0, 2.0) : vec2(1.0, 1.0);
        float pad = 4.0 / min(cliffAtlasSize, 1024.0);
        vec2 span = (1.0 - 2.0 * pad) / extent;
        vec2 atlasUV = (cell + pad) / extent + fract(uv) * span; atlasUV.y = 1.0 - atlasUV.y;
        return textureGrad(cliffAtlas, atlasUV, dFdx(uv) * span * vec2(1.0, -1.0), dFdy(uv) * span * vec2(1.0, -1.0)).rgb;
      }
      void main() {`)
      .replace("vec3 cliffColor = mix(cliffRead(map, cliffP / 3.5), cliffRead(map, cliffP / 13.7 + vec3(0.37)), 0.27);", `
        float rockPatch = cliffNoise(cliffP * 0.135);
        vec3 warp = vec3(cliffNoise(cliffP * 0.071), 0.0, cliffNoise(cliffP * 0.093 + 19.0)) * 2.1;
        vec3 cliffColor = mix(cliffRead(map, (cliffP + warp) / 2.6),
          cliffRead(map, cliffP / 8.3 + vec3(0.37, 0.13, 0.61)), smoothstep(0.2, 0.8, rockPatch) * 0.6);
        vec2 cliffUV = abs(cliffN.x) > abs(cliffN.z) ? cliffP.zy : cliffP.xy;
        vec3 cliffExtra = vec3(0.5); vec3 cliffPacked = vec3(1.0, 0.9, 0.0);
        if (cliffAtlasSize > 0.0) {
          cliffExtra = mix(cliffAtlasRead(cliffAtlas, cliffUV / 4.7 + warp.xy * 0.17, false),
            cliffAtlasRead(cliffAtlas, cliffUV / 1.9 + vec2(0.43, 0.71), true), smoothstep(0.35, 0.75, rockPatch) * 0.42);
          cliffPacked = cliffAtlasRead(cliffAtlasSurface, cliffUV / 4.7 + warp.xy * 0.17, false);
          cliffColor = mix(cliffColor, cliffExtra, 0.52);
          // Soil clings to the actual eroded cap and sloping lips, without floating overlay cards.
          float soilWeight = smoothstep(0.12, 0.65, cliffN.y) * smoothstep(10.0, 17.0, cliffP.y);
          if (soilWeight > 0.01) {
            vec3 weights = cliffWeights();
            vec3 soil = cliffSoilRead(cliffP.zy / 2.9) * weights.x
              + cliffSoilRead(cliffP.xz / 2.9) * weights.y + cliffSoilRead(cliffP.xy / 2.9) * weights.z;
            cliffColor = mix(cliffColor, soil * vec3(0.44, 0.48, 0.23), soilWeight * 0.85);
          }
        }
      `)
      .replace("cliffColor = mix(cliffColor, cliffColor * vec3(0.42, 0.62, 0.24), cliffMoss * 0.7);", "")
      .replace("diffuseColor.rgb *= cliffColor * (1.0 - cliffRunoff * 0.46);", `
        vec4 weather = cliffWeather(cliffP, normalize(cliffN), 0.85);
        float mineral = 0.68 + 0.55 * cliffNoise(cliffP * 0.08);
        diffuseColor.rgb *= cliffPigment(cliffColor * vec3(0.8, 0.87, 0.88) * mineral, weather);
      `)
      .replace("float roughnessFactor = clamp(cliffSurface.g, 0.72, 1.0);", `
        float roughnessFactor = clamp(mix(cliffSurface.g, cliffPacked.b, 0.35) - weather.z * 0.18, 0.56, 1.0);`);
  };
  material.customProgramCacheKey = () => `${key}:terrain-cliff-v2`;
  material.needsUpdate = true;
}
