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
      // A planar noise domain has no azimuth seam or rows around the sky.
      // Integer polynomial intermediates stay below 2^24: highp GPU floats and
      // the CPU reference agree, without a sin hash's platform-sensitive seeds.
      float cloudSeed(float x, float y) {
        float h = mod(x, 251.0);
        h = mod((h * 17.0 + 13.0) * h + mod(y, 251.0), 251.0);
        return mod((h * 17.0 + 13.0) * h, 251.0) / 251.0;
      }
      float cloudNoise(float x, float y) {
        float ix = floor(x);
        float iy = floor(y);
        float fx = fract(x);
        float fy = fract(y);
        float ux = fx * fx * (3.0 - 2.0 * fx);
        float uy = fy * fy * (3.0 - 2.0 * fy);
        return mix(mix(cloudSeed(ix, iy), cloudSeed(ix + 1.0, iy), ux),
          mix(cloudSeed(ix, iy + 1.0), cloudSeed(ix + 1.0, iy + 1.0), ux), uy);
      }
      float cloudFbm(float x, float y) {
        return 0.57 * cloudNoise(x, y) + 0.29 * cloudNoise(x * 2.03 + 19.1, y * 2.03 + 7.7)
          + 0.14 * cloudNoise(x * 4.11 + 3.4, y * 4.11 + 31.8);
      }
      float cloudLobe(float x, float y, float width, float height) {
        return 1.0 - sqrt(x * x / (width * width) + y * y / (height * height));
      }
      vec3 cloudShape(vec3 direction) {
        float height = max(direction.y, 0.0);
        if (height <= 0.015) return vec3(-1.0, 0.0, 0.0);
        // Intersect a cloud sheet: distant footprints become small, flat silhouettes;
        // overhead footprints stay round. No latitude cutoff can turn them into a curtain.
        float breeze = 0.045 * sin(cloudTime * 6.28318530718 / 1280.0);
        float planeX = direction.x * 2.6 / (height + 0.08) + 64.0 + breeze;
        float planeY = direction.z * 2.6 / (height + 0.08) + 64.0 + breeze * 0.43;
        float x = planeX + 0.72 * (cloudFbm(planeX * 0.73, planeY * 0.73) - 0.5);
        float y = planeY + 0.72 * (cloudFbm(planeX * 0.73 + 29.4, planeY * 0.73 + 13.7) - 0.5);
        float column = floor(x);
        float row = floor(y);
        float horizontal = max(0.001, sqrt(direction.x * direction.x + direction.z * direction.z));
        float overhead = smoothstep(0.55, 0.94, height);
        float erosion = cloudFbm(x * 8.0, y * 8.0) - 0.5;
        vec3 shape = vec3(-10.0, 0.0, 0.0);
        for (float j = -1.0; j <= 1.0; j += 1.0) {
          float r = row + j;
          for (float i = -1.0; i <= 1.0; i += 1.0) {
            float c = column + i;
            float seed = cloudSeed(c, r);
            float sizeNoise = cloudNoise(c * 0.61 + 5.3, r * 0.61 + 11.8);
            float width = 0.14 + 0.50 * smoothstep(0.18, 0.82, sizeNoise);
            float depth = width * (0.65 + 0.6 * seed);
            float dx = x - c - 0.5 - 0.78 * (cloudNoise(c * 1.37 + 41.7, r * 1.37 + 9.2) - 0.5);
            float dy = y - r - 0.5 - 0.78 * (cloudNoise(c * 1.37 + 8.3, r * 1.37 + 53.1) - 0.5);
            // Radial is up in the horizon view; tangential is left/right.
            float px = (dx * direction.z - dy * direction.x) / horizontal;
            float py = -(dx * direction.x + dy * direction.z) / horizontal;
            // Reject distant cells before evaluating their compound silhouettes.
            if (abs(dx) > width * 1.45 || abs(dy) > depth * 1.4) continue;
            float field = cloudLobe(dx, dy, width * 0.78, depth * 0.72);
            for (float k = 0.0; k < 5.0; k += 1.0) {
              float lobeSeed = cloudSeed(c + k * 17.0, r + k * 7.0);
              float offsetX = (lobeSeed - 0.5) * width * 1.55;
              float offsetY = (cloudSeed(c + k * 11.0, r + 37.0) - 0.35) * depth;
              float radius = 0.24 + 0.38 * cloudSeed(c + k * 3.0, r + 71.0);
              field = max(field, cloudLobe(dx - offsetX, dy - offsetY, width * radius, depth * radius));
            }
            // Multiscale erosion breaks perfect arcs; the shallow base undulates instead
            // of sharing a straight cut. Round undersides replace that base overhead.
            field += 0.19 * erosion;
            float base = (py / depth + 0.42 + 0.13 * (cloudNoise(x * 7.0, y * 7.0) - 0.5)) * 2.5;
            field = mix(min(field, base), field, overhead);
            if (field > shape.x) shape = vec3(field,
              mix((py / depth + 0.42) / 1.25, 0.15 + 0.3 * field, overhead), px / width);
          }
        }
        return shape;
      }
      float cloudOpacity(vec3 direction) {
        // Aerial haze dissolves the horizon; thinner overhead clouds expose darker bases.
        return smoothstep(0.06, 0.16, direction.y) * (1.0 - 0.28 * smoothstep(0.65, 0.98, direction.y));
      }
      float cloudDensity(vec3 direction) {
        return smoothstep(-0.025, 0.025, cloudShape(direction).x) * cloudOpacity(direction);
      }
      vec3 skyColor(vec3 direction) {
        float height = max(direction.y, 0.0);
        float gradient = smoothstep(0.0, 0.85, sqrt(height));
        vec3 color = mix(skyHorizon, skyTop, gradient);
        vec3 shape = cloudShape(direction);
        float density = smoothstep(-0.025, 0.025, shape.x) * cloudOpacity(direction);
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
