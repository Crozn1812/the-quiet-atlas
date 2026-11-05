import { BackSide, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { coastAtmosphereWeight, lightingAt, type LightingGrade } from "./grade";

/** One sloping, texture-free mist shelf inland (+Z); never covers the seaward half-space. */
export function createCoastMountainMist() {
  const mistColor = new Color(PALETTE.paper).lerp(new Color(PALETTE.mist), 0.24);
  const geometry = new BufferGeometry();
  // A single plane rises over the distant canopy; nearby trees remain in front of it.
  geometry.setAttribute("position", new Float32BufferAttribute([
    -320, 0, 16, 320, 0, 16, -320, 60, 316, 320, 60, 316,
  ], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  const material = new ShaderMaterial({
    uniforms: {
      mistColor: { value: mistColor.clone() },
      strength: { value: 0 },
    },
    vertexShader: `
      varying vec2 mistUv;
      varying vec3 shelfPosition;
      varying vec3 viewPosition;
      void main() {
        mistUv = uv;
        shelfPosition = position;
        vec4 viewed = modelViewMatrix * vec4(position, 1.0);
        viewPosition = viewed.xyz;
        gl_Position = projectionMatrix * viewed;
      }
    `,
    fragmentShader: `
      uniform vec3 mistColor;
      uniform float strength;
      varying vec2 mistUv;
      varying vec3 shelfPosition;
      varying vec3 viewPosition;
      void main() {
        float heightFade = smoothstep(0.0, 24.0, shelfPosition.y);
        float distanceFade = smoothstep(24.0, 210.0, length(viewPosition));
        float edge = smoothstep(0.0, 0.12, mistUv.x) * (1.0 - smoothstep(0.88, 1.0, mistUv.x));
        edge *= 1.0 - smoothstep(0.75, 1.0, mistUv.y);
        gl_FragColor = vec4(mistColor, strength * heightFade * distanceFade * edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "coast-mountain-mist";
  mesh.visible = false;
  mesh.raycast = () => {};
  let disposed = false;
  return {
    mesh,
    /** Anchor at the walking position; +Z is inland, -Z stays clear for the sea. */
    update(pathT: number, anchor: Readonly<Vector3>, grade: LightingGrade): void {
      if (disposed) return;
      const weight = coastAtmosphereWeight(pathT);
      mesh.position.copy(anchor);
      mesh.visible = weight > 0;
      material.uniforms.strength!.value = 0.42 * weight;
      material.uniforms.mistColor!.value.copy(mistColor).lerp(grade.fogColor, 0.2);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** One camera-centered sphere, no textures; radius must fit inside the camera's far plane. */
export function createSkyDome(initial: LightingGrade = lightingAt(0), radius = 80) {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("Sky radius must be finite and positive");
  const material = new ShaderMaterial({
    uniforms: {
      skyTop: { value: initial.skyTop.clone() },
      skyHorizon: { value: initial.skyHorizon.clone() },
      cloud: { value: new Color(PALETTE.cloud) },
      cloudBase: { value: new Color(PALETTE.cloud).lerp(new Color(PALETTE.skyLow), 0.28) },
      cloudTime: { value: 0 },
      sunDirection: { value: initial.sunDirection.clone() },
      sunGlow: { value: new Color(PALETTE.sunGold) },
      coastWeight: { value: initial.coastWeight ?? 0 },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 skyTop;
      uniform vec3 skyHorizon;
      uniform vec3 cloud;
      uniform vec3 cloudBase;
      uniform float cloudTime;
      uniform vec3 sunDirection;
      uniform vec3 sunGlow;
      uniform float coastWeight;
      varying vec3 skyDirection;
      // Periodic value noise keeps the azimuth seam invisible, including while drifting.
      float cloudHash(float x, float y, float period) {
        return fract(sin(mod(x, period) * 127.1 + y * 311.7) * 43758.5453);
      }
      float cloudNoise(float x, float y, float period) {
        float ix = floor(x);
        float iy = floor(y);
        float fx = fract(x);
        float fy = fract(y);
        float ux = fx * fx * (3.0 - 2.0 * fx);
        float uy = fy * fy * (3.0 - 2.0 * fy);
        return mix(mix(cloudHash(ix, iy, period), cloudHash(ix + 1.0, iy, period), ux),
          mix(cloudHash(ix, iy + 1.0, period), cloudHash(ix + 1.0, iy + 1.0, period), ux), uy);
      }
      float cloudDensity(vec3 direction) {
        // Only the 5–35 degree shelf carries clouds; the zenith stays open blue.
        float band = smoothstep(sin(radians(5.0)), sin(radians(10.0)), direction.y);
        band *= 1.0 - smoothstep(sin(radians(30.0)), sin(radians(35.0)), direction.y);
        if (band <= 0.0) return 0.0;
        float x = atan(direction.z, direction.x) * 5.09295818 + 16.0 + cloudTime * 0.025;
        float y = direction.y * 12.0;
        // Broad rounded lobes with two smaller brush scales; no downloaded textures.
        float puffs = 0.72 * cloudNoise(x, y, 32.0) + 0.21 * cloudNoise(x * 2.0, y * 2.0, 64.0);
        puffs += 0.07 * cloudNoise(x * 4.0, y * 4.0, 128.0);
        return band * smoothstep(0.52, 0.66, puffs);
      }
      vec3 skyColor(vec3 direction) {
        float height = max(direction.y, 0.0);
        float gradient = smoothstep(0.0, 0.85, sqrt(height));
        vec3 color = mix(skyHorizon, skyTop, gradient);
        float density = cloudDensity(direction);
        float underside = smoothstep(0.10, 0.48, height);
        vec3 cloudColor = mix(cloudBase, cloud, underside);
        color = mix(color, cloudColor, density);
        float alignment = dot(direction, normalize(sunDirection));
        // Two-degree disc with a soft edge; a thirty-degree halo strongest at the sea horizon.
        float disc = smoothstep(cos(radians(1.15)), cos(radians(0.85)), alignment);
        float halo = smoothstep(cos(radians(30.0)), 1.0, alignment);
        halo *= 1.0 - smoothstep(0.0, 0.5, height);
        float radiance = ((0.12 + 0.20 * coastWeight) * halo + 1.1 * disc) * (1.0 - 0.85 * density);
        return color + sunGlow * radiance;
      }
      void main() {
        gl_FragColor = vec4(skyColor(normalize(skyDirection)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 24, 12), material);
  mesh.name = "position-graded-sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.raycast = () => {};
  const center = new Vector3();
  // Only translation follows the camera: looking around cannot rotate the sky gradient.
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.matrixWorld.setPosition(camera.getWorldPosition(center));
  };
  let disposed = false;
  return {
    mesh,
    /** dt is seconds; reduced motion pauses the current cloud phase without jumping. */
    update(grade: LightingGrade, dt = 0, reducedMotion = false): void {
      if (disposed) return;
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Sky dt must be finite and non-negative");
      if (!reducedMotion) material.uniforms.cloudTime!.value = (material.uniforms.cloudTime!.value + dt) % 1280;
      material.uniforms.skyTop!.value.copy(grade.skyTop);
      material.uniforms.skyHorizon!.value.copy(grade.skyHorizon);
      material.uniforms.sunDirection!.value.copy(grade.sunDirection);
      material.uniforms.coastWeight!.value = grade.coastWeight ?? 0;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
