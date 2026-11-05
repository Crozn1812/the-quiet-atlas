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
      paper: { value: new Color(PALETTE.paper) },
      sunDirection: { value: initial.sunDirection.clone() },
      sunGlow: { value: new Color(PALETTE.dusk).lerp(new Color(PALETTE.flower), 0.25).lerp(new Color(PALETTE.paper), 0.45) },
      coastWeight: { value: initial.coastWeight ?? 0 },
    },
    vertexShader: `
      varying vec3 skyDirection;
      varying float skyHeight;
      void main() {
        skyDirection = position;
        skyHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 skyTop;
      uniform vec3 skyHorizon;
      uniform vec3 paper;
      uniform vec3 sunDirection;
      uniform vec3 sunGlow;
      uniform float coastWeight;
      varying vec3 skyDirection;
      varying float skyHeight;
      vec3 skyColor(vec3 direction) {
        // Keep the original vertex-interpolated height in the forest.
        float height = max(mix(skyHeight, direction.y, coastWeight), 0.0);
        // Bring the coast's blue-violet wash into the visible sky above a warm horizon.
        float gradient = mix(smoothstep(0.0, 0.85, height), smoothstep(0.0, 0.65, sqrt(height)), coastWeight);
        vec3 color = mix(skyHorizon, skyTop, gradient);
        float paperBand = 1.0 - smoothstep(0.0, 0.12, abs(skyHeight));
        color = mix(color, paper, mix(0.06, 0.02, coastWeight) * paperBand);
        float alignment = dot(direction, normalize(sunDirection));
        // Two-degree disc with a soft edge; a thirty-degree halo strongest at the sea horizon.
        float disc = smoothstep(cos(radians(1.15)), cos(radians(0.85)), alignment);
        float halo = smoothstep(cos(radians(30.0)), 1.0, alignment);
        halo *= 1.0 - smoothstep(0.0, 0.5, abs(skyHeight));
        float radiance = coastWeight * (0.32 * halo + 1.1 * disc);
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
    update(grade: LightingGrade): void {
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
