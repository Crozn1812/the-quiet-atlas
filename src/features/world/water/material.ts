import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { lightingAt } from "../sky/grade";
import type { Quality } from "../terrain";

export const WATER_FLOW_SPEED = 0.05;
export const SEA_WAVE_PERIOD = 8;
// 109 coast samples + 29 colour, clock, direction and fog floats = 138 floats.
export const SEA_SHORE_SAMPLES = 109;
/** Shoreline slope |dz/dx| above which the foam line fades out (bay corners after B2-152b). */
export const SEA_FOAM_MAX_SLOPE = 3;

export interface WaterMaterialOptions {
  surface?: "river" | "sea";
  /** Paper sky at 0, dusk sky at 1; colours use Three's linear working space. */
  skyMix?: number;
  /** World-space direction toward the sun, supplied by the lighting grade. */
  sunDirection?: Readonly<Vector3>;
  /** Sampled outer coastline; absent on standalone materials and river ribbons. */
  shoreline?: { minX: number; width: number; z: readonly number[] };
}

const vertexShader = /* glsl */ `
  varying vec2 vWaterUv;
  #ifdef SEA_WATER
    varying vec3 vWaterWorld;
  #endif
  #ifdef WATER_REFLECTION
    varying vec3 vViewDirection;
    varying vec3 vSurfaceNormal;
  #endif
  #include <fog_pars_vertex>
  void main() {
    vWaterUv = uv;
    #ifdef SEA_WATER
      vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    #endif
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #ifdef WATER_REFLECTION
      vViewDirection = -mvPosition.xyz;
      vSurfaceNormal = normalMatrix * normal;
    #endif
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uEdgeColor;
  uniform vec3 uDeepColor;
  uniform vec3 uPaperColor;
  uniform vec3 uDuskColor;
  uniform float uSkyMix;
  uniform float uTime;
  varying vec2 vWaterUv;
  #ifdef SEA_WATER
    uniform vec3 uSunDirection;
    uniform vec3 uSunWashColor;
    uniform vec2 uShoreBounds;
    uniform float uShoreZ[${SEA_SHORE_SAMPLES}];
    uniform float uHasShore;
    #define SEA_FOAM_MAX_SLOPE ${SEA_FOAM_MAX_SLOPE.toFixed(1)}
    varying vec3 vWaterWorld;
  #endif
  #ifdef WATER_REFLECTION
    varying vec3 vViewDirection;
    varying vec3 vSurfaceNormal;
  #endif
  #include <fog_pars_fragment>
  void main() {
    // UV.y is downstream distance in metres, so this translation is 0.05 m/s.
    float flow = vWaterUv.y;
    #ifdef WATER_FLOW
      flow -= uTime * ${WATER_FLOW_SPEED};
    #endif
    float edge = abs(vWaterUv.x * 2.0 - 1.0);
    vec3 color = mix(uDeepColor, uEdgeColor, smoothstep(0.0, 1.0, edge));
    #ifdef SEA_WATER
      // Metres offshore, rather than the quad's UV edge or sky grade, control the turquoise shallows.
      float shoreSample = clamp((vWaterWorld.x - uShoreBounds.x) / uShoreBounds.y,
                                0.0, 1.0) * ${(SEA_SHORE_SAMPLES - 1).toFixed(1)};
      int shoreIndex = int(min(floor(shoreSample), ${(SEA_SHORE_SAMPLES - 2).toFixed(1)}));
      float shoreA = uShoreZ[shoreIndex];
      float shoreB = uShoreZ[shoreIndex + 1];
      float shoreZ = mix(shoreA, shoreB, shoreSample - float(shoreIndex));
      float slope = (shoreB - shoreA) * ${(SEA_SHORE_SAMPLES - 1).toFixed(1)} / uShoreBounds.y;
      float offshore = (shoreZ - vWaterWorld.z) / sqrt(1.0 + slope * slope);
      float shallows = (1.0 - smoothstep(12.0, 160.0, offshore)) * uHasShore;
      color = mix(uDeepColor, uEdgeColor, shallows);
    #endif
    #ifndef SEA_WATER
      // River-only lanes: stretching these UV strokes across the sea creates long white rays.
      float lane = vWaterUv.x * 50.0 + 0.45 * sin(flow * 0.7);
      float stroke = pow(0.5 + 0.5 * cos(lane), 12.0);
      stroke *= smoothstep(0.1, 0.8, 0.5 + 0.5 * sin(flow * 0.65 + vWaterUv.x * 37.0));
      color = mix(color, uPaperColor, stroke * 0.065);
    #endif
    #ifdef SEA_WATER
      // All sea motion shares the freezeable clock, including on Low.
      float phase = uTime * ${(2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10)};
      float swell = sin(vWaterWorld.z * 0.65 + phase);
      float crossSwell = sin(vWaterWorld.x * 0.31 + vWaterWorld.z * 0.21 - phase);
      color = mix(color, uPaperColor, (0.5 + 0.25 * swell + 0.25 * crossSwell) * 0.035);
    #endif
    #ifdef WATER_REFLECTION
      vec3 surfaceNormal = normalize(vSurfaceNormal);
      #ifdef WATER_RIPPLES
        #ifndef SEA_WATER
        vec3 ripple = vec3(sin(flow * 0.9 + vWaterUv.x * 9.0),
                           0.0, cos(flow * 0.6 - vWaterUv.x * 13.0)) * 0.025;
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * ripple);
        #endif
      #endif
      #ifdef SEA_WATER
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * vec3(crossSwell, 0.0, swell) * 0.012);
      #endif
      float grazing = 1.0 - clamp(dot(surfaceNormal, normalize(vViewDirection)), 0.0, 1.0);
      float fresnel = grazing * grazing * grazing;
      vec3 sky = mix(uPaperColor, uDuskColor, uSkyMix);
      #ifdef SEA_WATER
        // Keep distant water turquoise beneath the warm horizon.
        sky = mix(mix(uDeepColor, uPaperColor, 0.28), uDuskColor, uSkyMix * 0.18);
      #endif
      color = mix(color, sky, fresnel * SKY_REFLECTION);
    #endif
    #ifdef SEA_WATER
      // A broad pigment wash along the sun/viewer axis, broken into soft brush marks.
      // No specular power or hardcoded azimuth: changing the grade rotates the wash.
      vec2 sunAxis = uSunDirection.xz / max(length(uSunDirection.xz), 0.0001);
      vec2 fromViewer = vWaterWorld.xz - cameraPosition.xz;
      float alongSun = dot(fromViewer, sunAxis);
      float signedAcrossSun = dot(fromViewer, vec2(-sunAxis.y, sunAxis.x));
      float acrossSun = abs(signedAcrossSun);
      // Sun wash scalars: also evaluated directly by the CPU colour regression.
      float washWidth = mix(30.0, 7.0, smoothstep(12.0, 360.0, alongSun));
      float washDistance = sqrt(alongSun * alongSun + acrossSun * acrossSun);
      float distanceFade = 1.0 - smoothstep(120.0, 640.0, washDistance);
      float wash = 1.0 - smoothstep(washWidth * 0.18, washWidth, acrossSun);
      wash *= smoothstep(0.0, 12.0, alongSun);
      wash *= distanceFade;
      wash *= smoothstep(0.0, 0.08, uSunDirection.y) * (1.0 - smoothstep(0.25, 0.8, uSunDirection.y));
      float core = (1.0 - smoothstep(washWidth * 0.12, washWidth * 0.4, acrossSun))
        * smoothstep(20.0, 220.0, alongSun);
      // Break the entire wash, including its base/core, so it cannot form a continuous ray.
      // Transverse soft bands compress with distance; lateral wobble keeps their edges organic.
      float perspective = mix(1.0, 2.5, smoothstep(120.0, 600.0, alongSun));
      float washMarks = smoothstep(0.0, 0.65,
        cos(alongSun * 0.24 * perspective + 0.3 * sin(signedAcrossSun * 0.3)));
      // Thin transverse marks, interrupted every few metres across the sun axis.
      float glimmer = smoothstep(0.72, 0.98, 0.5 + 0.5 * sin(alongSun * 1.7 + phase
        + 0.35 * sin(signedAcrossSun * 0.42 + alongSun * 0.11)));
      glimmer *= smoothstep(0.1, 0.8, 0.5 + 0.5 * sin(signedAcrossSun * 0.82 + 2.0 * sin(alongSun * 0.37)));
      glimmer *= distanceFade;
      float washStrength = wash * washMarks * (0.5 + 0.14 * core + 0.24 * glimmer);
      // End sun wash scalars.
      color = mix(color, uSunWashColor, washStrength);
      float brush = 0.5 + 0.5 * sin(vWaterWorld.x * 0.73 + vWaterWorld.z * 0.27);
      // One thin cream-white edge runs up and retreats over an eight-second breath.
      float foamDistance = 0.45 + 1.1 * (0.5 + 0.5 * cos(phase));
      // A large horizon pixel must not inflate the shore edge into a broad white patch.
      float foamWidth = clamp(fwidth(offshore) * 0.8, 0.14, 0.45);
      float foam = 1.0 - smoothstep(foamWidth * 0.3, foamWidth, abs(offshore - foamDistance));
      foam *= 1.0 - smoothstep(2.0, 5.0, offshore);
      foam *= smoothstep(0.0, 0.2, offshore) * (0.42 + 0.18 * brush) * uHasShore;
      // Where the sampled coast turns back on itself (bay corners, spits) z(x) jumps between samples: no foam there.
      foam *= 1.0 - smoothstep(SEA_FOAM_MAX_SLOPE * 0.5, SEA_FOAM_MAX_SLOPE, abs(slope));
      color = mix(color, uPaperColor, foam);
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** No textures, render targets or lights; Low compiles out river flow and Fresnel. */
export class WaterMaterial extends ShaderMaterial {
  private reducedMotion = false;
  private lastSeconds: number | undefined = 0;
  private disposed = false;

  constructor(readonly quality: Quality, options: WaterMaterialOptions = {}) {
    const shore = options.shoreline;
    if (shore && (!Number.isFinite(shore.minX) || !Number.isFinite(shore.width) || shore.width <= 0
      || shore.z.length !== SEA_SHORE_SAMPLES || !shore.z.every(Number.isFinite))) {
      throw new RangeError("Water shoreline must contain finite, evenly spaced coast samples");
    }
    const sea = options.surface === "sea";
    const edge = new Color(PALETTE.seaShallow);
    const deep = new Color(PALETTE.seaDeep);
    if (!sea) {
      // Clear green-turquoise banks, with denser pigment down the centre of the stream.
      edge.lerp(new Color(PALETTE.forestLight), 0.25);
      deep.lerp(new Color(PALETTE.forestLight), 0.5);
    }
    // The broad sea mirrors more of the painted sky than the shaded river.
    const defines: Record<string, number> = { SKY_REFLECTION: sea ? 0.5 : 0.22 };
    if (sea) defines.SEA_WATER = 1;
    if (quality !== "Low") {
      defines.WATER_FLOW = 1;
      defines.WATER_REFLECTION = 1;
    }
    if (quality === "High") defines.WATER_RIPPLES = 1;
    super({
      name: `painted-${sea ? "sea" : "river"}-${quality.toLowerCase()}`,
      defines,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uEdgeColor: { value: edge },
          uDeepColor: { value: deep },
          uPaperColor: { value: new Color(PALETTE.paper) },
          uDuskColor: { value: new Color(PALETTE.dusk) },
          uSkyMix: { value: 0 },
          uTime: { value: 0 },
          uSunDirection: { value: new Vector3() },
          uSunWashColor: { value: new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.72)
            .lerp(new Color(PALETTE.flower), 0.1) },
          uShoreBounds: { value: new Vector2(options.shoreline?.minX ?? 0, options.shoreline?.width ?? 1) },
          uShoreZ: { value: options.shoreline ? [...options.shoreline.z] : Array<number>(SEA_SHORE_SAMPLES).fill(0) },
          uHasShore: { value: options.shoreline ? 1 : 0 },
        },
      ]),
      vertexShader,
      fragmentShader,
      fog: true,
      // The existing coast terrain is flat at sea level; avoid coplanar flicker.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.setSkyMix(options.skyMix ?? (sea ? 1 : 0));
    this.setSunDirection(options.sunDirection ?? lightingAt(1).sunDirection);
  }

  /** Supply elapsed seconds, not frame deltas. Frozen intervals never catch up. */
  setTime(seconds: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Water time must be finite and nonnegative");
    const delta = this.lastSeconds === undefined ? 0 : Math.max(0, seconds - this.lastSeconds);
    this.lastSeconds = seconds;
    if (!this.reducedMotion && (this.quality !== "Low" || this.defines.SEA_WATER)) this.uniforms.uTime!.value += delta;
  }

  setReducedMotion(reduced: boolean): void {
    if (this.disposed || this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
    // Also handles clocks that stop sending samples while motion is disabled.
    this.lastSeconds = undefined;
  }

  setSkyMix(mix: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(mix)) throw new RangeError("Water sky mix must be finite");
    this.uniforms.uSkyMix!.value = Math.max(0, Math.min(1, mix));
  }

  /** Copy rather than retain the grade's mutable vector; safe to call each frame. */
  setSunDirection(direction: Readonly<Vector3>): void {
    if (this.disposed) return;
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length === 0) throw new RangeError("Water sun direction must be finite and nonzero");
    this.uniforms.uSunDirection!.value.copy(direction).divideScalar(length);
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    super.dispose();
  }
}

export function createWaterMaterial(quality: Quality, options: WaterMaterialOptions = {}): WaterMaterial {
  return new WaterMaterial(quality, options);
}
