import { Color, type MeshToonMaterial } from "three";
import { WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";

export type PropMaterialKind = "wood" | "paper";

/** Warm diluted ink: ink -> dusk (38%) -> paper (12%), blended in linear space. */
export function createPropMaterial(kind: PropMaterialKind): MeshToonMaterial {
  const color = kind === "paper" ? new Color(PALETTE.paper)
    : new Color(PALETTE.ink).lerp(new Color(PALETTE.dusk), 0.38).lerp(new Color(PALETTE.paper), 0.12);
  const material = createRampMaterial(color.getHex(), WORLD_DIRECTION.foliage.ramp);
  material.vertexColors = true;
  const compileRamp = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compileRamp(shader, renderer);
    shader.uniforms.propShadeTint = { value: new Color(PALETTE.skyHigh).lerp(new Color(PALETTE.indigo), 0.35) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 propShadeTint;")
      .replace("#include <opaque_fragment>", `
// Use the final albedo, including kit vertex pigments and caller colour overrides.
vec3 propLumaWeights = vec3(0.2126, 0.7152, 0.0722);
float propAlbedoLuma = dot(diffuseColor.rgb, propLumaWeights);
vec3 propShade = mix(diffuseColor.rgb, propShadeTint, 0.55);
propShade *= (0.08 + 0.04 * propAlbedoLuma) / max(dot(propShade, propLumaWeights), 0.0001);
// Direct irradiance distinguishes a dark pigment in sunlight from cast forest shade.
float propDirect = dot(reflectedLight.directDiffuse, propLumaWeights) / max(propAlbedoLuma, 0.0001);
float propShadeWeight = 1.0 - smoothstep(0.05, 0.2, propDirect);
float propFloor = dot(propShade, propLumaWeights);
float propLight = dot(outgoingLight, propLumaWeights);
outgoingLight += propShade * max(0.0, 1.0 - propLight / propFloor) * propShadeWeight;
#if NUM_HEMI_LIGHTS > 0
  // View-space normals and hemisphere direction share the same coordinate frame.
  float propSky = max(0.0, dot(normal, hemisphereLights[0].direction));
  float propFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  vec3 propSkyLight = clamp(hemisphereLights[0].skyColor, 0.0, 1.0);
  outgoingLight += outgoingLight * propSkyLight * (0.1 * propSky * propFresnel);
#endif
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "painted-prop-readable-v1";
  return material;
}
