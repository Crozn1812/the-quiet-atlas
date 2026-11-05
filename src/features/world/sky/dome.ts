import { BackSide, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { coastAtmosphereWeight, lightingAt, type LightingGrade } from "./grade";

/** One sloping, texture-free mist shelf inland (+Z); never covers the seaward half-space. */
export function createCoastMountainMist() {
  const mistColor = new Color(PALETTE.mist);
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
      material.uniforms.mistColor!.value.copy(grade.fogColor);
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
  const cloudShadow = new Color(PALETTE.cloud).lerp(new Color(PALETTE.indigo), 0.7).lerp(new Color(PALETTE.vermilion), 0.18);
  const cloudDusk = new Color(PALETTE.cloud).lerp(new Color(PALETTE.indigo), 0.5).lerp(new Color(PALETTE.vermilion), 0.13);
  const material = new ShaderMaterial({
    uniforms: {
      skyTop: { value: initial.skyTop.clone() },
      skyHorizon: { value: initial.skyHorizon.clone() },
      cloud: { value: new Color(PALETTE.cloud).lerp(initial.skyTop, 0.25).lerp(initial.sunColor, 0.12).lerp(cloudDusk, initial.coastWeight ?? 0) },
      cloudBase: { value: cloudShadow.clone().lerp(initial.skyHorizon, 0.06 + 0.12 * (initial.coastWeight ?? 0)).lerp(initial.sunColor, 0.03 + 0.12 * (initial.coastWeight ?? 0)) },
      cloudTime: { value: 0 },
      sunDirection: { value: initial.sunDirection.clone() },
      sunGlow: { value: initial.sunColor.clone() },
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
      // Periodic seeded cells keep the azimuth seam invisible, including while drifting.
      float cloudHash(float x, float y, float period) {
        return fract(sin(mod(x, period) * 127.1 + y * 311.7) * 43758.5453);
      }
      // Elliptical lobes share a shallow, almost level condensation base.
      float cloudLobe(float x, float y, float width, float height) {
        return 1.0 - sqrt(x * x / (width * width) + y * y / (height * height));
      }
      vec3 cloudShape(vec3 direction) {
        float height = max(direction.y, 0.0);
        if (height <= 0.11 || height >= 0.96) return vec3(-1.0, 0.0, 0.0);
        // sqrt compresses distant vertical silhouettes; integer periods shrink their width.
        float y = sqrt(height) * 4.0;
        float row = floor(y);
        float azimuth = atan(direction.z, direction.x) / 6.28318530718 + 0.5;
        // A twenty-minute breeze cycle wraps continuously and moves only a few degrees.
        azimuth += 0.008 * sin(cloudTime * 6.28318530718 / 1280.0);
        vec3 shape = vec3(-10.0, 0.0, 0.0);
        for (float j = -1.0; j <= 1.0; j += 1.0) {
          float r = row + j;
          float period = max(12.0, 40.0 - r * 8.0);
          float x = azimuth * period;
          float column = floor(x);
          for (float i = -1.0; i <= 1.0; i += 1.0) {
            float c = column + i;
            float seed = cloudHash(c, r, period);
            float px = x - c - 0.5 - (seed - 0.5) * 0.25;
            float py = y - r - 0.46 - (cloudHash(c, r + 17.0, period) - 0.5) * 0.18;
            float width = 0.34 + seed * 0.12;
            float rise = 0.32 + cloudHash(c, r + 31.0, period) * 0.15;
            float field = cloudLobe(px, py - 0.08, width * 0.7, rise);
            field = max(field, cloudLobe(px + width * 0.53, py, width * 0.52, rise * 0.72));
            field = max(field, cloudLobe(px - width * 0.55, py + 0.02, width * 0.55, rise * 0.65));
            field = min(field, (py + 0.18 + 0.015 * cos(px * 12.0)) * 4.0);
            // Narrow painted edge, also at the horizon/zenith limits.
            field = min(field, min((height - 0.11) * 80.0, (0.96 - height) * 80.0));
            if (field > shape.x) shape = vec3(field, (py + 0.18) / (rise + 0.26), px / width);
          }
        }
        return shape;
      }
      float cloudDensity(vec3 direction) {
        return smoothstep(-0.025, 0.025, cloudShape(direction).x);
      }
      vec3 skyColor(vec3 direction) {
        float height = max(direction.y, 0.0);
        float gradient = smoothstep(0.0, 0.85, sqrt(height));
        vec3 color = mix(skyHorizon, skyTop, gradient);
        vec3 shape = cloudShape(direction);
        float density = smoothstep(-0.025, 0.025, shape.x);
        float crown = smoothstep(0.12, 0.78, shape.y);
        vec3 cloudColor = mix(cloudBase, cloud, crown);
        // A rounded sun-facing shoulder and warm rim, independent of the sky halo.
        float sunSide = sin(atan(sunDirection.z, sunDirection.x) - atan(direction.z, direction.x));
        float shoulder = smoothstep(-0.6, 0.8, shape.z * sunSide) * crown;
        float rim = (1.0 - smoothstep(0.02, 0.20, shape.x)) * shoulder;
        cloudColor = mix(cloudColor, sunGlow, 0.12 * shoulder + 0.24 * rim);
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
      material.uniforms.sunGlow!.value.copy(grade.sunColor);
      material.uniforms.cloud!.value.set(PALETTE.cloud).lerp(grade.skyTop, 0.25).lerp(grade.sunColor, 0.12).lerp(cloudDusk, grade.coastWeight ?? 0);
      material.uniforms.cloudBase!.value.copy(cloudShadow).lerp(grade.skyHorizon, 0.06 + 0.12 * (grade.coastWeight ?? 0)).lerp(grade.sunColor, 0.03 + 0.12 * (grade.coastWeight ?? 0));
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
