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
  opts: { shadowTint?: number; soft?: boolean } = {},
): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color,
    gradientMap: createRampGradient(4, opts.soft ?? true),
  });
  const shadowTint = opts.shadowTint === undefined
    ? defaultShadowTint.clone()
    : new Color(opts.shadowTint);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.rampShadowTint = { value: shadowTint };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 rampShadowTint;")
      .replace("#include <opaque_fragment>", `
// Mix after lighting/AO so occlusion and absent lights also retain diluted ink.
float rampLight = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
vec3 rampShadow = mix( rampShadowTint, diffuseColor.rgb, 0.5 );
outgoingLight = mix( rampShadow, outgoingLight, smoothstep( 0.0, 0.5, rampLight ) );
#include <opaque_fragment>`);
  };
  // Colour/tint are uniforms; filtering is texture state. All share the same shader source.
  material.customProgramCacheKey = () => "painted-toon-ramp-v1";
  return material;
}

/** Base colours for createRampMaterial; blending uses Three's linear working colour space. */
export const RAMP_PRESETS = {
  terrain: hex("forestLight"),
  crown: hex("forestDeep"),
  trunk: new Color(hex("ink")).lerp(new Color(hex("paper")), 0.35).getHex(),
  water: hex("water"),
} as const;
