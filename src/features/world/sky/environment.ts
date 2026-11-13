import {
  BackSide, BoxGeometry, CubeCamera, LinearFilter, Mesh, NoColorSpace,
  PMREMGenerator, RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, Texture, type WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { Quality } from "../terrain";

export const ENVIRONMENTS = ["kiara_1_dawn", "venice_sunset"] as const;
export function environmentUrls(quality: Quality): string[] {
  return quality === "Low" ? [] : ENVIRONMENTS.map(id => `/world/env/${id}-${quality === "High" ? 2048 : 1024}.ktx2`);
}
export const environmentWeight = (value: number) => Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));

/** RGBM16 stores scene-linear HDR radiance in portable UASTC RGBA. Decode before PMREM filtering. */
function prefilter(renderer: WebGLRenderer, texture: Texture) {
  const geometry = new SphereGeometry(10, 32, 16);
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false, toneMapped: false,
    uniforms: { panorama: { value: texture } },
    vertexShader: "varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `uniform sampler2D panorama;varying vec3 direction;
      // KTXorientation=rd and compressed textures have flipY=false: north is the first row.
      void main(){vec3 d=normalize(direction);vec2 uv=vec2(atan(d.z,d.x)/6.28318530718+.5,.5-asin(clamp(d.y,-1.,1.))/3.14159265359);
      vec4 m=texture2D(panorama,uv);gl_FragColor=vec4(m.rgb*m.a*16.,1.);}`,
  });
  const capture = new Scene(); capture.add(new Mesh(geometry, material));
  const generator = new PMREMGenerator(renderer);
  try { return generator.fromScene(capture, 0, 0.1, 30, { size: 256 }); }
  finally { generator.dispose(); geometry.dispose(); material.dispose(); }
}

/** Network completion only stages CPU textures. GPU upload, PMREM and publication happen on a gameplay draw. */
export function createEnvironment(renderer: WebGLRenderer, scene: Scene) {
  const previous = scene.environment, previousIntensity = scene.environmentIntensity;
  let quality: Quality = "Low", revision = 0, disposed = false, weight = 0, lastWeight = -1;
  let loader: KTX2Loader | undefined;
  let active = true;
  let request: AbortController | undefined;
  let inFlight = 0;
  let staged: Texture[] = [];
  const maps: WebGLCubeRenderTarget[] = [];
  let blended: WebGLCubeRenderTarget | undefined;
  const material = new ShaderMaterial({
    side: BackSide, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { dawn: { value: null }, dusk: { value: null }, weight: { value: 0 }, lod: { value: 0 } },
    vertexShader: "varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 direction;uniform samplerCube dawn,dusk;uniform float weight,lod;void main(){vec3 d=normalize(direction);gl_FragColor=mix(textureLod(dawn,d,lod),textureLod(dusk,d,lod),weight);}",
  });
  const geometry = new BoxGeometry(2, 2, 2);
  const blendScene = new Scene(); blendScene.add(new Mesh(geometry, material));
  function release() {
    if (scene.environment === blended?.texture) { scene.environment = previous; scene.environmentIntensity = previousIntensity; }
    for (const texture of staged) texture.dispose(); staged = [];
    for (const map of maps) map.dispose(); maps.length = 0;
    blended?.dispose(); blended = undefined; lastWeight = -1;
  }
  async function load(token: number, next: Quality) {
    let pending: KTX2Loader | undefined;
    const controller = new AbortController();
    request = controller;
    try {
      const { KTX2Loader } = await import("three/examples/jsm/loaders/KTX2Loader.js");
      if (disposed || !active || token !== revision) return;
      // Quality changes can overlap fetches. Share one worker, and release it only
      // after outstanding transcodes settle (terminating it early strands promises).
      pending = loader ?? new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
      loader = pending;
      inFlight++;
      const results = await Promise.allSettled(environmentUrls(next).map(async url => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Environment HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted) throw new Error("Environment cancelled");
        return new Promise<Texture>((resolve, reject) => pending!.parse(buffer, resolve, reject));
      }));
      const textures = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      if (disposed || token !== revision || textures.length !== 2) {
        for (const texture of textures) texture.dispose();
        return;
      }
      for (const texture of textures) {
        texture.colorSpace = NoColorSpace; texture.wrapS = RepeatWrapping;
        texture.minFilter = texture.magFilter = LinearFilter; texture.needsUpdate = true;
      }
      staged = textures;
    } catch {
      // Optional IBL failure keeps the position-graded hemisphere/sun, without breaking entry.
    } finally {
      if (request === controller) request = undefined;
      if (pending && --inFlight === 0) { pending.dispose(); loader = undefined; }
    }
  }
  return {
    setQuality(next: Quality) {
      if (disposed || quality === next) return;
      quality = next; const token = ++revision;
      request?.abort();
      release();
      if (active && next !== "Low") void load(token, next);
    },
    setActive(next: boolean) {
      if (disposed || active === next) return;
      active = next; const token = ++revision;
      request?.abort();
      // Completed PMREMs remain cached while hidden. Incomplete captures restart
      // on resume; stale worker results are disposed by the revision guard.
      if (maps.length !== 2) release();
      if (active && quality !== "Low" && maps.length !== 2) void load(token, quality);
    },
    setTimeOfDay(value: number) { weight = environmentWeight(value); },
    update() {
      if (disposed || !active || quality === "Low") return;
      // Amortize the two PMREM captures over separate frames, after entry.
      if (staged.length) {
        const texture = staged.shift()!;
        try { maps.push(prefilter(renderer, texture)); }
        finally { texture.dispose(); }
        return;
      }
      if (maps.length !== 2) return;
      if (!blended) {
        // Three r187 PMREM is a cubemap with prefiltered mip levels, not a CubeUV atlas.
        blended = maps[0]!.clone();
        blended.texture.isPMREMTexture = true;
        material.uniforms.dawn!.value = maps[0]!.texture;
        material.uniforms.dusk!.value = maps[1]!.texture;
      }
      if (Math.abs(lastWeight - weight) < 0.005 && weight !== 0 && weight !== 1) return;
      if (lastWeight === weight) return;
      const destination = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      try {
        material.uniforms.weight!.value = weight;
        renderer.autoClear = true;
        const capture = new CubeCamera(0.1, 10, blended);
        for (let lod = 0; lod < blended.texture.mipmaps.length; lod++) {
          material.uniforms.lod!.value = lod;
          capture.activeMipmapLevel = lod;
          blended.viewport.set(0, 0, blended.width >> lod, blended.height >> lod);
          capture.update(renderer, blendScene);
        }
        blended.viewport.set(0, 0, blended.width, blended.height);
      } finally { renderer.setRenderTarget(destination); renderer.autoClear = autoClear; }
      scene.environment = blended.texture;
      scene.environmentIntensity = 0.3;
      lastWeight = weight;
    },
    dispose() { if (disposed) return; disposed = true; ++revision; request?.abort(); release(); geometry.dispose(); material.dispose(); },
  };
}
