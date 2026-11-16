import type { MeshStandardMaterial } from "three";
import { ZONES } from "../layout/zones";

/** Same integer hash, world-space noise and catchments as hills.ts. */
export const nearHillFieldShader = /* glsl */ `
float hillFieldHash(ivec2 p) {
  uint h = uint(p.x) * 374761393u ^ uint(p.y) * 668265263u ^ 0x48494c4cu;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967295.0;
}
float hillFieldNoise(vec2 p, float size) {
  p /= size;
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hillFieldHash(i), hillFieldHash(i + ivec2(1, 0)), f.x),
    mix(hillFieldHash(i + ivec2(0, 1)), hillFieldHash(i + ivec2(1)), f.x), f.y);
}
float hillFieldDrainage(vec2 p) {
  if (p.y < -386.0) {
    vec2 d = p + vec2(58.0, 452.0);
    float radius = length(d), angle = atan(d.y, d.x);
    float warp = (hillFieldNoise(p, 17.0) - 0.5) * 2.2;
    float a = abs(sin(angle * 8.0 + warp + radius * 0.025));
    float b = abs(sin(angle * 13.0 - warp + radius * 0.055));
    return max((1.0 - smoothstep(0.08, 0.38, a)) * 0.9,
      (1.0 - smoothstep(0.04, 0.20, b)) * smoothstep(0.4, 0.75, hillFieldNoise(p, 13.0)) * 0.6)
      * smoothstep(5.0, 13.0, radius);
  }
  float warp = (hillFieldNoise(p, 29.0) - 0.5) * 16.0;
  float a = abs(sin((p.y + warp + p.x * 0.17) / 7.4));
  float b = abs(sin((p.y + warp - p.x * 0.36 + 17.0) / 4.9));
  return max((1.0 - smoothstep(0.06, 0.38, a)) * 0.9,
    (1.0 - smoothstep(0.04, 0.22, b)) * smoothstep(0.35, 0.7, hillFieldNoise(p, 21.0)) * 0.65);
}
`;

/** Backdrop uses the same geographic envelopes as the detailed hills. */
export const nearHillRegionShader = /* glsl */ `
float nearHillRegion(vec2 p) {
  float w = 0.0;
  ${ZONES.filter(z => z.id === "first-light" || z.id === "old-trail").map(z =>
    `w = max(w, (1.0 - smoothstep(0.45, 1.0, length((p - vec2(${z.position.x.toFixed(6)}, ${(z.position.z - (z.id === "first-light" ? 0 : 45)).toFixed(6)})) / vec2(160.0, ${z.id === "first-light" ? "80.0" : "125.0"})))) * ${z.id === "first-light" ? "smoothstep(-65.0, -45.0, p.y)" : "(1.0 - smoothstep(-240.0, -210.0, p.y))"});`).join("\n")}
  w *= smoothstep(-400.0, -382.0, p.y);
  float horizon = (1.0 - smoothstep(0.45, 1.0, length((p + vec2(48.0, 447.0)) / vec2(84.0, 68.0))))
    * (1.0 - smoothstep(-406.0, -386.0, p.y)) * smoothstep(-482.0, -466.0, p.y);
  return max(w, horizon);
}
`;

/** Existing physical terrain draw/atlas; cold Low retains its inexpensive pigment. */
export function bindNearHillMaterial(material: MeshStandardMaterial): void {
  if (material.userData.nearHillCover) return;
  material.userData.nearHillCover = true;
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, gpu) => {
    before.call(material, shader, gpu);
    shader.vertexShader = `attribute vec2 nearHillSurface; varying vec2 hillCover;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nhillCover = nearHillSurface;");
    shader.fragmentShader = `varying vec2 hillCover;\n${nearHillFieldShader}\n${shader.fragmentShader}`
      .replace("#include <roughnessmap_fragment>", `
        float horizonCover = 1.0 - smoothstep(-406.0, -386.0, photoWorld.z);
        float hillWeight = hillCover.x * (1.0 - cliff * (1.0 - horizonCover * 0.9));
        float hillRunnel = hillCover.y;
        if (hillWeight > 0.001) {
          float hillPatch = hillFieldNoise(photoWorld.xz, 13.0);
          float hillFleck = hillFieldNoise(photoWorld.xz, 1.7);
          hillRunnel = max(hillRunnel, hillFieldDrainage(photoWorld.xz));
          hillRunnel *= smoothstep(0.02, 0.14, 1.0 - photoN.y);
          vec3 dryGrass = mix(vec3(0.12, 0.155, 0.045), vec3(0.34, 0.265, 0.12), hillPatch);
          dryGrass = mix(dryGrass, mix(vec3(0.075, 0.105, 0.025), vec3(0.25, 0.20, 0.075), hillPatch), horizonCover);
          dryGrass *= photoSample(photoColor, 1.0, photoN) / 0.42;
          dryGrass *= 0.68 + hillFleck * 0.65;
          vec3 exposedEarth = photoSample(photoColor, 5.0, photoN)
            * mix(vec3(0.30, 0.20, 0.105), vec3(0.09, 0.105, 0.045), hillRunnel) / 0.42;
          float bare = hillRunnel * (0.45 + hillPatch * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(dryGrass, exposedEarth, bare * 0.8), hillWeight);
        }
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.98 - hillRunnel * 0.12, hillWeight);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (hillCover.x > 0.001) {
          float tuftRelief = hillFieldNoise(photoWorld.xz, 0.8) * 0.10 - hillRunnel * 0.08;
          vec3 sx = dFdx(photoWorld), sy = dFdy(photoWorld);
          vec3 rx = cross(sy, photoN), ry = cross(photoN, sx);
          float det = dot(sx, rx);
          vec3 gradient = (dFdx(tuftRelief) * rx + dFdy(tuftRelief) * ry) / max(abs(det), 0.00001) * sign(det);
          normal = normalize(normal - mat3(viewMatrix) * gradient * hillCover.x * (1.0 - cliff));
        }`);
  };
  material.customProgramCacheKey = () => `${key}:near-hill-cover-v2`;
  material.needsUpdate = true;
}
