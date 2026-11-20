import { Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";
import type { Quality } from "../terrain";

export const SHIPWRECK_PARTICLES = { High: 64, Low: 24 } as const;
/** Keep this distant landmark inside Low's 260 m clip plane without changing the camera. */
export const SHIPWRECK_CLIP = "gl_Position.z = min(gl_Position.z, gl_Position.w * 0.9998);";

export function smokeSample(phase: number, elapsed: number) {
  const age = ((phase + elapsed / 24) % 1 + 1) % 1;
  return { age, x: -24 * age * age, y: age * 44, z: age * 6, size: 6.8 + age * 20.4,
    opacity: (1 - Math.exp(-age * 40)) * Math.pow(1 - age, 1.5) * 0.17 };
}

export function createShipwreckSmoke(origin: Vector3) {
  const plane = new PlaneGeometry(1, 1), geometry = new InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes = plane.attributes;
  // Prefixes remain evenly distributed when switching quality.
  const phases = Array.from({ length: 64 }, (_, i) => ((i * 0.61803398875) % 1));
  geometry.setAttribute("phase", new InstancedBufferAttribute(new Float32Array(phases), 1));
  geometry.instanceCount = 64;
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), elapsed: { value: 0 }, origin: { value: origin },
      density: { value: 1 }, soot: { value: new Color("#423c35") },
      ash: { value: new Color("#969087") }, sunset: { value: new Color("#b68b66") } },
    vertexShader: /* glsl */ `
      attribute float phase;
      uniform float elapsed;
      uniform vec3 origin;
      varying vec2 smokeUv;
      varying float age;
      #include <fog_pars_vertex>
      void main() {
        age = fract(phase + elapsed / 24.0);
        vec3 center = origin + vec3(-24.0 * age * age, 44.0 * age, 6.0 * age);
        // A shared centreline keeps the source attached while the wind bends it.
        center.xz += vec2(sin(age * 8.0 + elapsed * .15), cos(age * 6.0 + elapsed * .12)) * age * 1.5;
        vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
        // Funnel diameter is 3.4 m: overlapping footprints grow from 2x to 8x.
        mvPosition.xy += position.xy * (6.8 + 20.4 * age);
        smokeUv = uv;
        gl_Position = projectionMatrix * mvPosition;
        ${SHIPWRECK_CLIP}
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 soot;
      uniform vec3 ash;
      uniform vec3 sunset;
      uniform float density;
      varying vec2 smokeUv;
      varying float age;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1)), f.x), f.y);
      }
      void main() {
        vec2 p = smokeUv * 2.0 - 1.0;
        float n = noise(smokeUv * 3.0 + age * 3.0);
        float radius = length(p);
        float edge = exp(-3.5 * dot(p, p)) * (1.0 - smoothstep(.65, 1.0, radius));
        float alpha = edge * (.8 + .2 * n) * (1.0 - exp(-age * 40.0)) * pow(1.0 - age, 1.5) * .17 * density;
        // Real alpha coverage, including at distance; never write quad depth.
        // Sun is +X/-Z at dusk: warm the right rim of each camera-facing puff.
        vec3 smoke = mix(soot, ash, smoothstep(.0, .9, age));
        gl_FragColor = vec4(mix(smoke, sunset, smoothstep(.15, 1.0, smokeUv.x) * .24), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          float haze = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(haze, .28));
        #endif
      }`,
  });
  const mesh = new Mesh(geometry, material); mesh.name = "shipwreck-smoke"; mesh.frustumCulled = false;
  mesh.renderOrder = 6; // After sea, surf and foam, with normal scene depth testing.
  let elapsed = 6;
  return { mesh, update(dt: number, reducedMotion: boolean, quality: Quality) {
    if (!reducedMotion) elapsed += Math.max(0, Math.min(dt, .1));
    material.uniforms.elapsed!.value = elapsed;
    geometry.instanceCount = SHIPWRECK_PARTICLES[quality];
    // Keep the optical density of the overlapping column when reducing instances.
    material.uniforms.density!.value = SHIPWRECK_PARTICLES.High / geometry.instanceCount;
  }, dispose() { geometry.dispose(); material.dispose(); } };
}
