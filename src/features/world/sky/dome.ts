import { BackSide, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { ATMOSPHERE_FRAGMENT } from "./atmosphere";
import { cloudLight } from "./cloud-light";
import { createCloudBake, isSoftwareSkyRenderer, type SkyQuality } from "./cloud-bake";
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

/** Camera-centred atmosphere with a deferred volumetric optical skybox. */
export function createSkyDome(initial: LightingGrade = lightingAt(0), radius = 80) {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("Sky radius must be finite and positive");
  const cloudSun = new Color(), cloudShade = new Color();
  cloudLight(initial, cloudSun, cloudShade);
  const material = new ShaderMaterial({
    uniforms: {
      skyTop: { value: initial.skyTop.clone() },
      skyHorizon: { value: initial.skyHorizon.clone() },
      fogColor: { value: initial.fogColor.clone() },
      sunDirection: { value: initial.sunDirection.clone() },
      sunGlow: { value: initial.sunColor.clone() },
      cloudSun: { value: cloudSun },
      cloudShade: { value: cloudShade },
      cloudTime: { value: 0 },
      cloudMap: { value: null },
      cloudReady: { value: 0 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() { skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    side: BackSide, depthWrite: false, depthTest: false,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 24, 12), material);
  mesh.name = "position-graded-sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.raycast = () => {};
  const center = new Vector3();
  const bake = createCloudBake();
  let disposed = false, firstDraw = true;
  let quality: SkyQuality = "High";
  let qualityOverride: SkyQuality | undefined;
  let software: boolean | undefined;
  let seconds = 0;
  let contextCanvas: HTMLCanvasElement | undefined;
  const restore = () => { bake.invalidate(); firstDraw = true; material.uniforms.cloudReady!.value = 0; };
  // Existing composition carries quality on the renderer's owning viewport.
  // An explicit setter also supports consumers without a DOM viewport.
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    mesh.matrixWorld.setPosition(camera.getWorldPosition(center));
    if (disposed || !renderer.getContext) return;
    if (!contextCanvas) {
      contextCanvas = renderer.domElement;
      contextCanvas.addEventListener("webglcontextrestored", restore);
      software = isSoftwareSkyRenderer(renderer);
    }
    const value = contextCanvas.closest<HTMLElement>("[data-world-quality]")?.dataset.worldQuality;
    quality = qualityOverride ?? (value === "low" ? "Low" : value === "balanced" ? "Balanced" : "High");
    material.uniforms.cloudTime!.value = quality === "Low" || software ? 0 : seconds;
    // Leave the first playable draw unblocked by noise generation or volume integration.
    if (firstDraw) { firstDraw = false; return; }
    bake.render(renderer, material.uniforms.sunDirection!.value, quality, software ?? false);
    material.uniforms.cloudMap!.value = bake.texture;
    material.uniforms.cloudReady!.value = 1;
  };
  return {
    mesh,
    setQuality(next: SkyQuality): void { if (!disposed) qualityOverride = quality = next; },
    /** World grade is authoritative; reduced motion freezes at the current phase. */
    update(grade: LightingGrade, dt = 0, reducedMotion = false): void {
      if (disposed) return;
      if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Sky dt must be finite and non-negative");
      if (!reducedMotion && quality !== "Low" && !software) seconds += dt;
      material.uniforms.cloudTime!.value = quality === "Low" || software ? 0 : seconds;
      material.uniforms.skyTop!.value.copy(grade.skyTop);
      material.uniforms.skyHorizon!.value.copy(grade.skyHorizon);
      material.uniforms.fogColor!.value.copy(grade.fogColor);
      material.uniforms.sunDirection!.value.copy(grade.sunDirection);
      material.uniforms.sunGlow!.value.copy(grade.sunColor);
      cloudLight(grade, cloudSun, cloudShade);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      contextCanvas?.removeEventListener("webglcontextrestored", restore);
      mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); bake.dispose();
    },
  };
}
