import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGFormat,
  ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { lightingAt, type LightingGrade } from "../sky/grade";
import type { Quality } from "../terrain";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import { SURF_GLSL } from "../../audio/waves";
import { createSeaNormal, SEA_OPTICS_GLSL } from "../shore/sea-optics";
import { SEA_DEPTH_GLSL, type SeaDepthField } from "../shore/sea-depth";

export const WATER_FLOW_SPEED = 0.05;
export const SEA_WAVE_PERIOD = 8;
// 109 coast samples; C adds one sky colour and two static source vectors.
export const SEA_SHORE_SAMPLES = 109;
/** Shoreline slope |dz/dx| above which the foam line fades out (bay corners after B2-152b). */
export const SEA_FOAM_MAX_SLOPE = 3;

/** Tileable ripple slopes, made once on the CPU (32 KB, no network asset).
 * Periodic gradient-noise octaves at unrelated orientations: no dominant wave
 * vector, so the surface never reads as parallel ruled bands. */
export const FLOW_NORMAL_SIZE = 128;
function createFlowNormal(): DataTexture {
  const size = FLOW_NORMAL_SIZE, height = new Float32Array(size * size);
  let state = 0x9e3779b9;
  const random = () => { state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return state / 4294967296; };
  // Periodic value-gradient noise on an integer lattice that wraps at "period".
  function octave(period: number, amplitude: number) {
    const gradients = Array.from({ length: period * period }, () => { const a = random() * Math.PI * 2; return [Math.cos(a), Math.sin(a)] as const; });
    const g = (x: number, y: number) => gradients[((y % period + period) % period) * period + (x % period + period) % period]!;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size * period, v = y / size * period, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
      const dot = (cx: number, cy: number) => { const [gx, gy] = g(ix + cx, iy + cy); return gx * (fx - cx) + gy * (fy - cy); };
      const sx = fade(fx), sy = fade(fy);
      const top = dot(0, 0) + (dot(1, 0) - dot(0, 0)) * sx, bottom = dot(0, 1) + (dot(1, 1) - dot(0, 1)) * sx;
      const k = y * size + x; height[k] = height[k]! + (top + (bottom - top) * sy) * amplitude;
    }
  }
  for (const [period, amplitude] of [[4, 1], [7, 0.62], [12, 0.4], [21, 0.24], [32, 0.13]] as const) octave(period, amplitude);
  // Sharpen crests slightly (trochoidal water) before differentiating.
  for (let i = 0; i < height.length; i++) height[i] = Math.sign(height[i]!) * Math.pow(Math.abs(height[i]!), 0.85);
  const slopes = new Float32Array(size * size * 2);
  let peak = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = (ix: number, iy: number) => height[((iy + size) % size) * size + (ix + size) % size]!;
    const dx = (h(x + 1, y) - h(x - 1, y)) / 2, dy = (h(x, y + 1) - h(x, y - 1)) / 2;
    slopes[(y * size + x) * 2] = dx; slopes[(y * size + x) * 2 + 1] = dy;
    peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
  }
  const data = new Uint8Array(size * size * 2);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, slopes[i]! / peak * 1.25)));
  const texture = new DataTexture(data, size, size, RGFormat);
  texture.name = "stream-flow-normal";
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export interface WaterMaterialOptions {
  surface?: "river" | "sea";
  /** Internal second draw for the terrain-conforming wet stream margin. */
  wetBank?: boolean;
  /** Reflection weight from morning (0) to dusk (1); setGrade supplies linear sky colours. */
  skyMix?: number;
  /** World-space direction toward the sun, supplied by the lighting grade. */
  sunDirection?: Readonly<Vector3>;
  /** Player-local lighting, including any directed/coast atmosphere adjustments. */
  grade?: LightingGrade;
  /** Sampled outer coastline; absent on standalone materials and river ribbons. */
  shoreline?: { minX: number; width: number; z: readonly number[]; valid?: readonly number[] };
  /** Sea-only static terrain field; ownership transfers to the material. */
  seaDepth?: SeaDepthField;
}

