import { Vector2, type Material } from "three";

/** The same anchored displacement is installed in PBR, depth and distance shaders.
 * Phase is world-rooted; trunk, branches, leaf flutter and vine pendulums differ. */
export function installHrMaterial(material: Material, clock: Vector2, leaf: boolean, vine = false, impostor = false) {
  material.alphaHash = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.hrWind = { value: clock };
    shader.vertexShader = `attribute vec3 hrTint; attribute float hrSeed; attribute float hrFade;
uniform vec2 hrWind; varying vec3 vHrTint; varying vec3 vHrLocal; varying float vHrFade;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vHrTint = hrTint; vHrLocal = position; vHrFade = ${leaf || impostor ? "hrFade" : "1.0"};
float phase = hrSeed * 6.2831853;
float heightWeight = max(position.y, 0.0);
float trunk = sin(hrWind.x * 0.63 + phase) * min(heightWeight * heightWeight * 0.00012, 0.06);
float branch = sin(hrWind.x * 1.31 + phase + position.y * 0.62) * min(heightWeight * 0.002, 0.04);
float flutter = sin(hrWind.x * 3.7 + phase + dot(position, vec3(2.3, 1.7, 2.9))) * 0.018;
${impostor ? `
vec3 localEye = (inverse(modelMatrix * instanceMatrix) * vec4(cameraPosition, 1.0)).xyz;
float yaw = atan(localEye.x - hrCenter.x, localEye.z - hrCenter.z);
vHrView = mod(floor(yaw / 1.57079632679 + 0.5) + 4.0, 4.0);
vec3 offset = transformed - hrCenter;
transformed = hrCenter + vec3(cos(yaw) * offset.x, offset.y, -sin(yaw) * offset.x);
` : `transformed.xz += vec2(1.0, 0.43) * (trunk + branch ${leaf ? "+ flutter" : ""}) * hrWind.y;
${vine ? "transformed.x += sin(hrWind.x * 0.88 + phase + position.y * 0.7) * 0.065 * hrWind.y;" : ""}`}`);
    shader.fragmentShader = `varying vec3 vHrTint; varying vec3 vHrLocal; varying float vHrFade;
` + shader.fragmentShader;
    // alphaTest already resolved the photographed cutout. Hash only camera
    // occlusion, otherwise every partially covered texel becomes black noise.
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphahash_fragment>", `diffuseColor.a = vHrFade;
#include <alphahash_fragment>`);
    // Leaf cutouts already have coverage from alphaTest. Distance fog must not
    // erase their shaded interiors into white paper silhouettes; the shared
    // aerial pass still supplies the continuous valley haze afterwards.
    shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float hrFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float hrFog = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hrFog * 0.22);
#endif`);
    if (impostor) {
      shader.vertexShader = "uniform vec3 hrCenter; varying float vHrView;\n" + shader.vertexShader;
      shader.fragmentShader = "varying float vHrView;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
vec2 tile = vec2(mod(vHrView, 2.0), 1.0 - floor(vHrView / 2.0));
// HR-TREE1 stores the first quadrant UV rectangle, not full-plane 0..1 UVs.
vec2 treeUv = vec2(vMapUv.x * 2.0, vMapUv.y * 2.0 - 1.0);
diffuseColor *= texture2D(map, (tile + clamp(treeUv, 0.003, 0.997)) * 0.5);`);
    }
    if ((leaf && !vine) || impostor) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
float leafPatch = sin(dot(floor(vHrLocal * 3.2), vec3(12.71, 3.17, 7.13)));
float oldLeaf = smoothstep(0.94, 0.995, leafPatch);
diffuseColor.rgb *= vHrTint * mix(vec3(1.0), vec3(1.27, 0.88, 0.44), oldLeaf * 0.55);
// A continuous inner-crown occlusion term; no hard shell or flat colour floor.
float crownAO = mix(0.64, 1.0, smoothstep(0.5, 5.5, length(vHrLocal.xz)));
diffuseColor.rgb *= crownAO;`);
      if (!impostor) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
#if NUM_DIR_LIGHTS > 0
float leafBacklight = max(0.0, -dot(normal, directionalLights[0].direction));
float forwardScatter = pow(max(0.0, dot(normalize(vViewPosition), -directionalLights[0].direction)), 3.0);
outgoingLight += diffuseColor.rgb * directionalLights[0].color * leafBacklight * (0.18 + forwardScatter * 0.14);
#endif
#include <opaque_fragment>`);
    }
  };
  material.customProgramCacheKey = () => `hr-tree2-v2:${leaf}:${vine}:${impostor}`;
}
