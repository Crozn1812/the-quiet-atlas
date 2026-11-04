import { Color, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { PALETTE } from "../art/palette";
import type { Quality } from "../terrain";

export const WATER_FLOW_SPEED = 0.05;

export interface WaterMaterialOptions {
  surface?: "river" | "sea";
  /** Paper sky at 0, dusk sky at 1; colours use Three's linear working space. */
  skyMix?: number;
}

const vertexShader = /* glsl */ `
  varying vec2 vWaterUv;
  #ifdef WATER_REFLECTION
    varying vec3 vViewDirection;
    varying vec3 vSurfaceNormal;
  #endif
  #include <fog_pars_vertex>
  void main() {
    vWaterUv = uv;
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
    // Thin, gently wandering brush lanes with soft breaks along the current.
    float lane = vWaterUv.x * 50.0 + 0.45 * sin(flow * 0.7);
    float stroke = pow(0.5 + 0.5 * cos(lane), 12.0);
    stroke *= smoothstep(0.1, 0.8, 0.5 + 0.5 * sin(flow * 0.65 + vWaterUv.x * 37.0));
    color = mix(color, uPaperColor, stroke * 0.065);
    #ifdef WATER_REFLECTION
      vec3 surfaceNormal = normalize(vSurfaceNormal);
      #ifdef WATER_RIPPLES
        vec3 ripple = vec3(sin(flow * 0.9 + vWaterUv.x * 9.0),
                           0.0, cos(flow * 0.6 - vWaterUv.x * 13.0)) * 0.025;
        surfaceNormal = normalize(surfaceNormal + mat3(viewMatrix) * ripple);
      #endif
      float grazing = 1.0 - clamp(dot(surfaceNormal, normalize(vViewDirection)), 0.0, 1.0);
      float fresnel = grazing * grazing * grazing;
      vec3 sky = mix(uPaperColor, uDuskColor, uSkyMix);
      color = mix(color, sky, fresnel * SKY_REFLECTION);
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** No textures, render targets or lights; Low compiles out flow and reflection. */
export class WaterMaterial extends ShaderMaterial {
  private reducedMotion = false;
  private lastSeconds: number | undefined = 0;
  private disposed = false;

  constructor(readonly quality: Quality, options: WaterMaterialOptions = {}) {
    const sea = options.surface === "sea";
    const edge = new Color(PALETTE.water);
    const deep = new Color(PALETTE.indigo);
    if (sea) {
      // B2-031: the open sea is jade-teal water, not indigo; indigo under a warm horizon wash reads grey.
      deep.set(PALETTE.water).lerp(new Color(PALETTE.mist), 0.18);
      edge.set(PALETTE.water).lerp(new Color(PALETTE.dusk), 0.14);
    }
    // The broad sea mirrors more of the painted sky than the shaded river.
    const defines: Record<string, number> = { SKY_REFLECTION: sea ? 0.5 : 0.22 };
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
  }

  /** Supply elapsed seconds, not frame deltas. Frozen intervals never catch up. */
  setTime(seconds: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Water time must be finite and nonnegative");
    const delta = this.lastSeconds === undefined ? 0 : Math.max(0, seconds - this.lastSeconds);
    this.lastSeconds = seconds;
    if (!this.reducedMotion && this.quality !== "Low") this.uniforms.uTime!.value += delta;
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

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    super.dispose();
  }
}

export function createWaterMaterial(quality: Quality, options: WaterMaterialOptions = {}): WaterMaterial {
  return new WaterMaterial(quality, options);
}
