import { Camera, LinearFilter, Mesh, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import { CLOUD_VOLUME_FRAGMENT, createCloudNoise } from "./cloud-volume";

export type SkyQuality = "Low" | "Balanced" | "High";
export function skyBakeSize(quality: SkyQuality, software: boolean): number {
  return software ? 256 : quality === "High" ? 2048 : quality === "Balanced" ? 1024 : 512;
}
export function isSoftwareSkyRenderer(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(name);
}

/** Lazily allocate after entry. Low is a static optical skybox baked by the High integrator. */
export function createCloudBake() {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: { volumeNoise: { value: null }, sunDirection: { value: new Vector3() } },
    vertexShader: "varying vec2 bakeUv; void main(){bakeUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
    fragmentShader: CLOUD_VOLUME_FRAGMENT,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const camera = new Camera();
  let target: WebGLRenderTarget | undefined;
  let noise: ReturnType<typeof createCloudNoise> | undefined;
  let revision = -1;
  const bakedSun = new Vector3();
  return {
    get texture() { return target?.texture; },
    render(renderer: WebGLRenderer, sun: Vector3, quality: SkyQuality, software: boolean): void {
      const size = skyBakeSize(quality, software);
      if (target?.width !== size) {
        target?.dispose();
        target = new WebGLRenderTarget(size, size / 2, { depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
        target.texture.wrapS = RepeatWrapping;
        target.texture.name = "high-volume-optical-skybox";
        revision = -1;
      }
      if (revision >= 0 && bakedSun.dot(sun) > 0.998) return;
      noise ??= createCloudNoise();
      material.uniforms.volumeNoise!.value = noise;
      material.uniforms.sunDirection!.value.copy(sun);
      const previous = renderer.getRenderTarget();
      const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      const autoClear = renderer.autoClear;
      const xr = renderer.xr.enabled;
      try {
        renderer.xr.enabled = false;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        bakedSun.copy(sun); revision++;
      } finally {
        renderer.setRenderTarget(previous, face, mip);
        renderer.autoClear = autoClear;
        renderer.xr.enabled = xr;
      }
    },
    invalidate(): void { revision = -1; },
    dispose(): void { target?.dispose(); noise?.dispose(); geometry.dispose(); material.dispose(); },
  };
}
