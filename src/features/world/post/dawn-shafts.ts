import { Vector3, type Box3, type Material } from "three";

const time = { value: 0 };
const motion = { value: 1 };
const cliffMin = { value: Array.from({ length: 12 }, () => new Vector3()) };
const cliffMax = { value: Array.from({ length: 12 }, () => new Vector3()) };

/** Conservative silhouette: reject light even in front of the source cliff. */
export function setDawnCliffBounds(bounds: readonly Box3[]) {
  bounds.forEach((box, i) => {
    cliffMin.value[i]?.copy(box.min);
    cliffMax.value[i]?.copy(box.max);
  });
}

/** One shared clock, advanced by simulation time so pauses freeze the leaf shimmer. */
export function updateDawnShafts(dt: number, reducedMotion: boolean) {
  motion.value = reducedMotion ? 0 : 1;
  if (!reducedMotion) time.value += dt;
}

/** Analytic feather avoids hard mesh edges, including at subpixel widths. */
export function bindDawnShafts(material: Material) {
  const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.dawnShaftTime = time;
    shader.uniforms.dawnShaftMotion = motion;
    shader.uniforms.dawnCliffMin = cliffMin;
    shader.uniforms.dawnCliffMax = cliffMax;
    shader.vertexShader = "varying vec3 vDawnShaft;\nvarying vec2 vDawnUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDawnUV = uv;");
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
vec4 dawnWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  dawnWorld = instanceMatrix * dawnWorld;
#endif
vDawnShaft = (modelMatrix * dawnWorld).xyz;`);
    shader.fragmentShader = "varying vec3 vDawnShaft;\nvarying vec2 vDawnUV;\nuniform float dawnShaftTime;\nuniform float dawnShaftMotion;\nuniform vec3 dawnCliffMin[12];\nuniform vec3 dawnCliffMax[12];\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
vec3 shaftDirection = normalize(vDawnShaft - cameraPosition);
vec3 shaftInv = 1.0 / (shaftDirection + vec3(0.000001));
float shaftCliffFade = 1.0;
for (int cliff = 0; cliff < 12; cliff++) {
vec3 shaftA = (dawnCliffMin[cliff] - cameraPosition) * shaftInv;
vec3 shaftB = (dawnCliffMax[cliff] - cameraPosition) * shaftInv;
vec3 shaftNear = min(shaftA, shaftB), shaftFar = max(shaftA, shaftB);
float cliffEnter = max(max(shaftNear.x, shaftNear.y), shaftNear.z);
float cliffExit = min(min(shaftFar.x, shaftFar.y), shaftFar.z);
if (cliffExit > max(0.0, cliffEnter)) discard;
if (cliffExit > 0.0) shaftCliffFade *= smoothstep(0.0, 1.2, cliffEnter - cliffExit);
}
// The visible portion stays below the camera horizon, so it cannot wash sky.
float shaftGrounded = smoothstep(-0.03, 0.06, -shaftDirection.y);
float shaftAcross = smoothstep(0.0, 0.5, vDawnUV.x) * smoothstep(0.0, 0.5, 1.0 - vDawnUV.x);
float shaftEnds = smoothstep(0.0, 0.28, vDawnUV.y) * smoothstep(0.0, 0.36, 1.0 - vDawnUV.y);
float leafGap = sin(dot(vDawnShaft, vec3(0.27, 0.19, 0.31)) + dawnShaftTime * 0.7);
diffuseColor.a *= shaftCliffFade * shaftGrounded * shaftAcross * shaftEnds * (0.86 + 0.1 * leafGap * dawnShaftMotion);
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey.call(material)}-dawn-leaf-gaps-v2`;
}
