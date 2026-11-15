import {
  AdditiveBlending, BufferGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, NormalBlending, Points, ShaderMaterial, Vector2, type Vector3,
} from "three";

/** HR-FIX-SETPIECE A06: camera-facing flame sheets with scrolling turbulence, thin smoke and
 * heat-borne sparks. Everything animates in the shaders from one `time` uniform; three draws
 * for all four fires. Hardware Balanced/High only; Low keeps the cheap faceted tongues.
 */
export interface FireSource { position: Vector3; width: number; height: number }

const NOISE = /* glsl */`
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;
const BILLBOARD = /* glsl */`
attribute vec3 origin;
attribute vec2 extent;
attribute float seed;
uniform float time;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = vec2(position.x * 2.0, position.y); vSeed = seed;
  vec4 world = modelMatrix * vec4(origin, 1.0);
  vec3 toEye = cameraPosition - world.xyz;
  vec3 right = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(1e-5, 0.0, 0.0));
  vec3 point = world.xyz + right * (position.x * extent.x) + vec3(0.0, position.y * extent.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(point, 1.0);
}`;
const FLAME = /* glsl */`
uniform float time;
varying vec2 vUv;
varying float vSeed;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y, t = time * (0.9 + fract(vSeed * 7.31) * 0.25) + vSeed * 13.0;
  float broad = fbm(vec2(x * 1.6 + vSeed * 5.0, y * 2.1 - t * 1.9));
  float fine = fbm(vec2(x * 4.3 - vSeed * 3.0, y * 4.8 - t * 3.4));
  // Buoyant flame: the tongue narrows, leans and breaks up as it rises.
  float lean = (broad - 0.5) * 0.9 * y + sin(t * 2.3 + y * 5.0) * 0.05 * y;
  float width = mix(0.66, 0.06, pow(y, 0.72)) * (0.78 + 0.5 * fine);
  float body = 1.0 - smoothstep(0.0, width, abs(x + lean));
  float reach = 1.0 - smoothstep(0.42 + 0.4 * broad, 0.98, y + (fine - 0.5) * 0.42);
  float heat = body * reach * smoothstep(0.0, 0.05, y);
  heat = clamp(heat * (0.72 + 0.7 * fine), 0.0, 1.0);
  vec3 ember = vec3(0.75, 0.09, 0.01), orange = vec3(1.0, 0.36, 0.04), yellow = vec3(1.0, 0.74, 0.22), core = vec3(1.0, 0.95, 0.82);
  vec3 color = mix(ember, orange, smoothstep(0.08, 0.32, heat));
  color = mix(color, yellow, smoothstep(0.3, 0.62, heat));
  color = mix(color, core, smoothstep(0.62, 0.95, heat));
  // The hottest gas at the fuel burns blue before the soot starts to glow.
  float blue = body * (1.0 - smoothstep(0.02, 0.2, y)) * smoothstep(0.25, 0.8, 1.0 - abs(x) * 1.6);
  color = mix(color, vec3(0.32, 0.5, 1.0), blue * 0.6);
  float alpha = smoothstep(0.04, 0.3, heat);
  // Three sheets add up under the bloom pass: keep each one well below white.
  gl_FragColor = vec4(color * alpha * (0.34 + heat * 0.62), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SMOKE = /* glsl */`
uniform float time;
varying vec2 vUv;
varying float vSeed;
${NOISE}
void main() {
  float x = vUv.x, y = vUv.y, t = time * 0.5 + vSeed * 9.0;
  float puff = fbm(vec2(x * 1.7 + vSeed * 3.0 + sin(t * 0.7) * 0.2, y * 1.9 - t));
  float drift = (fbm(vec2(vSeed * 4.0, y * 1.3 - t * 0.6)) - 0.5) * 0.9 * y;
  float column = 1.0 - smoothstep(0.0, mix(0.22, 0.85, y), abs(x + drift));
  float alpha = column * smoothstep(0.3, 0.75, puff) * smoothstep(0.0, 0.2, y) * (1.0 - smoothstep(0.45, 1.0, y)) * 0.2;
  gl_FragColor = vec4(mix(vec3(0.2, 0.17, 0.15), vec3(0.42, 0.4, 0.4), y), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SPARK_VERTEX = /* glsl */`
attribute vec3 origin;
attribute vec4 seed;
uniform float time;
uniform float pixels;
varying float vLife;
void main() {
  float life = fract(time * (0.22 + seed.x * 0.25) + seed.y);
  float reach = seed.w * (0.55 + seed.z * 0.75);
  // Sparks ride the plume, spiralling out as it cools, then fall back slightly.
  float swirl = seed.z * 6.283 + life * (3.0 + seed.x * 5.0);
  vec3 point = origin + vec3(cos(swirl), 0.0, sin(swirl)) * (0.03 + life * life * 0.34 * seed.w)
    + vec3(sin(time * 0.6 + seed.y * 6.0) * 0.12 * life, life * reach * (2.2 - life * 0.7), 0.0);
  vec4 view = modelViewMatrix * vec4(point, 1.0);
  vLife = life;
  gl_Position = projectionMatrix * view;
  gl_PointSize = pixels * (0.011 + seed.x * 0.012) * (1.0 - life * 0.6) / max(0.1, -view.z);
}`;
const SPARK_FRAGMENT = /* glsl */`
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float glow = (1.0 - smoothstep(0.08, 0.5, d)) * (1.0 - smoothstep(0.55, 1.0, vLife)) * smoothstep(0.0, 0.04, vLife);
  vec3 color = mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.25, 0.03), smoothstep(0.1, 0.8, vLife));
  gl_FragColor = vec4(color * glow * 1.9, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createHrFire(sources: readonly FireSource[], seedPhase = 0) {
  const group = new Group(); group.name = "workshop-fire-hr";
  const quad = new BufferGeometry();
  quad.setAttribute("position", new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const time = { value: 0 }, pixels = { value: 900 };
  function sheets(layers: readonly (readonly [number, number, number])[], lift: number) {
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position"));
    const origin: number[] = [], extent: number[] = [], seed: number[] = [];
    sources.forEach((source, s) => layers.forEach(([w, h, offset], layer) => {
      origin.push(source.position.x, source.position.y + source.height * (lift + offset), source.position.z);
      extent.push(source.width * w, source.height * h);
      seed.push(((s * 0.37 + layer * 0.21 + seedPhase * 0.1) % 1 + 1) % 1);
    }));
    geometry.setAttribute("origin", new InstancedBufferAttribute(new Float32Array(origin), 3));
    geometry.setAttribute("extent", new InstancedBufferAttribute(new Float32Array(extent), 2));
    geometry.setAttribute("seed", new InstancedBufferAttribute(new Float32Array(seed), 1));
    geometry.instanceCount = seed.length;
    return geometry;
  }
  const flameGeometry = sheets([[1.0, 1, 0], [0.74, 0.78, 0.02], [0.52, 1.1, 0.04]], 0);
  const smokeGeometry = sheets([[1.9, 2.2, 0], [1.5, 1.8, 0.35]], 0.7);
  const flameMaterial = new ShaderMaterial({ uniforms: { time }, vertexShader: BILLBOARD, fragmentShader: FLAME,
    transparent: true, depthWrite: false, blending: AdditiveBlending });
  const smokeMaterial = new ShaderMaterial({ uniforms: { time }, vertexShader: BILLBOARD, fragmentShader: SMOKE,
    transparent: true, depthWrite: false, blending: NormalBlending });
  const sparkGeometry = new BufferGeometry();
  const perFire = 26, origins: number[] = [], seeds: number[] = [];
  let state = (Math.floor(seedPhase * 1e6) ^ 0x9e3779b9) >>> 0;
  const random = () => ((state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) >>> 0) / 4294967296;
  for (const source of sources) for (let i = 0; i < perFire; i++) {
    origins.push(source.position.x + (random() - 0.5) * source.width * 0.5, source.position.y + source.height * 0.2,
      source.position.z + (random() - 0.5) * source.width * 0.5);
    seeds.push(random(), random(), random(), source.height);
  }
  sparkGeometry.setAttribute("position", new Float32BufferAttribute(origins, 3));
  sparkGeometry.setAttribute("origin", new Float32BufferAttribute(origins, 3));
  sparkGeometry.setAttribute("seed", new Float32BufferAttribute(seeds, 4));
  const sparkMaterial = new ShaderMaterial({ uniforms: { time, pixels }, vertexShader: SPARK_VERTEX, fragmentShader: SPARK_FRAGMENT,
    transparent: true, depthWrite: false, blending: AdditiveBlending });
  const smoke = new Mesh(smokeGeometry, smokeMaterial), flames = new Mesh(flameGeometry, flameMaterial);
  const sparks = new Points(sparkGeometry, sparkMaterial);
  smoke.name = "workshop-fire-smoke"; flames.name = "workshop-fire-flames"; sparks.name = "workshop-fire-sparks";
  smoke.renderOrder = 1; flames.renderOrder = 2; sparks.renderOrder = 3;
  for (const object of [smoke, flames, sparks]) { object.frustumCulled = false; object.raycast = () => {}; group.add(object); }
  const buffer = new Vector2();
  flames.onBeforeRender = renderer => { pixels.value = renderer.getDrawingBufferSize?.(buffer).y ?? 900; };
  let disposed = false;
  return {
    group,
    /** Seconds of burn; the caller freezes it for reduced motion. */
    setTime(seconds: number) { time.value = seconds; },
    dispose() {
      if (disposed) return; disposed = true;
      group.removeFromParent();
      for (const item of [quad, flameGeometry, smokeGeometry, sparkGeometry, flameMaterial, smokeMaterial, sparkMaterial]) item.dispose();
    },
  };
}
