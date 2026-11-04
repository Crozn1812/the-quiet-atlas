import {
  BufferGeometry, Color, DepthTexture, Float32BufferAttribute, HalfFloatType,
  Matrix4, Mesh, NoBlending, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera, type WebGLRenderer,
} from "three";
import { PALETTE } from "../art/palette";

type Quality = "Low" | "Balanced" | "High";

export const DEFAULT_MIST_BANDS = Object.freeze([20, 35, 55] as const);
// World Y; assumes water at Y = 0. Call setMist({ height: waterY + 1.2 }) otherwise.
export const DEFAULT_MIST_HEIGHT = 1.2;
export const DEFAULT_MIST_STRENGTH = 0.65;
const MIST_CLEAR_DISTANCE = 8;
const MIST_FADE_DISTANCE = 12;
const MIST_BAND_HALF_WIDTH = 1.2;
const MIST_HEIGHT_FALLOFF = 2.4;

type MistOptions = {
  bands?: [number, number, number];
  height?: number;
  strength?: number;
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec3 paperColor;
  uniform vec3 mistColor;
  uniform vec3 mistBands;
  uniform float mistHeight;
  uniform float mistStrength;
  uniform mat4 cameraProjectionMatrixInverse;
  uniform mat4 cameraMatrixWorld;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform bool perspective;
  uniform float fogNear;
  uniform float fogFar;
  varying vec2 vUv;
  #include <packing>

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float fibers(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
               mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
  }

  void main() {
    vec4 color = texture2D(tColor, vUv);
    float depth = texture2D(tDepth, vUv).x;
    vec4 viewPosition = cameraProjectionMatrixInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    viewPosition /= viewPosition.w;
    vec3 worldPosition = (cameraMatrixWorld * viewPosition).xyz;
    float distanceToCamera = length(viewPosition.xyz);
    float viewDepth = perspective
      ? -perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : -orthographicDepthToViewZ(depth, cameraNear, cameraFar);
    float edgeOffset = 0.0;
    #ifdef MIST_EDGE_NOISE
      // World-locked horizontal variation, at most +/-0.25 m; never animated.
      edgeOffset = (fibers(worldPosition.xz * 0.12) - 0.5) * 0.5;
    #endif
    vec3 bands = smoothstep(mistBands - vec3(${MIST_BAND_HALF_WIDTH}),
                            mistBands + vec3(${MIST_BAND_HALF_WIDTH}),
                            vec3(distanceToCamera + edgeOffset));
    float lowMist = 1.0 - smoothstep(mistHeight, mistHeight + ${MIST_HEIGHT_FALLOFF}, worldPosition.y);
    // Each narrow transition adds a shelf; density increases at every band.
    float layeredMist = 1.0 - (1.0 - bands.x * 0.18) * (1.0 - bands.y * 0.26)
                            * (1.0 - bands.z * 0.42) * (1.0 - lowMist * 0.18);
    float nearVisibility = smoothstep(${MIST_CLEAR_DISTANCE}.0, ${MIST_FADE_DISTANCE}.0, distanceToCamera);
    vec3 mistTint = mix(mistColor, paperColor, bands.z * 0.75);
    color.rgb = mix(color.rgb, mistTint, layeredMist * mistStrength * nearVisibility);
    // Preserve the original depth fog and its final fade to paper, with the same near guard.
    color.rgb = mix(color.rgb, paperColor, smoothstep(fogNear, fogFar, viewDepth) * nearVisibility);

    // Pixel-locked, time-independent grain. Both noises are in [0, 1],
    // so their weighted sum gives at most +/-2% multiplicative variation.
    vec2 pixel = floor(gl_FragCoord.xy);
    float grain = (hash(pixel) - 0.5) * 0.028
                + (fibers(pixel / vec2(48.0, 12.0)) - 0.5) * 0.012;
    color.rgb *= 1.0 + grain;
    vec2 edge = vUv * 2.0 - 1.0;
    float vignette = smoothstep(0.3, 1.5, dot(edge, edge)) * 0.025;
    color.rgb = mix(color.rgb, paperColor, vignette);
    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** One merged paper pass on Balanced/High; Low leaves rendering and scene.fog to the caller. */
export function createPaperPass(renderer: WebGLRenderer, opts: { quality: Quality }) {
  let quality = opts.quality;
  const size = renderer.getSize(new Vector2());
  let disposed = false;
  let resources: ReturnType<typeof allocate> | undefined;
  const mist = {
    bands: new Vector3(...DEFAULT_MIST_BANDS),
    height: DEFAULT_MIST_HEIGHT,
    strength: DEFAULT_MIST_STRENGTH,
  };

  function physicalSize() {
    const dpr = renderer.getPixelRatio();
    return [Math.max(1, Math.floor(size.x * dpr)), Math.max(1, Math.floor(size.y * dpr))] as const;
  }

  function allocate() {
    const [width, height] = physicalSize();
    // Preserve scene highlights until the final pass performs tone mapping.
    const target = new WebGLRenderTarget(width, height, { type: HalfFloatType });
    const depth = new DepthTexture(width, height);
    target.depthTexture = depth;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: quality === "High" ? { MIST_EDGE_NOISE: 1 } : {},
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: depth },
        paperColor: { value: new Color(PALETTE.paper) },
        mistColor: { value: new Color(PALETTE.mist) },
        mistBands: { value: mist.bands },
        mistHeight: { value: mist.height },
        mistStrength: { value: mist.strength },
        cameraProjectionMatrixInverse: { value: new Matrix4() },
        cameraMatrixWorld: { value: new Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        perspective: { value: true },
        fogNear: { value: 15 },
        fogFar: { value: 65 },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: true,
    });
    const screen = new Scene();
    const triangle = new Mesh(geometry, material);
    triangle.frustumCulled = false;
    screen.add(triangle);
    return { target, depth, geometry, material, screen, camera: new OrthographicCamera() };
  }

  function release() {
    if (!resources) return;
    resources.target.dispose();
    resources.depth.dispose();
    resources.material.dispose();
    resources.geometry.dispose();
    resources = undefined;
  }

  if (quality !== "Low") resources = allocate();

  return {
    render(scene: Scene, camera: PerspectiveCamera | OrthographicCamera): void {
      if (disposed) return;
      if (!resources) {
        renderer.render(scene, camera);
        return;
      }
      const { target, material, screen, camera: screenCamera } = resources;
      material.uniforms.cameraNear!.value = camera.near;
      material.uniforms.cameraFar!.value = camera.far;
      material.uniforms.perspective!.value = "isPerspectiveCamera" in camera;
      const destination = renderer.getRenderTarget();
      const fog = scene.fog;
      try {
        scene.fog = null; // The depth pass supplies fog once, rather than layering scene fog.
        renderer.setRenderTarget(target);
        if (!renderer.autoClear) renderer.clear();
        renderer.render(scene, camera);
        // Scene rendering updates camera.matrixWorld before reconstruction consumes it.
        material.uniforms.cameraProjectionMatrixInverse!.value.copy(camera.projectionMatrixInverse);
        material.uniforms.cameraMatrixWorld!.value.copy(camera.matrixWorld);
        scene.fog = fog;
        renderer.setRenderTarget(destination);
        renderer.render(screen, screenCamera);
      } finally {
        scene.fog = fog;
        renderer.setRenderTarget(destination);
      }
    },
    setSize(w: number, h: number): void {
      if (disposed) return;
      size.set(w, h);
      if (resources) resources.target.setSize(...physicalSize());
    },
    setQuality(q: Quality): void {
      if (disposed || quality === q) return;
      quality = q;
      if (q === "Low") release();
      else if (!resources) resources = allocate();
      else {
        if (q === "High") resources.material.defines.MIST_EDGE_NOISE = 1;
        else delete resources.material.defines.MIST_EDGE_NOISE;
        resources.material.needsUpdate = true;
      }
    },
    /** Distances/heights are metres; strength in [0, 1] scales added mist, preserving depth fog. */
    setMist({ bands, height, strength }: MistOptions): void {
      if (disposed) return;
      if (bands && (!bands.every(value => Number.isFinite(value) && value > 0)
        || bands[0] >= bands[1] || bands[1] >= bands[2])) {
        throw new RangeError("Mist bands must be finite, positive and strictly increasing");
      }
      if (height !== undefined && !Number.isFinite(height)) {
        throw new RangeError("Mist height must be finite");
      }
      if (strength !== undefined && (!Number.isFinite(strength) || strength < 0 || strength > 1)) {
        throw new RangeError("Mist strength must be between 0 and 1");
      }
      if (bands) mist.bands.set(...bands);
      if (height !== undefined) mist.height = height;
      if (strength !== undefined) mist.strength = strength;
      if (resources) {
        resources.material.uniforms.mistHeight!.value = mist.height;
        resources.material.uniforms.mistStrength!.value = mist.strength;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