const vertexShader = /* glsl */ `
  varying vec2 vWaterUv;
  varying vec3 vWaterWorld;
  #if defined(C_WATER) || defined(RIVER_DEPTH)
    attribute vec3 waterBedDepth;
    varying vec3 vBedDepth;
    varying float vCascade;
  #endif
  #ifndef SEA_WATER
    attribute vec3 waterTangent;
    varying vec3 vWaterTangent;
  #endif
  #ifdef WATER_REFLECTION
    varying vec3 vViewDirection;
    varying vec3 vSurfaceNormal;
  #endif
  #include <fog_pars_vertex>
  void main() {
    vWaterUv = uv;
    vWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    #if defined(C_WATER) || defined(RIVER_DEPTH)
      vBedDepth = waterBedDepth;
      vCascade = 1.0 - smoothstep(0.7, 0.98, abs(normalize(mat3(modelMatrix) * normal).y));
    #endif
    #ifndef SEA_WATER
      vWaterTangent = mat3(modelMatrix) * waterTangent;
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
  uniform vec3 uSkyHorizon;
  #if defined(C_WATER) || defined(RIVER_DEPTH)
    uniform vec3 uSkyTop;
    #ifndef SEA_WATER
      uniform vec3 uSpringOrigin;
      uniform vec3 uSpringForward;
    #endif
    varying vec3 vBedDepth;
    varying float vCascade;
  #endif
  uniform float uSkyMix;
  uniform float uTime;
  varying vec2 vWaterUv;
  uniform vec3 uSunDirection;
  uniform vec3 uSunWashColor;
  #ifndef SEA_WATER
    uniform float uCoastWeight;
  #endif
  #ifdef SEA_WATER
    uniform vec2 uShoreBounds;
    uniform float uShoreZ[${SEA_SHORE_SAMPLES}];
    uniform float uHasShore;
    #define SEA_FOAM_MAX_SLOPE ${SEA_FOAM_MAX_SLOPE.toFixed(1)}
  #endif
  varying vec3 vWaterWorld;
  #ifndef SEA_WATER
    varying vec3 vWaterTangent;
    uniform sampler2D uStreamDepth;
    uniform vec2 uStreamSize;
    uniform float uStreamLength;
    uniform float uHasStreamDepth;
    #ifdef WATER_RIPPLES
      uniform sampler2D uFlowNormal;
    #endif
  #endif
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
  #if defined(WATER_RIPPLES) && !defined(SEA_WATER)
  // Animated cellular network: the bright focusing lines of sunlight through ripples.
  float waterCausticCells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float first = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = vec2(waterHash(i.x + o.x, i.y + o.y), waterHash(i.x + o.x + 41.0, i.y + o.y - 23.0));
      vec2 r = o + 0.5 + 0.42 * sin(t + 6.2831 * h) - f;
      float d = dot(r, r);
      if (d < first) { second = first; first = d; } else if (d < second) second = d;
    }
    return sqrt(second) - sqrt(first);
  }
  float waterCaustic(vec2 p, float t) {
    float a = waterCausticCells(p, t);
    float b = waterCausticCells(mat2(0.8, -0.6, 0.6, 0.8) * p * 1.37 + 5.3, t * 1.21 + 2.0);
    float lines = (1.0 - smoothstep(0.0, 0.32, a)) * 0.6 + (1.0 - smoothstep(0.0, 0.36, b)) * 0.4;
    return lines * lines * lines;
  }
  #endif
  #ifdef SEA_WATER
    ${SURF_GLSL}
    ${SEA_OPTICS_GLSL}
    ${SEA_DEPTH_GLSL}
  #endif
  float waterAbsorption(float depth) {
    return 1.0 - exp(-max(depth, 0.0) * 0.85);
  }
  float waterOpacity(float absorption, float reflection) {
    return mix(mix(0.22, 0.78, absorption), 0.94, clamp(reflection, 0.0, 1.0));
  }
  void main() {
    // UV.y is downstream distance in metres, so this translation is 0.05 m/s.
    float flow = vWaterUv.y;
    #ifdef WATER_FLOW
      flow -= uTime * ${WATER_FLOW_SPEED};
    #endif
    float edge = abs(vWaterUv.x * 2.0 - 1.0);
    vec3 color = mix(uDeepColor, uEdgeColor, smoothstep(0.0, 1.0, edge));
    #ifdef SEA_WATER
      // This finite coastline serves SURF-01 only, never water pigment/depth.
      float shoreSample = clamp((vWaterWorld.x - uShoreBounds.x) / uShoreBounds.y,
                                0.0, 1.0) * ${(SEA_SHORE_SAMPLES - 1).toFixed(1)};
      int shoreIndex = int(min(floor(shoreSample), ${(SEA_SHORE_SAMPLES - 2).toFixed(1)}));
      float shoreA = uShoreZ[shoreIndex];
      float shoreB = uShoreZ[shoreIndex + 1];
      float validA = 1.0 - smoothstep(9999.0, 10000.0, shoreA);
      float validB = 1.0 - smoothstep(9999.0, 10000.0, shoreB);
      float weight = shoreSample - float(shoreIndex);
      float shoreValid = min(validA, validB);
      // Unsafe samples encode a break in the coast, not a distant shoreline.
      // Use the real endpoint beside a break; never interpolate the sentinel Z.
      float safeA = mix(shoreB, shoreA, validA);
      float safeB = mix(shoreA, shoreB, validB);
      float shoreZ = mix(safeA, safeB, weight);
      float shoreWidth = uShoreBounds.y / ${(SEA_SHORE_SAMPLES - 1).toFixed(1)};
      float shoreDeltaZ = safeB - safeA;
      // Beside a break the only known coast is the valid endpoint, not a new
      // horizontal segment extending across the rejected inlet.
      float segmentWidth = shoreWidth * shoreValid;
      float shoreDx = vWaterWorld.x - (uShoreBounds.x
        + (float(shoreIndex) + (1.0 - validA) * validB) * shoreWidth);
      float shoreDz = vWaterWorld.z - safeA;
      // A finite segment cannot paint shallows along an infinite inland secant.
      float projection = clamp((shoreDx * segmentWidth + shoreDz * shoreDeltaZ)
        / max(segmentWidth * segmentWidth + shoreDeltaZ * shoreDeltaZ, 0.000001), 0.0, 1.0);
      float nearestDx = shoreDx - projection * segmentWidth;
      float nearestDz = shoreDz - projection * shoreDeltaZ;
      float offshore = sqrt(nearestDx * nearestDx + nearestDz * nearestDz);
      float slope = shoreDeltaZ / shoreWidth;
      // Blend influence itself at a break. Mixing the distance with 1000 m
      // squeezed its colour/reflection transition into a visible diagonal wedge.
      float shoreInfluence = mix(validA, validB, smoothstep(0.0, 1.0, weight))
        * smoothstep(0.0, 0.04, shoreZ - vWaterWorld.z) * uHasShore;
      float seaBedDepth = 3.0;
      float seaCoverage = 1.0;
      #ifdef SEA_DEPTH
        vec2 depthUv = (vWaterWorld.xz - uSeaDepthBounds.xy) / uSeaDepthBounds.zw;
        // Clamp to real boundary samples: the outer submerged shelf is already
        // deep pigment. No rectangular falloff or extrapolated coast triangles.
        depthUv = depthUv * (1.0 - 1.0 / uSeaDepthSize) + 0.5 / uSeaDepthSize;
        vec2 terrainDepth = texture2D(uSeaDepth, depthUv).rg;
        seaBedDepth = terrainDepth.r * 4.0 - 1.0;
        seaCoverage = terrainDepth.g;
        if (seaCoverage < 0.01) discard;
      #endif
      float shallows = seaShallows(seaBedDepth);
      color = mix(uDeepColor, uEdgeColor, shallows);
    #endif
    float rippleDistanceFade = 1.0 - smoothstep(15.0, 40.0, length(vWaterWorld - cameraPosition));
    #if defined(C_WATER) || defined(RIVER_DEPTH)
      // Dense signed ribbon depth, or the legacy three-point source/fish profile.
      float bedDepth = mix(mix(vBedDepth.x, vBedDepth.y, min(vWaterUv.x * 2.0, 1.0)),
        mix(vBedDepth.y, vBedDepth.z, max(vWaterUv.x * 2.0 - 1.0, 0.0)), step(0.5, vWaterUv.x));
      #ifdef SEA_WATER
        bedDepth = seaBedDepth;
      #else
        if (uHasStreamDepth > 0.5) {
          vec2 depthUv = vec2(vWaterUv.x, vWaterUv.y / uStreamLength);
          depthUv = depthUv * (1.0 - 1.0 / uStreamSize) + 0.5 / uStreamSize;
          bedDepth = texture2D(uStreamDepth, depthUv).r * 4.0 - 1.0;
        }
      #endif
      float opticalDepth = waterAbsorption(bedDepth);
      // Sea pigment already follows actual depth; absorption controls opacity.
      #ifndef SEA_WATER
        color = mix(uEdgeColor, uDeepColor, opticalDepth);
      #endif
    #endif
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
    #if defined(RIVER_DEPTH) && !defined(WATER_FLOW)
      color = mix(uEdgeColor, uDeepColor, opticalDepth);
    #endif
    #ifdef SEA_WATER
      // All sea motion shares the freezeable clock, including on Low.
      float surfPhase = surfCycle(uTime, vWaterWorld.x);
      float breakerDistance = mix(11.0, 0.0, smoothstep(0.0, 0.27, surfPhase));
      float breaker = exp(-pow((offshore - breakerDistance) / 0.65, 2.0))
        * (1.0 - smoothstep(0.27, 0.4, surfPhase)) * shoreInfluence * shoreValid;
      vec2 seaSurfaceSlopes = seaSlopes(vWaterWorld.xz, uTime);
      color = mix(color, uPaperColor, 0.00875);
      #ifdef C_WATER
        // Long, low swells turn toward shore; no CPU deformation or new water mesh.
        float longSwell = sin(vWaterWorld.z * 0.22 - uTime * 0.62 + sin(vWaterWorld.x * 0.025));
        color *= 1.0 + longSwell * 0.025;
        color *= 1.0 + breaker * 0.12;
      #endif
    #endif
    vec2 rippleSlopes = vec2(0.0);
    #ifdef WATER_REFLECTION
      vec3 surfaceNormal = normalize(vSurfaceNormal);
      #ifdef WATER_RIPPLES
        #ifndef SEA_WATER
        // Scroll a two-scale normal field in metre-based ribbon coordinates,
        // then rotate it by the local spline tangent, including every bend.
        vec3 downstream = normalize(vWaterTangent);
        vec3 crossStream = vec3(-downstream.z, 0.0, downstream.x);
        // Flow-map advection: the surface travels downstream at a varying
        // speed with slow eddies, two staggered phases hide each restart.
        vec2 metres = vec2(across, vWaterUv.y);
        float eddyX = waterNoise(across * 0.7 + 7.0, vWaterUv.y * 0.32 - uTime * 0.04) - 0.5;
        float eddyY = waterNoise(across * 0.7 - 3.0, vWaterUv.y * 0.32 + 11.0 - uTime * 0.04) - 0.5;
        float current = 0.25 + 0.75 * smoothstep(0.0, 1.6, bankDistance);
        vec2 drift = vec2(eddyX * 1.3, 1.0 + eddyY * 0.7) * 0.42 * current;
        float cycle = uTime * 0.4;
        float phaseA = fract(cycle), phaseB = fract(cycle + 0.5);
        float weightA = 1.0 - abs(1.0 - 2.0 * phaseA);
        vec2 uvA = metres - drift * phaseA * 2.5, uvB = metres - drift * phaseB * 2.5 + vec2(0.37, 0.61);
        mat2 turn = mat2(0.6, 0.8, -0.8, 0.6);
        vec2 slopes = mix(
          texture2D(uFlowNormal, uvB / 2.6).rg + texture2D(uFlowNormal, turn * uvB / 0.9).rg * 0.75,
          texture2D(uFlowNormal, uvA / 2.6).rg + texture2D(uFlowNormal, turn * uvA / 0.9).rg * 0.75,
          weightA) / 1.75 * 2.0 - 1.0;
        float nearRipple = 1.0 - smoothstep(18.0, 75.0, length(vWaterWorld - cameraPosition));
        vec3 ripple = (crossStream * slopes.x + downstream * slopes.y) * (0.05 + 0.17 * nearRipple);
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * ripple);
        rippleSlopes = slopes * nearRipple;
        #endif
      #endif
      #ifdef SEA_WATER
        surfaceNormal = normalize(mat3(viewMatrix) * vec3(seaSurfaceSlopes.x, 1.0, seaSurfaceSlopes.y));
        #ifdef C_WATER
          // Optical crest slope lifts the lip before it breaks, on the same existing sea quad.
          float crestSlope = breaker * (offshore - breakerDistance) * 0.22;
          surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * vec3(0.0, 0.0, crestSlope));
        #endif
      #endif
      float grazing = 1.0 - clamp(dot(surfaceNormal, normalize(vViewDirection)), 0.0, 1.0);
      float fresnel = grazing * grazing * grazing;
      float reflection = fresnel * SKY_REFLECTION * mix(0.85, 1.0, uSkyMix);
      #ifndef SEA_WATER
        // Water F0 is about two percent; a low view opens into the sky.
        reflection = (0.02 + 0.98 * pow(grazing, 5.0)) * SKY_REFLECTION;
      #endif
      #ifdef SEA_WATER
        reflection = 0.02 + 0.98 * pow(grazing, 5.0);
      #endif
      color = mix(color, uSkyHorizon, reflection);
      #ifdef C_WATER
        // Cheap sky IBL: reflect the view ray into the runtime sky gradient.
        // Row-vector multiplication undoes the view rotation (including pitch).
        vec3 reflectedRay = reflect(-normalize(vViewDirection), surfaceNormal) * mat3(viewMatrix);
        vec3 skyRadiance = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.85, reflectedRay.y));
        color += (skyRadiance - uSkyHorizon) * reflection;
      #endif
      #ifndef SEA_WATER
        vec3 worldNormal = surfaceNormal * mat3(viewMatrix);
        vec3 worldView = normalize(cameraPosition - vWaterWorld);
        vec3 halfSun = normalize(worldView + uSunDirection);
        float sunGlint = pow(max(dot(worldNormal, halfSun), 0.0), 160.0)
          * smoothstep(0.0, 0.15, uSunDirection.y) * rippleDistanceFade;
        color += uSunWashColor * sunGlint * 0.12;
        // Only the open coastal reach receives sunset; forest water stays shaded.
        vec2 riverRay = vWaterWorld.xz - cameraPosition.xz;
        float riverAlignment = dot(riverRay, uSunDirection.xz)
          / max(length(riverRay) * length(uSunDirection.xz), 0.0001);
        // Begin river sunset scalars.
        float riverSunset = uCoastWeight * 0.08 * smoothstep(-0.15, 0.95, riverAlignment)
          * (1.0 - smoothstep(0.65, 0.95, grazing));
        // End river sunset scalars.
        color = mix(color, uSunWashColor, riverSunset);
      #endif
      #ifdef SEA_WATER
        // The reflected horizon follows the sun azimuth, with cool open sky
        // on the other side. No camera-pitch masks or painted colour stripes.
        vec2 horizonRay = vWaterWorld.xz - cameraPosition.xz;
        vec2 horizonSun = uSunDirection.xz;
        float skyAlignment = dot(horizonRay, horizonSun)
          / max(length(horizonRay) * length(horizonSun), 0.0001);
        color += (uDeepColor - uSkyHorizon) * reflection * 0.45
          * (1.0 - smoothstep(-0.15, 0.85, skyAlignment));
      #endif
    #endif
    #ifndef WATER_REFLECTION
      float reflection = 0.0;
    #endif
    #ifdef SEA_WATER
      // Anisotropic microfacet slopes stretch the sun reflection toward the eye.
      vec2 sunAxis = uSunDirection.xz / max(length(uSunDirection.xz), 0.0001);
      vec3 worldView = normalize(cameraPosition - vWaterWorld);
      vec3 halfSun = normalize(worldView + uSunDirection);
      vec2 halfSlope = halfSun.xz / max(halfSun.y, 0.08);
      float halfAcross = dot(halfSlope - seaSurfaceSlopes, vec2(-sunAxis.y, sunAxis.x));
      float halfAlong = dot(halfSlope - seaSurfaceSlopes, sunAxis);
      float footprint = length(fwidth(vWaterWorld.xz));
      float variance = 0.035 + min(footprint * 0.018, 0.07);
      float facing = smoothstep(0.0, 0.06, uSunDirection.y)
        * smoothstep(-0.05, 0.25, dot(-worldView.xz, sunAxis));
      float glitter = seaGlitter(halfAcross, halfAlong, variance, facing);
      color += uSunWashColor * glitter * 2.8;
      // Sea aerosol merges the water into the sky without an exposed quad edge.
      float mist = seaMist(length(cameraPosition - vWaterWorld), abs(worldView.y));
      color = mix(color, uSkyHorizon, mist);
      // Breaking crests tear into clumps and gaps; never one continuous white rule.
      float brush = smoothstep(0.32, 0.72, 0.62 * waterNoise(vWaterWorld.x * 0.55 + 3.1, vWaterWorld.z * 1.4 - uTime * 0.25)
        + 0.38 * waterNoise(vWaterWorld.x * 2.9 - uTime * 0.1, vWaterWorld.z * 4.3));
      float foam = 0.0;
      #ifdef C_WATER
        // Crest whitens in the last metres, then joins the terrain-conforming uprush.
        foam = breaker * smoothstep(0.1, 0.22, surfPhase) * brush * 0.8;
      #endif
      // Where the sampled coast turns back on itself (bay corners, spits) z(x) jumps between samples: no foam there.
      foam *= 1.0 - smoothstep(SEA_FOAM_MAX_SLOPE * 0.5, SEA_FOAM_MAX_SLOPE, abs(slope));
      color = mix(color, uPaperColor, foam);
    #endif
    float opacity = 1.0;
    #if defined(C_WATER) && defined(SEA_WATER)
      // Reveal submerged shore stones; offshore and rejected secants stay opaque.
      opacity = mix(0.3, 1.0, smoothstep(0.0, 0.98, opticalDepth));
      opacity = mix(opacity, 1.0, clamp(reflection, 0.0, 1.0));
    #endif
    #ifdef SEA_WATER
      opacity *= seaCoverage;
    #endif
    #ifndef SEA_WATER
      #ifdef RIVER_DEPTH
        // Beer-Lambert absorption: shallow stones and fish remain visible.
        // Reflected light and whitewater obscure the bed at grazing angles.
        // Reflection covers the bed at grazing angles even when the artistic
        // sky-radiance weight is attenuated beneath the forest canopy.
        opacity = waterOpacity(opticalDepth, reflection / SKY_REFLECTION);
        // Zero alpha BEFORE the actual terrain intersection: a nonzero stain
        // here would be cut by the 2 m terrain triangles, exposing every step.
        float waterCoverage = smoothstep(0.025, 0.32, bedDepth);
        opacity *= waterCoverage;
        opacity *= smoothstep(0.0, 0.06, 1.0 - edge);
        #ifdef C_WATER
        vec2 fromSpring = vWaterWorld.xz - uSpringOrigin.xz;
        float springAlong = dot(fromSpring, uSpringForward.xz);
        float springAcross = dot(fromSpring, vec2(-uSpringForward.z, uSpringForward.x));
        float impact = (1.0 - smoothstep(0.3, 1.15, abs(springAlong + 0.7)))
          * (1.0 - smoothstep(0.35, 1.0, abs(springAcross)));
        float bubbles = smoothstep(0.52, 0.8, waterField(springAcross, springAlong - uTime * 0.1));
        float sourceFoam = max(vCascade * 0.25, impact * 0.4) * bubbles * rippleDistanceFade;
        color = mix(color, uPaperColor, sourceFoam);
        opacity = mix(opacity, 0.92 * waterCoverage, max(sourceFoam, vCascade * 0.7));
        // Restrained broken whitewater in narrow, shallow runs only.
        float rapid = (1.0 - smoothstep(0.25, 0.65, bedDepth))
          * smoothstep(0.06, 0.18, bedDepth) * (1.0 - smoothstep(3.0, 7.0, riverWidth));
        color = mix(color, uPaperColor, rapid * stroke * 0.09 * rippleDistanceFade);
        #ifdef WATER_RIPPLES
        // Caustics are drawn where the refracted view ray meets the bed, so
        // they keep correct parallax over stones and gravel.
        vec3 toEye = normalize(cameraPosition - vWaterWorld);
        vec2 bedPoint = vWaterWorld.xz - toEye.xz / max(toEye.y, 0.25) * max(bedDepth, 0.0) * 0.75;
        bedPoint += rippleSlopes * 0.12;
        vec2 causticUv = bedPoint * 3.4;
        float causticFilter = 1.0 - smoothstep(0.12, 0.45, length(fwidth(causticUv)));
        float caustic = waterCaustic(causticUv, uTime * 0.9) * causticFilter
          * (1.0 - opticalDepth * 0.7) * waterCoverage * (1.0 - smoothstep(0.0, 0.25, max(sourceFoam, vCascade)));
        float sunThrough = smoothstep(0.0, 0.2, uSunDirection.y);
        vec3 causticLight = uSunWashColor * 1.6 + uEdgeColor * 0.6;
        float causticAlpha = caustic * 0.16 * sunThrough;
        // Light focused on the bed: added beneath the surface tint.
        color = (color * opacity + causticLight * causticAlpha) / max(opacity + causticAlpha, 0.0001);
        opacity = min(1.0, opacity + causticAlpha * (1.0 - opacity));
        // Ripple lensing slightly darkens/brightens the see-through layer.
        color *= 1.0 + dot(rippleSlopes, vec2(0.45, 0.7)) * 0.25;
        #endif
        #endif
      #endif
    #endif
    #ifdef STREAM_WET_BANK
      color = uDeepColor * 0.35;
      // This strip sits on the ground. Fade both boundaries, including dry
      // approaches, so neither its perimeter nor the water cut forms a line.
      opacity = 0.24 * smoothstep(-0.20, -0.015, bedDepth)
        * (1.0 - smoothstep(0.08, 0.30, bedDepth));
      opacity *= smoothstep(0.0, 0.04, 1.0 - edge);
    #endif
    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Grade-lit pigment plus sky radiance; the stream owns one 8 KB normal map. */
export class WaterMaterial extends ShaderMaterial {
  private reducedMotion = false;
  private lastSeconds: number | undefined = 0;
  private disposed = false;
  private readonly flowNormal?: DataTexture;
  private readonly seaNormal?: DataTexture;
  private readonly seaDepth?: DataTexture;
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
      || shore.z.length !== SEA_SHORE_SAMPLES || !shore.z.every(Number.isFinite)
      || (shore.valid && (shore.valid.length !== SEA_SHORE_SAMPLES || !shore.valid.every(v => v === 0 || v === 1))))) {
      throw new RangeError("Water shoreline must contain finite, evenly spaced coast samples");
    }
    const sea = options.surface === "sea";
    const edge = new Color(PALETTE.seaShallow);
    const deep = new Color(PALETTE.seaDeep);
    if (!sea) {
      // Clear green-turquoise banks, with denser pigment down the centre of the stream.
      edge.lerp(new Color(PALETTE.forestLight), 0.25);
      deep.copy(new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.seaShallow), 0.6));
    } else {
      edge.set("#759b96");
      deep.set("#104d70");
    }
    // Low streams keep the baked depth gradient and soft bank, without IBL.
    const defines: Record<string, number> = { SKY_REFLECTION: sea ? 0.5 : 0.72 };
    if (sea || quality !== "Low") defines.WATER_REFLECTION = 1;
    if (!sea) defines.RIVER_DEPTH = 1;
    if (options.wetBank) defines.STREAM_WET_BANK = 1;
    if (sea) defines.SEA_WATER = 1;
    if (sea && quality !== "Low") defines.SEA_NORMAL = 1;
    if (sea && options.seaDepth) defines.SEA_DEPTH = 1;
    if (quality !== "Low") defines.WATER_FLOW = 1;
    if (quality !== "Low") defines.C_WATER = 1;
    if (quality === "High" || (!sea && quality !== "Low")) defines.WATER_RIPPLES = 1;
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
          ...(quality !== "Low" ? { uSkyTop: { value: new Color() } } : {}),
          ...(!sea ? {
            uSpringOrigin: { value: riverPointAt(0) },
            uSpringForward: { value: riverTangentAt(0) },
            uStreamDepth: { value: null },
            uStreamSize: { value: new Vector2(1, 1) },
            uStreamLength: { value: riverLength() },
            uHasStreamDepth: { value: 0 },
          } : {}),
          uSkyMix: { value: 0 },
          ...(!sea ? { uCoastWeight: { value: 0 } } : {}),
          uTime: { value: 0 },
          uSunDirection: { value: new Vector3() },
          uSunWashColor: { value: new Color(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.72)
            .lerp(new Color(PALETTE.flower), 0.1) },
          uShoreBounds: { value: new Vector2(options.shoreline?.minX ?? 0, options.shoreline?.width ?? 1) },
          // Out-of-world sentinels disable both secants touching an unsafe sample.
          // Keep the existing uniform budget, with no texture or per-frame work.
          uShoreZ: { value: shore ? shore.z.map((z, i) => shore.valid?.[i] === 0 ? 100000 : z)
            : Array<number>(SEA_SHORE_SAMPLES).fill(0) },
          uHasShore: { value: options.shoreline ? 1 : 0 },
        },
      ]),
      vertexShader,
      fragmentShader: sea ? fragmentShader.replace(/uniform sampler2D u(?:FlowNormal|StreamDepth);/g, "") : fragmentShader,
      fog: true,
      transparent: true,
      depthWrite: sea,
      // The existing coast terrain is flat at sea level; avoid coplanar flicker.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    // Standalone materials and the sea quad have no baked river attributes.
    Object.assign(this.defaultAttributeValues, { waterBedDepth: [0.1, 0.6, 0.1], waterTangent: [0, 0, -1] });
    if (!sea && quality !== "Low") {
      this.flowNormal = createFlowNormal();
      this.uniforms.uFlowNormal = { value: this.flowNormal };
    }
    if (sea) {
      this.seaNormal = createSeaNormal(quality);
      if (this.seaNormal) this.uniforms.uSeaNormal = { value: this.seaNormal };
      if (options.seaDepth) {
        this.seaDepth = options.seaDepth.texture;
        this.uniforms.uSeaDepth = { value: this.seaDepth };
        this.uniforms.uSeaDepthBounds = { value: options.seaDepth.bounds };
        this.uniforms.uSeaDepthSize = { value: options.seaDepth.size };
      }
    }
    this.edgePigment = edge;
    this.deepPigment = deep;
    this.setGrade(options.grade ?? lightingAt(sea ? 1 : 0));
    this.setSkyMix(options.skyMix ?? (sea ? 1 : 0));
    if (options.sunDirection) this.setSunDirection(options.sunDirection);
  }

  /** Flat-surface half-Lambert + hemisphere, with the same Lambert BRDF as terrain.
   * Pigment, strokes and foam receive irradiance; Fresnel receives sky radiance.
   * Geometry and draw count stay unchanged.
   */
  setGrade(grade: LightingGrade): void {
    if (this.disposed) return;
    const sea = Boolean(this.defines.SEA_WATER);
    const coast = Math.max(0, Math.min(1, grade.coastWeight ?? 0));
    if (!sea) this.uniforms.uCoastWeight!.value = coast;
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
      // Open-water scattering receives the whole sky hemisphere. Multiplying
      // only by orange direct light crushed both turquoise and offshore blue.
      const energy = this.irradiance.r * 0.2126 + this.irradiance.g * 0.7152 + this.irradiance.b * 0.0722;
      this.uniforms.uDeepColor!.value.copy(this.deepPigment).multiplyScalar(energy * 3.2);
      this.uniforms.uEdgeColor!.value.copy(this.edgePigment).multiplyScalar(energy * 3.2);
      // Shallow scattering takes a little of the warm sky, rather than keeping
      // a saturated cyan pigment under an orange sunset. Sky radiance is intact.
      this.uniforms.uEdgeColor!.value.lerp(this.fill.copy(grade.skyHorizon).multiplyScalar(energy * 3.2), 0.16);
    }
    if (!sea && coast > 0) {
      // Open-sky indigo fill retains blue energy under the low orange sun.
      const energy = this.irradiance.r * 0.2126 + this.irradiance.g * 0.7152 + this.irradiance.b * 0.0722;
      this.fill.copy(this.indigo).multiplyScalar(energy * 1.6);
      this.uniforms.uDeepColor!.value.lerp(this.fill, coast);
      this.uniforms.uEdgeColor!.value.lerp(this.fill, coast * 0.55);
    }
    this.uniforms.uPaperColor!.value.copy(this.paper).multiply(this.irradiance).multiplyScalar(absorption);
    // Fresnel reflects incoming sky radiance, independent of irradiance on the water.
    // The grade's eastern dawn direction proxies forest canopy; it releases toward
    // noon and leaves the open western coast untouched, without needing path state.
    const skyVisibility = sea ? 1 : 1 - 0.35 * Math.max(0, -grade.sunDirection.x);
    this.uniforms.uSkyHorizon!.value.copy(grade.skyHorizon).multiplyScalar((sea ? 0.5 : 0.85) * skyVisibility);
    if (sea) {
      // Reflect the actual horizon radiance; Fresnel controls its weight in GLSL.
      this.uniforms.uSkyHorizon!.value.copy(grade.skyHorizon);
    }
    this.uniforms.uSkyTop?.value.copy(grade.skyTop).multiplyScalar(sea ? 1 : 0.85 * skyVisibility);
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
    this.flowNormal?.dispose();
    this.seaNormal?.dispose();
    this.seaDepth?.dispose();
    super.dispose();
  }
}

export function createWaterMaterial(quality: Quality, options: WaterMaterialOptions = {}): WaterMaterial {
  return new WaterMaterial(quality, options);
}
