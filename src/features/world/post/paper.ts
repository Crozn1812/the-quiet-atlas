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
export const CORRIDOR_POINTS = 48;

type MistOptions = {
  bands?: [number, number, number];
  height?: number;
  strength?: number;
  /** Linear working-space colour of the near mist shelves (default palette mist). */
  color?: Color;
};

type EdgeOptions = {
  bleed?: number;
  ink?: boolean;
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
  uniform vec3 inkColor;
  uniform vec2 texelSize;
  uniform float bleedStrength;
  uniform bool inkEnabled;
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
  // Corridor mask (opening cinematic only): geometry farther than corridorRadius from the path polyline
  // dissolves into paper with a fibrous edge, so streamed tile borders never read as rectangles.
  uniform vec2 corridorPoints[CORRIDOR_POINTS];
  uniform int corridorCount;
  uniform float corridorRadius;
  float corridorDistance(vec2 p) {
    float best = 1e9;
    for (int i = 1; i < CORRIDOR_POINTS; i++) {
      if (i >= corridorCount) break;
      vec2 a = corridorPoints[i - 1];
      vec2 ab = corridorPoints[i] - a;
      float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      best = min(best, length(p - a - ab * h));
    }
    return best;
  }
  uniform vec3 fogColor;
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

  float linearViewDepth(float depth) {
    return perspective
      ? -perspectiveDepthToViewZ(depth, cameraNear, cameraFar)
      : -orthographicDepthToViewZ(depth, cameraNear, cameraFar);
  }

  vec3 paintEdges(vec3 color, float depth, float viewDepth, float distanceToCamera, float fiber) {
    if (bleedStrength <= 0.0 && !inkEnabled) return color;
    // Exactly four extra depth reads, one physical pixel away in a cross.
    vec4 adjacent = vec4(
      linearViewDepth(texture2D(tDepth, vUv + vec2(texelSize.x, 0.0)).x),
      linearViewDepth(texture2D(tDepth, vUv - vec2(texelSize.x, 0.0)).x),
      linearViewDepth(texture2D(tDepth, vUv + vec2(0.0, texelSize.y)).x),
      linearViewDepth(texture2D(tDepth, vUv - vec2(0.0, texelSize.y)).x)
    );
    vec4 delta = (adjacent - vec4(viewDepth)) / max(viewDepth, 1.0);
    vec4 contrast = abs(delta);
    float strongest = contrast.x;
    float signedEdge = delta.x;
    vec2 offset = vec2(texelSize.x, 0.0);
    if (contrast.y > strongest) {
      strongest = contrast.y;
      signedEdge = delta.y;
      offset = vec2(-texelSize.x, 0.0);
    }
    if (contrast.z > strongest) {
      strongest = contrast.z;
      signedEdge = delta.z;
      offset = vec2(0.0, texelSize.y);
    }
    if (contrast.w > strongest) {
      strongest = contrast.w;
      signedEdge = delta.w;
      offset = vec2(0.0, -texelSize.y);
    }
    // Relative linear-viewZ threshold; static fibers break up the otherwise straight rim.
    float threshold = mix(0.012, 0.028, fiber);
    float edge = smoothstep(threshold, threshold * 2.0, strongest);
    if (edge > 0.0 && bleedStrength > 0.0) {
      // Only one extra color read: the other side of the strongest depth discontinuity.
      vec3 other = texture2D(tColor, vUv + offset).rgb;
      vec3 luma = vec3(0.2126, 0.7152, 0.0722);
      vec3 darker = dot(other, luma) < dot(color, luma) ? other : color;
      float pooling = edge * bleedStrength * mix(0.65, 1.0, fiber);
      color = mix(color, darker * 0.97, pooling * 0.12);
      // The rear side carries a fine paper-light band beside the pooled pigment.
      float paperRim = signedEdge < 0.0 ? 0.07 : 0.02;
      color = mix(color, paperColor, pooling * paperRim);
    }
    #ifdef INK_OUTLINE
      if (inkEnabled && depth < 1.0) {
        // Foreground side only: a one-texel footprint, never a two-sided outline or sky ink.
        float foregroundEdge = max(max(delta.x, delta.y), max(delta.z, delta.w));
        float inkEdge = smoothstep(threshold, threshold * 2.0, foregroundEdge);
        float inkFade = 1.0 - smoothstep(25.0, 40.0, distanceToCamera);
        float inkAlpha = inkEdge * inkFade * 0.35;
        color = mix(color, inkColor, inkAlpha);
      }
    #endif
    return color;
  }

  void main() {
    vec4 color = texture2D(tColor, vUv);
    float depth = texture2D(tDepth, vUv).x;
    vec4 viewPosition = cameraProjectionMatrixInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    viewPosition /= viewPosition.w;
    vec3 worldPosition = (cameraMatrixWorld * viewPosition).xyz;
    float distanceToCamera = length(viewPosition.xyz);
    float viewDepth = linearViewDepth(depth);
    vec2 pixel = floor(gl_FragCoord.xy);
    float fiber = fibers(pixel / vec2(48.0, 12.0));
    // Tone-map only the lit scene; paper, mist, fog and the painted sky are display colours and stay exact.
    float geometry = 1.0 - step(0.99999, depth);
    #ifdef TONE_MAPPING
      color.rgb = mix(color.rgb, toneMapping(color.rgb), geometry);
    #endif
    color.rgb = paintEdges(color.rgb, depth, viewDepth, distanceToCamera, fiber);
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
    // Sky pixels (cleared depth) keep the sky dome's own dawn/dusk wash; fog/mist apply to geometry only.
    float nearVisibility = smoothstep(${MIST_CLEAR_DISTANCE}.0, ${MIST_FADE_DISTANCE}.0, distanceToCamera) * geometry;
    vec3 mistTint = mix(mistColor, fogColor, bands.z * 0.75);
    color.rgb = mix(color.rgb, mistTint, layeredMist * mistStrength * nearVisibility);
    // Depth fog dissolves into the horizon wash (paper by default), with the same near guard.
    color.rgb = mix(color.rgb, fogColor, smoothstep(fogNear, fogFar, viewDepth) * nearVisibility);

    // After mist/fog: masked ground must end as plain paper, not mist-tinted paper.
    if (corridorCount > 1) {
      // Fibrous edge +/-4 m; fully paper by 0.8 R + 4 m, inside the streamed 32 m guarantee.
      float edge = corridorDistance(worldPosition.xz) + (fibers(worldPosition.xz * 0.05) - 0.5) * 8.0;
      // Sky pixels go to the same paper too, so the dome never outlines streamed tiles.
      float washed = mix(1.0, smoothstep(corridorRadius * 0.35, corridorRadius * 0.8, edge), geometry);
      color.rgb = mix(color.rgb, paperColor, washed);
    }
    // Pixel-locked, time-independent grain. Both noises are in [0, 1],
    // so their weighted sum gives at most +/-2% multiplicative variation.
    float grain = (hash(pixel) - 0.5) * 0.028
                + (fiber - 0.5) * 0.012;
    color.rgb *= 1.0 + grain;
    vec2 edge = vUv * 2.0 - 1.0;
    float vignette = smoothstep(0.3, 1.5, dot(edge, edge)) * 0.025;
    color.rgb = mix(color.rgb, paperColor, vignette);
    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`;

/** One merged paper pass on Balanced/High; Low leaves rendering and scene.fog to the caller. */
export function createPaperPass(renderer: WebGLRenderer, opts: { quality: Quality }) {
  let quality = opts.quality;
  const size = renderer.getSize(new Vector2());
  let disposed = false;
  let resources: ReturnType<typeof allocate> | undefined;
  const edges: { bleed: number; ink?: boolean } = { bleed: 0.5 };
  const fog = { near: 15, far: 65, color: new Color(PALETTE.paper) };
  const corridor = { points: Array.from({ length: CORRIDOR_POINTS }, () => new Vector2()), count: 0, radius: 1 };
  const mist = {
    bands: new Vector3(...DEFAULT_MIST_BANDS),
    height: DEFAULT_MIST_HEIGHT,
    strength: DEFAULT_MIST_STRENGTH,
    color: new Color(PALETTE.mist),
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
      defines: { CORRIDOR_POINTS, ...(quality === "High" ? { MIST_EDGE_NOISE: 1, INK_OUTLINE: 1 } : {}) },
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: depth },
        paperColor: { value: new Color(PALETTE.paper) },
        inkColor: { value: new Color(PALETTE.ink) },
        texelSize: { value: new Vector2(1 / width, 1 / height) },
        bleedStrength: { value: edges.bleed },
        inkEnabled: { value: quality === "High" && (edges.ink ?? true) },
        mistColor: { value: mist.color },
        mistBands: { value: mist.bands },
        mistHeight: { value: mist.height },
        mistStrength: { value: mist.strength },
        cameraProjectionMatrixInverse: { value: new Matrix4() },
        cameraMatrixWorld: { value: new Matrix4() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
        perspective: { value: true },
        fogNear: { value: fog.near },
        fogFar: { value: fog.far },
        fogColor: { value: fog.color },
        corridorPoints: { value: corridor.points },
        corridorCount: { value: corridor.count },
        corridorRadius: { value: corridor.radius },
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
      if (resources) {
        const [width, height] = physicalSize();
        resources.target.setSize(width, height);
        resources.material.uniforms.texelSize!.value.set(1 / width, 1 / height);
      }
    },
    setQuality(q: Quality): void {
      if (disposed || quality === q) return;
      quality = q;
      if (q === "Low") release();
      else if (!resources) resources = allocate();
      else {
        if (q === "High") {
          resources.material.defines.MIST_EDGE_NOISE = 1;
          resources.material.defines.INK_OUTLINE = 1;
        } else {
          delete resources.material.defines.MIST_EDGE_NOISE;
          delete resources.material.defines.INK_OUTLINE;
        }
        resources.material.uniforms.inkEnabled!.value = q === "High" && (edges.ink ?? true);
        resources.material.needsUpdate = true;
      }
    },
    /** Linear depth fog in metres toward `color` (default paper, e.g. the sky horizon); survives quality changes. */
    setFog({ near, far, color }: { near: number; far: number; color?: Color }): void {
      if (disposed) return;
      if (!Number.isFinite(near) || !Number.isFinite(far) || near < 0 || far <= near) {
        throw new RangeError("Fog needs 0 <= near < far");
      }
      fog.near = near;
      fog.far = far;
      if (color) fog.color.copy(color);
      if (resources) {
        resources.material.uniforms.fogNear!.value = near;
        resources.material.uniforms.fogFar!.value = far;
      }
    },
    /** Bleed in [0, 1]; ink defaults on in High only. Explicit settings survive quality changes. */
    setEdges({ bleed, ink }: EdgeOptions): void {
      if (disposed) return;
      if (bleed !== undefined && (!Number.isFinite(bleed) || bleed < 0 || bleed > 1)) {
        throw new RangeError("Edge bleed must be between 0 and 1");
      }
      if (bleed !== undefined) edges.bleed = bleed;
      if (ink !== undefined) edges.ink = ink;
      if (resources) {
        resources.material.uniforms.bleedStrength!.value = edges.bleed;
        resources.material.uniforms.inkEnabled!.value = quality === "High" && (edges.ink ?? true);
      }
    },
    /** Opening-cinematic mask: XZ path polyline (<= CORRIDOR_POINTS) and radius in metres; null turns it off. */
    setCorridor(points: readonly { x: number; z: number }[] | null, radius = 32): void {
      if (disposed) return;
      if (points && (points.length > CORRIDOR_POINTS || !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))
        || !Number.isFinite(radius) || radius <= 0)) {
        throw new RangeError(`Corridor needs <= ${CORRIDOR_POINTS} finite points and a positive radius`);
      }
      corridor.count = points ? points.length : 0;
      corridor.radius = radius;
      points?.forEach((point, i) => corridor.points[i]!.set(point.x, point.z));
      if (resources) {
        resources.material.uniforms.corridorCount!.value = corridor.count;
        resources.material.uniforms.corridorRadius!.value = corridor.radius;
      }
    },
    /** Distances/heights are metres; strength in [0, 1] scales added mist, preserving depth fog. */
    setMist({ bands, height, strength, color }: MistOptions): void {
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
      if (color) mist.color.copy(color);
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
