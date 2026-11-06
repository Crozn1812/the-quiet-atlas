import { paletteColor, STYLE_PRESETS, WORLD_DIRECTION, type StylePreset } from "../art/direction";
import {
  Color,
  DataTexture,
  LinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  UnsignedByteType,
} from "three";
import { hex } from "../art/palette";

const gradients = new Map<string, DataTexture>();
const defaultShadowTint = new Color(hex("mist")).lerp(new Color(hex("indigo")), 0.5);
const clearShadowTint = new Color(hex("indigo")).lerp(new Color(hex("skyHigh")), 0.25);
const clearHighlightTint = new Color(hex("cloud")).lerp(new Color(hex("sunGold")), 0.12);

/** One linear-data row, with a nonzero shadow end. Callers must not dispose it individually. */
export function createRampGradient(steps = 4, soft = true): DataTexture {
  if (!Number.isInteger(steps) || steps < 2 || steps > 256) {
    throw new RangeError("Ramp steps must be an integer between 2 and 256.");
  }
  const key = `${steps}:${soft}`;
  const cached = gradients.get(key);
  if (cached) return cached;

  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round(64 + (191 * i) / (steps - 1));
  }
  const texture = new DataTexture(data, steps, 1, RedFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = soft ? LinearFilter : NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  gradients.set(key, texture);
  return texture;
}

/** Call after disposing scene materials; a subsequent factory call creates fresh textures. */
export function disposeRampGradients(): void {
  for (const texture of gradients.values()) texture.dispose();
  gradients.clear();
}

export function createRampMaterial(
  color: number,
  opts: { shadowTint?: number; soft?: boolean; steps?: number; preset?: StylePreset; continuous?: boolean } = {},
): MeshToonMaterial {
  const continuous = opts.continuous ?? false;
  const material = new MeshToonMaterial({
    color,
    // Retain the shared gradient descriptor for existing material consumers.
    // Continuous terrain replaces its shader lookup below, so this row is never sampled.
    gradientMap: createRampGradient(opts.steps ?? 4, opts.soft ?? true),
  });
  const clearLight = (opts.preset ?? WORLD_DIRECTION) === STYLE_PRESETS.R;
  const shadowTint = opts.shadowTint === undefined
    ? (clearLight ? clearShadowTint : defaultShadowTint).clone()
    : new Color(opts.shadowTint);

  material.onBeforeCompile = (shader) => {
    if (continuous) {
      shader.uniforms.terrainDry = { value: new Color(hex("grassDry")) };
      shader.uniforms.terrainDeep = { value: new Color(hex("forestDeep")) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 terrainWorld;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nterrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", `
varying vec3 terrainWorld;
uniform vec3 terrainDry;
uniform vec3 terrainDeep;
float terrainHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float terrainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), f.x),
    mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0)), f.x), f.y);
}
vec3 terrainDetail(vec3 pigment) {
  float fade = 1.0 - 0.8 * smoothstep(40.0, 200.0, distance(cameraPosition, terrainWorld));
  float coarse = smoothstep(0.25, 0.75, terrainNoise(terrainWorld.xz / 4.5)) * 2.0 - 1.0;
  float fine = smoothstep(0.25, 0.75, terrainNoise(terrainWorld.xz / 0.9)) * 2.0 - 1.0;
  float grain = 0.65 * coarse + 0.35 * fine;
  vec3 hue = grain > 0.0 ? terrainDry : terrainDeep;
  // Equal-luma hue drift avoids a systematic brightening toward dry grass.
  vec3 weights = vec3(0.2126, 0.7152, 0.0722);
  hue /= max(dot(hue, weights), 0.0001);
  hue = mix(vec3(1.0), hue, abs(grain) * 0.035 * fade);
  float forest = 1.0 - smoothstep(0.24, 0.34, dot(pigment, weights));
  float sunPatch = 0.0;
  #if NUM_DIR_LIGHTS > 0
    vec3 sun = inverseTransformDirection(directionalLights[0].direction, viewMatrix);
    // Project a virtual canopy 3 m overhead onto the ground along the actual sun.
    vec2 canopy = terrainWorld.xz - sun.xz * (3.0 / max(abs(sun.y), 0.15));
    sunPatch = (smoothstep(0.35, 0.65, terrainNoise(canopy / 6.0)) * 2.0 - 1.0) * forest;
  #endif
  return hue * (1.0 + fade * (0.10 * grain + 0.18 * sunPatch));
}
void main() {`);
      // Analytic half-Lambert has no texel plateaus or band boundaries on curved ground.
      // Only replace angular irradiance: Three's light colour still carries cast shadows.
      shader.fragmentShader = shader.fragmentShader.replace("#include <gradientmap_pars_fragment>", `
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float halfLambert = clamp( dot( normal, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );
  return vec3( mix( 0.25, 1.0, halfLambert ) );
}`);
    }
    shader.uniforms.rampShadowTint = { value: shadowTint };
    shader.uniforms.rampClearLight = { value: clearLight };
    shader.uniforms.rampHighlightTint = { value: clearHighlightTint.clone() };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 rampShadowTint;\nuniform bool rampClearLight;\nuniform vec3 rampHighlightTint;")
      .replace("#include <opaque_fragment>", `
// Mix after lighting/AO so occlusion and absent lights also retain diluted ink.
float rampLight = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
vec3 rampShadow = mix( rampShadowTint, diffuseColor.rgb, 0.5 );
if ( rampClearLight ) {
  // Preserve the surface pigment in cool shade instead of lifting it toward pale mist.
  rampShadow = diffuseColor.rgb * mix( vec3( 0.25 ), rampShadowTint, 0.6 );
  outgoingLight *= mix( vec3( 1.0 ), rampHighlightTint, smoothstep( 0.5, 1.0, rampLight ) * 0.12 );
}
outgoingLight = mix( rampShadow, outgoingLight, smoothstep( 0.0, 0.5, rampLight ) );
#include <opaque_fragment>`);
    if (continuous) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
        "outgoingLight *= terrainDetail(diffuseColor.rgb);\n#include <opaque_fragment>");
    }
  };
  // Keep terrain and object programs separate; colour/tint remain per-material uniforms.
  material.customProgramCacheKey = () => continuous ? "painted-terrain-continuous-detail-v3" : "painted-toon-ramp-v1";
  return material;
}

/** Base colours for createRampMaterial, from the active world art direction. */
export const RAMP_PRESETS = {
  terrain: paletteColor(WORLD_DIRECTION.background.terrain),
  crown: paletteColor(WORLD_DIRECTION.foliage.crown),
  trunk: paletteColor(WORLD_DIRECTION.foliage.trunk),
  water: hex("water"),
} as const;
/** Continuous terrain lighting; objects/foliage retain the direction's soft ramp. */
export const RAMP_STEPS = {
  terrain: { ...WORLD_DIRECTION.background.ramp, continuous: true },
  foliage: WORLD_DIRECTION.foliage.ramp,
} as const;
