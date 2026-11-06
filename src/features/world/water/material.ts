import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { lightingAt, type LightingGrade } from "../sky/grade";
import type { Quality } from "../terrain";

export const WATER_FLOW_SPEED = 0.05;
export const SEA_WAVE_PERIOD = 8;
// 109 coast samples + 29 colour, clock, direction and fog floats = 138 floats.
export const SEA_SHORE_SAMPLES = 109;
/** Shoreline slope |dz/dx| above which the foam line fades out (bay corners after B2-152b). */
export const SEA_FOAM_MAX_SLOPE = 3;

export interface WaterMaterialOptions {
  surface?: "river" | "sea";
  /** Reflection weight from morning (0) to dusk (1); setGrade supplies linear sky colours. */
  skyMix?: number;
  /** World-space direction toward the sun, supplied by the lighting grade. */
  sunDirection?: Readonly<Vector3>;
  /** Player-local lighting, including any directed/coast atmosphere adjustments. */
  grade?: LightingGrade;
  /** Sampled outer coastline; absent on standalone materials and river ribbons. */
  shoreline?: { minX: number; width: number; z: readonly number[] };
}

const vertexShader = /* glsl */ `
  varying vec2 vWaterUv;
  varying vec3 vWaterWorld;
  #ifdef WATER_REFLECTION
    varying vec3 vViewDirection;
    varying vec3 vSurfaceNormal;
  #endif
  #include <fog_pars_vertex>
  void main() {
    vWaterUv = uv;
    vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;
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
  uniform vec3 uSkyHorizon;
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
  #endif
  varying vec3 vWaterWorld;
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
    float rippleDistanceFade = 1.0 - smoothstep(15.0, 40.0, length(vWaterWorld - cameraPosition));
    #ifndef SEA_WATER
      // River-only lanes: stretching these UV strokes across the sea creates long white rays.
      // Inverse world-space UV gradient measures ribbon width under perspective.
      float riverWidth = length(cross(dFdx(vWaterWorld), dFdy(vWaterWorld)))
        / max(length(dFdx(vWaterUv.x) * dFdy(vWaterWorld)
          - dFdy(vWaterUv.x) * dFdx(vWaterWorld)), 0.000001);
      float bankDistance = (1.0 - edge) * riverWidth * 0.5;
      // Begin river detail scalars.
      // 60% fewer lanes; the bright stroke coefficient is 60% of B2-219's 3.2.
      float density = mix(3.6, 6.0, 1.0 - smoothstep(1.0, 8.0, riverWidth));
      density *= mix(1.3, 1.0, smoothstep(0.0, 0.8, bankDistance));
      float lane = vWaterUv.x * riverWidth * density + 0.45 * sin(flow * 0.7);
      float stroke = pow(0.5 + 0.5 * cos(lane), mix(6.0, 12.0, smoothstep(0.0, 0.4, uSkyMix)));
      // Staggered metre-based dashes have mandatory dark gaps between marks.
      float dash = smoothstep(0.1, 0.55, cos(flow * 3.2 + sin(lane * 0.37) * 2.0));
      stroke *= dash;
      float shallowDetail = mix(0.05, 1.0, 1.0 - smoothstep(8.0, 18.0, riverWidth));
      shallowDetail = max(shallowDetail, 1.0 - smoothstep(0.8, 2.5, bankDistance));
      float trough = pow(0.5 - 0.5 * cos(lane), 0.5) * dash;
      // Short pigment troughs retain near-water readability without brightening the sky reflection.
      float modulation = 1.0 + (1.92 * stroke - 1.2 * trough + 0.14 + 0.08 * dash)
        * (1.0 - smoothstep(0.6, 1.0, edge)) * shallowDetail * rippleDistanceFade;
      float riverBrush = 0.5 + 0.5 * sin(flow * 1.73 + 1.2 * sin(flow * 0.43) + vWaterUv.x * 11.0);
      float riverFoam = (1.0 - smoothstep(0.2, 0.6, bankDistance))
        * smoothstep(0.48, 0.58, riverBrush);
      // End river detail scalars.
      // A metre-based wet margin blends into the existing edge pigment.
      float wetBank = 1.0 - smoothstep(0.0, 0.55, bankDistance);
      color = mix(color, uEdgeColor * 0.92, wetBank);
      color *= mix(min(modulation, 1.2), modulation, smoothstep(0.0, 0.4, uSkyMix));
      color = mix(color, uPaperColor, riverFoam * 0.06);
    #endif
    #ifdef SEA_WATER
      // All sea motion shares the freezeable clock, including on Low.
      float phase = uTime * ${(2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10)};
      float swell = sin(vWaterWorld.z * 0.65 + phase);
      float crossSwell = sin(vWaterWorld.x * 0.31 + vWaterWorld.z * 0.21 - phase);
      // Begin sea ripple scalars. The broad sunset wash below remains sky reflection.
      float seaDetail = mix(0.05, 1.0, (1.0 - smoothstep(2.0, 12.0, offshore)) * uHasShore);
      float seaDash = smoothstep(0.1, 0.55, cos(vWaterWorld.x * 3.2 + sin(vWaterWorld.z * 0.7)))
        * smoothstep(0.1, 0.55, cos(vWaterWorld.z * 3.2 + phase));
      float seaStroke = seaDash * seaDetail * rippleDistanceFade;
      // End sea ripple scalars.
      color = mix(color, uPaperColor, (0.5 + (0.25 * swell + 0.25 * crossSwell) * seaStroke) * 0.0175);
    #endif
    #ifdef WATER_REFLECTION
      vec3 surfaceNormal = normalize(vSurfaceNormal);
      #ifdef WATER_RIPPLES
        #ifndef SEA_WATER
        vec3 ripple = vec3(sin(flow * 0.9 + vWaterUv.x * 9.0),
                           0.0, cos(flow * 0.6 - vWaterUv.x * 13.0)) * 0.025 * rippleDistanceFade * shallowDetail;
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * ripple);
        #endif
      #endif
      #ifdef SEA_WATER
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * vec3(crossSwell, 0.0, swell) * 0.006 * seaStroke);
      #endif
      float grazing = 1.0 - clamp(dot(surfaceNormal, normalize(vViewDirection)), 0.0, 1.0);
      float fresnel = grazing * grazing * grazing;
      float reflection = fresnel * SKY_REFLECTION * mix(0.85, 1.0, uSkyMix);
      #ifndef SEA_WATER
        // Canopy leaves a peach Fresnel veil without washing the dawn stream grey.
        reflection *= mix(0.55, 1.0, smoothstep(0.0, 0.4, uSkyMix));
      #endif
      #ifdef SEA_WATER
        reflection *= mix(0.35, 1.0, smoothstep(12.0, 160.0, offshore));
      #endif
      color = mix(color, uSkyHorizon, reflection);
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
      // Subpixel gaps otherwise merge back into a straight ray, especially from the wide tour.
      float washFootprint = fwidth(alongSun * 0.24 * perspective);
      float glimmerFootprint = fwidth(alongSun * 1.7);
      wash *= 1.0 - smoothstep(0.4, 1.2, washFootprint);
      float washMarks = smoothstep(0.0, 0.65,
        cos(alongSun * 0.24 * perspective + 0.3 * sin(signedAcrossSun * 0.3)));
      // Thin transverse marks, interrupted every few metres across the sun axis.
      float glimmer = smoothstep(0.72, 0.98, 0.5 + 0.5 * sin(alongSun * 1.7 + phase
        + 0.35 * sin(signedAcrossSun * 0.42 + alongSun * 0.11)));
      glimmer *= smoothstep(0.1, 0.8, 0.5 + 0.5 * sin(signedAcrossSun * 0.82 + 2.0 * sin(alongSun * 0.37)));
      glimmer *= distanceFade;
      glimmer *= 1.0 - smoothstep(0.4, 1.2, glimmerFootprint);
      float washStrength = wash * washMarks * (0.5 + 0.14 * core + 0.24 * glimmer);
      // End sun wash scalars.
      color = mix(color, uSunWashColor, washStrength);
      float brush = 0.5 + 0.5 * sin(vWaterWorld.x * 0.73 + vWaterWorld.z * 0.27);
      // One thin cream-white edge runs up and retreats over an eight-second breath.
      float foamDistance = 0.26 + 0.04 * cos(phase);
      // A large horizon pixel must not inflate the shore edge into a broad white patch.
      float foamWidth = clamp(fwidth(offshore) * 0.8, 0.2, 0.3);
      float foam = 1.0 - smoothstep(foamWidth * 0.3, foamWidth, abs(offshore - foamDistance));
      foam *= 1.0 - smoothstep(0.5, 0.6, offshore);
      foam *= smoothstep(0.0, 0.04, offshore) * smoothstep(0.48, 0.58, brush) * 0.6 * uHasShore;
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

/** Grade lighting is baked into colour uniforms; no textures, targets or extra light uniforms. */
export class WaterMaterial extends ShaderMaterial {
  private reducedMotion = false;
  private lastSeconds: number | undefined = 0;
  private disposed = false;
  private readonly edgePigment: Color;
  private readonly deepPigment: Color;
  private readonly irradiance = new Color();
  private readonly fill = new Color();
  private readonly paper = new Color(PALETTE.paper);
  private readonly indigo = new Color(PALETTE.indigo);
  private readonly sunWash = new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.72)
    .lerp(new Color(PALETTE.flower), 0.1);

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
      deep.copy(new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.seaShallow), 0.6));
    }
    // The broad sea mirrors more of the painted sky than the shaded river.
    const defines: Record<string, number> = { SKY_REFLECTION: sea ? 0.5 : 0.22, WATER_REFLECTION: 1 };
    if (sea) defines.SEA_WATER = 1;
    if (quality !== "Low") defines.WATER_FLOW = 1;
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
          uSkyHorizon: { value: new Color() },
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
    this.edgePigment = edge;
    this.deepPigment = deep;
    this.setGrade(options.grade ?? lightingAt(sea ? 1 : 0));
    this.setSkyMix(options.skyMix ?? (sea ? 1 : 0));
    if (options.sunDirection) this.setSunDirection(options.sunDirection);
  }

  /** Flat-surface half-Lambert + hemisphere, with the same Lambert BRDF as terrain.
   * Pigment, strokes and foam receive irradiance; Fresnel receives sky radiance.
   * Uniform count and geometry stay unchanged.
   */
  setGrade(grade: LightingGrade): void {
    if (this.disposed) return;
    const sea = Boolean(this.defines.SEA_WATER);
    const halfLambert = Math.max(0, Math.min(1, grade.sunDirection.y * 0.5 + 0.5));
    this.fill.copy(grade.hemiSky).multiplyScalar(grade.hemiIntensity);
    this.irradiance.copy(grade.sunColor).multiplyScalar(grade.sunIntensity * (0.25 + 0.75 * halfLambert))
      .add(this.fill).multiplyScalar(1 / Math.PI);
    // The shaded stream sits beside dark wet soil (B2-190), including its lit strokes.
    const absorption = sea ? 0.85 : 0.2;
    this.uniforms.uEdgeColor!.value.copy(this.edgePigment).multiply(this.irradiance).multiplyScalar(absorption);
    // Low warm sun shifts the open sea toward indigo without changing the turquoise banks.
    const dusk = Math.max(0, Math.min(1, grade.sunColor.r - grade.sunColor.b));
    this.uniforms.uDeepColor!.value.copy(this.deepPigment).lerp(this.indigo, sea ? dusk * 0.8 : 0)
      .multiply(this.irradiance).multiplyScalar(absorption);
    this.uniforms.uPaperColor!.value.copy(this.paper).multiply(this.irradiance).multiplyScalar(absorption);
    // Fresnel reflects incoming sky radiance, independent of irradiance on the water.
    // Keep this on Low too: a static reflection needs no animated flow or extra pass.
    // The grade's eastern dawn direction proxies forest canopy; it releases toward
    // noon and leaves the open western coast untouched, without needing path state.
    const skyVisibility = sea ? 1 : 1 - 0.74 * Math.max(0, -grade.sunDirection.x);
    this.uniforms.uSkyHorizon!.value.copy(grade.skyHorizon).multiplyScalar((sea ? 0.5 : 0.45) * skyVisibility);
    this.uniforms.uSunWashColor!.value.copy(this.sunWash).multiply(grade.sunColor)
      .multiplyScalar(grade.sunIntensity * 0.65);
    this.setSunDirection(grade.sunDirection);
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
