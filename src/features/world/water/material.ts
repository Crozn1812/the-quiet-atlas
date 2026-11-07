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
  // Begin water noise functions.
  // fract hashes integer lattice corners only; it never bands the flow coordinate.
  float waterHash(float x, float y) {
    float a = fract(x * 0.1031);
    float b = fract(y * 0.1030);
    float c = fract(x * 0.0973);
    float d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    return fract((a + b + 2.0 * d) * (c + d));
  }
  float waterNoise(float x, float y) {
    float ix = floor(x);
    float iy = floor(y);
    float ux = x - ix;
    float uy = y - iy;
    ux = ux * ux * (3.0 - 2.0 * ux);
    uy = uy * uy * (3.0 - 2.0 * uy);
    return mix(mix(waterHash(ix, iy), waterHash(ix + 1.0, iy), ux),
               mix(waterHash(ix, iy + 1.0), waterHash(ix + 1.0, iy + 1.0), ux), uy);
  }
  float waterField(float across, float along) {
    // Warp the isotropic domain, stretched 3:1 along the metre-based flow.
    float x = across * 9.0;
    float y = along * 3.0;
    float wx = waterNoise(x * 0.47 + 19.1, y * 0.47 - 7.3);
    float wy = waterNoise(x * 0.47 - 31.7, y * 0.47 + 43.8);
    return waterNoise(x + 1.6 * wx, y + 1.6 * wy);
  }
  float waterStreak(float across, float along) {
    return smoothstep(0.68, 0.94, waterField(across, along));
  }
  // End water noise functions.
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
      // Headland secants in z(x) are not local shore normals: bound their reach
      // so shallow-colour columns cannot project hundreds of metres offshore.
      float distanceSlope = clamp(slope, -1.0, 1.0);
      float offshore = (shoreZ - vWaterWorld.z) / sqrt(1.0 + distanceSlope * distanceSlope);
      float shallows = (1.0 - smoothstep(12.0, 40.0, offshore)) * uHasShore;
      color = mix(uDeepColor, uEdgeColor, shallows);
    #endif
    float rippleDistanceFade = 1.0 - smoothstep(15.0, 40.0, length(vWaterWorld - cameraPosition));
    #ifndef SEA_WATER
      // River-only detail: ribbon UVs measure distance across and along the channel.
      // Inverse world-space UV gradient measures ribbon width under perspective.
      float riverWidth = length(cross(dFdx(vWaterWorld), dFdy(vWaterWorld)))
        / max(length(dFdx(vWaterUv.x) * dFdy(vWaterWorld)
          - dFdy(vWaterUv.x) * dFdx(vWaterWorld)), 0.000001);
      float bankDistance = (1.0 - edge) * riverWidth * 0.5;
      // Begin river detail scalars.
      float across = vWaterUv.x * riverWidth;
      float stroke = waterStreak(across, flow);
      float shallowDetail = mix(0.05, 1.0, 1.0 - smoothstep(8.0, 18.0, riverWidth));
      shallowDetail = max(shallowDetail, 1.0 - smoothstep(0.8, 2.5, bankDistance));
      // Soft isolated highlights add at most twelve percent to the lit pigment.
      float modulation = 1.0 + 0.12 * stroke
        * (1.0 - smoothstep(0.6, 1.0, edge)) * shallowDetail * rippleDistanceFade;
      float riverBrush = 0.5 + 0.5 * sin(flow * 1.73 + 1.2 * sin(flow * 0.43) + vWaterUv.x * 11.0);
      float riverFoam = (1.0 - smoothstep(0.2, 0.6, bankDistance))
        * smoothstep(0.48, 0.58, riverBrush);
      // End river detail scalars.
      // A metre-based wet margin blends into the existing edge pigment.
      float wetBank = 1.0 - smoothstep(0.0, 0.55, bankDistance);
      color = mix(color, uEdgeColor * 0.92, wetBank);
      color *= modulation;
      color = mix(color, uPaperColor, riverFoam * 0.06);
    #endif
    #ifdef SEA_WATER
      // All sea motion shares the freezeable clock, including on Low.
      float phase = uTime * ${(2 * Math.PI / SEA_WAVE_PERIOD).toFixed(10)};
      float swell = waterField(vWaterWorld.x, vWaterWorld.z - uTime * 0.05) - 0.5;
      float crossSwell = waterField(vWaterWorld.x + 0.11, vWaterWorld.z - uTime * 0.05) - 0.5;
      // Begin sea ripple scalars. The broad sunset wash below remains sky reflection.
      float seaDetail = mix(0.05, 1.0, (1.0 - smoothstep(2.0, 12.0, offshore)) * uHasShore);
      float seaStroke = waterStreak(vWaterWorld.x, vWaterWorld.z - uTime * 0.05)
        * seaDetail * rippleDistanceFade;
      // End sea ripple scalars.
      color = mix(color, uPaperColor, 0.00875);
      color *= 1.0 + 0.12 * seaStroke;
    #endif
    #ifdef WATER_REFLECTION
      vec3 surfaceNormal = normalize(vSurfaceNormal);
      #ifdef WATER_RIPPLES
        #ifndef SEA_WATER
        vec3 ripple = vec3(waterField(across + 0.11, flow) - 0.5,
                           0.0, waterField(across, flow + 0.11) - 0.5) * 0.008 * rippleDistanceFade * shallowDetail;
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
        reflection = max(reflection, 0.07) * mix(0.8, 1.0, smoothstep(0.0, 0.4, uSkyMix));
      #endif
      #ifdef SEA_WATER
        reflection *= mix(0.35, 1.0, smoothstep(12.0, 160.0, offshore));
        // A restrained sky veil offshore opens into the actual sky at the horizon.
        // Elevation only: no azimuth lobes or alternating camera-centred bands.
        reflection *= mix(0.18, 2.0, smoothstep(0.995, 1.0, grazing));
      #endif
      color = mix(color, uSkyHorizon, reflection);
      #ifdef SEA_WATER
        // Reflect the warm horizon on the sunward side and retain lit indigo
        // elsewhere. This broad sky gradient is independent of the narrow glints.
        vec2 horizonRay = vWaterWorld.xz - cameraPosition.xz;
        vec2 horizonSun = uSunDirection.xz;
        float skyAlignment = dot(horizonRay, horizonSun)
          / max(length(horizonRay) * length(horizonSun), 0.0001);
        // Begin sea horizon scalars.
        float coolReflection = reflection * (1.0 - smoothstep(-0.15, 0.85, skyAlignment))
          * (1.0 - smoothstep(0.995, 1.0, grazing));
        // End sea horizon scalars.
        color += (uDeepColor - uSkyHorizon) * coolReflection;
      #endif
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
      float washWidth = mix(24.0, 5.6, smoothstep(12.0, 360.0, alongSun));
      float washDistance = sqrt(alongSun * alongSun + acrossSun * acrossSun);
      float distanceFade = 1.0 - smoothstep(120.0, 640.0, washDistance);
      // tan(12 degrees): soften the entire sun corridor to zero at its edge.
      float angularWidth = max(alongSun, 0.0) * 0.21255656;
      float angularFade = 1.0 - smoothstep(0.0, max(angularWidth, 0.0001), acrossSun);
      float wash = (1.0 - smoothstep(0.0, washWidth, acrossSun)) * angularFade;
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
      float washStrength = 0.7 * wash * washMarks * (0.5 + 0.14 * core + 0.24 * glimmer);
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
    // The coast stream opens out of canopy shade with the position-driven air;
    // keep it readable beside asphalt while retaining the darker forest ribbon.
    const absorption = sea ? 0.85 : 0.32 - 0.04 * (grade.coastWeight ?? 0);
    this.uniforms.uEdgeColor!.value.copy(this.edgePigment).multiply(this.irradiance).multiplyScalar(absorption);
    // Low warm sun shifts the open sea toward indigo without changing the turquoise banks.
    const dusk = Math.max(0, Math.min(1, grade.sunColor.r - grade.sunColor.b));
    this.uniforms.uDeepColor!.value.copy(this.deepPigment).lerp(this.indigo, sea ? dusk * 0.8 : 0)
      .multiply(this.irradiance).multiplyScalar(absorption);
    if (sea) {
      // Preserve deep blue under warm sun while brightness still follows incident light.
      const energy = this.irradiance.r * 0.2126 + this.irradiance.g * 0.7152 + this.irradiance.b * 0.0722;
      this.fill.copy(this.deepPigment).lerp(this.indigo, dusk).multiplyScalar(energy * absorption);
      this.uniforms.uDeepColor!.value.lerp(this.fill, dusk * 0.85).multiplyScalar(1.85);
      // Neutral absorption keeps jade dark while reducing its displayed chroma.
      const edge = this.uniforms.uEdgeColor!.value as Color;
      const grey = edge.r * 0.2126 + edge.g * 0.7152 + edge.b * 0.0722;
      edge.lerp(this.fill.setRGB(grey, grey, grey), 0.65).multiplyScalar(0.7);
    }
    this.uniforms.uPaperColor!.value.copy(this.paper).multiply(this.irradiance).multiplyScalar(absorption);
    // Fresnel reflects incoming sky radiance, independent of irradiance on the water.
    // Keep this on Low too: a static reflection needs no animated flow or extra pass.
    // The grade's eastern dawn direction proxies forest canopy; it releases toward
    // noon and leaves the open western coast untouched, without needing path state.
    const skyVisibility = sea ? 1 : 1 - 0.74 * Math.max(0, -grade.sunDirection.x);
    this.uniforms.uSkyHorizon!.value.copy(grade.skyHorizon).multiplyScalar((sea ? 0.5 : 0.45) * skyVisibility);
    if (sea) {
      // Reflect the actual horizon radiance; Fresnel controls its weight in GLSL.
      this.uniforms.uSkyHorizon!.value.copy(grade.skyHorizon);
    }
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
