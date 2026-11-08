import { Color, LoadingManager, Mesh, MeshToonMaterial, NoColorSpace, RepeatWrapping, type Object3D, type Texture, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { hex } from "../art/palette";

export const TERRAIN_TEXTURE_BYTES = 385355;
export const TERRAIN_TEXTURE_URLS = ["grass", "dirt", "rock", "sand", "normal"].map(name => `/world/textures/${name}.ktx2`);

const declarations = `
varying vec3 groundPosition;
varying vec3 groundNormal;
uniform sampler2D groundGrass;
uniform sampler2D groundDirt;
uniform sampler2D groundRock;
uniform sampler2D groundSand;
uniform sampler2D groundNormalMap;
uniform vec3 groundGrassColor;
uniform vec3 groundDryColor;
uniform vec3 groundSandColor;
float groundSample(sampler2D tex, vec2 uv) {
  // Rotated, offset second octave avoids reinforcing the fine repeat.
  return 0.72 * texture2D(tex, uv / 1.5).r
    + 0.28 * texture2D(tex, mat2(0.8, -0.6, 0.6, 0.8) * uv / 8.0 + vec2(0.37, 0.61)).r;
}
float groundDetail(vec3 pigment) {
  vec3 n = normalize(groundNormal);
  float fade = 1.0 - smoothstep(20.0, 110.0, distance(cameraPosition, groundPosition));
  if (fade <= 0.0) return 1.0;
  vec3 axis = pow(abs(n), vec3(4.0));
  axis /= max(dot(axis, vec3(1.0)), 0.0001);
  float stone = groundSample(groundRock, groundPosition.yz) * axis.x
    + groundSample(groundRock, groundPosition.xz) * axis.y
    + groundSample(groundRock, groundPosition.xy) * axis.z;
  float greenDistance = min(distance(pigment, groundGrassColor), distance(pigment, groundDryColor));
  float sandDistance = distance(pigment, groundSandColor);
  float grassWeight = 1.0 - smoothstep(0.08, 0.30, greenDistance);
  float sandWeight = (1.0 - smoothstep(0.06, 0.24, sandDistance))
    * (1.0 - smoothstep(-720.0, -680.0, groundPosition.z));
  float rockWeight = 1.0 - smoothstep(0.57, 0.82, abs(n.y));
  float detail = mix(groundSample(groundDirt, groundPosition.xz), groundSample(groundGrass, groundPosition.xz), grassWeight);
  detail = mix(detail, groundSample(groundSand, groundPosition.xz), sandWeight);
  detail = mix(detail, stone, rockWeight);
  // Neutral linear data: readable relief without moving the base palette.
  return 1.0 + fade * clamp(2.4 * (detail - 0.5), -0.25, 0.25);
}

`;

/** Composition owns this binding; first render starts local assets even without Lead entry wiring. */
export function bindTerrainDetail(root: Object3D, material: MeshToonMaterial, initialQuality: Quality, onError: (error: unknown) => void) {
  let quality = initialQuality;
  let controller: ReturnType<typeof createTerrainDetail> | undefined;
  let started = false, disposed = false;
  const previous = material.onBeforeRender;
  const ready = async (renderer: WebGLRenderer) => {
    if (disposed) return;
    controller ??= createTerrainDetail(root, renderer);
    started = true;
    await controller.setQuality(quality);
  };
  material.onBeforeRender = function (renderer, ...args) {
    previous.call(this, renderer, ...args);
    if (!started && quality !== "Low") void ready(renderer).catch(onError);
  };
  return {
    ready,
    setQuality(next: Quality) {
      quality = next;
      if (controller) void controller.setQuality(next).catch(onError);
    },
    dispose() {
      disposed = true;
      material.onBeforeRender = previous;
      controller?.dispose();
    },
  };
}
/** Wraps the existing ramp hook; Low restores its exact original program. Textures remain caller-owned. */
export function attachTerrainDetail(material: MeshToonMaterial, textures: readonly Texture[]) {
  if (textures.length !== 5) throw new RangeError("Terrain detail needs five textures");
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  let enabled = false;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (!enabled) return;
    for (const [i, name] of ["groundGrass", "groundDirt", "groundRock", "groundSand", "groundNormalMap"].entries()) {
      shader.uniforms[name] = { value: textures[i] };
    }
    shader.uniforms.groundGrassColor = { value: new Color(hex("grass")) };
    shader.uniforms.groundDryColor = { value: new Color(hex("grassDry")) };
    shader.uniforms.groundSandColor = { value: new Color(hex("sand")) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 groundPosition;\nvarying vec3 groundNormal;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        groundPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        groundNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${declarations}\nvoid main() {`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        float groundFade = 1.0 - smoothstep(20.0, 110.0, distance(cameraPosition, groundPosition));
        if (groundFade > 0.0) {
        vec3 groundN = normalize(groundNormal);
        vec3 groundT = normalize(cross(abs(groundN.y) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0), groundN));
        vec3 groundB = cross(groundN, groundT);
        vec2 groundRelief = texture2D(groundNormalMap, groundPosition.xz / 1.5).rg * 2.0 - 1.0;
        normal = normalize(normal + mat3(viewMatrix) * (groundT * groundRelief.x + groundB * groundRelief.y) * 0.35 * groundFade);
        }`)
      .replace("#include <opaque_fragment>", "outgoingLight *= groundDetail(vColor.rgb);\n#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => `${key.call(material)}:ground-ktx2-v1:${enabled}`;
  return {
    setQuality(quality: Quality) {
      const next = quality !== "Low";
      if (enabled !== next) { enabled = next; material.needsUpdate = true; }
    },
    dispose() {
      material.onBeforeCompile = before;
      material.customProgramCacheKey = key;
      material.needsUpdate = true;
    },
  };
}

/** Call after composition creates its first tiles. One shared material covers later streamed tiles. */
export function createTerrainDetail(root: Object3D, renderer: WebGLRenderer) {
  const materials = new Set<MeshToonMaterial>();
  root.traverse(object => {
    if (object instanceof Mesh && object.name === "terrain-tile" && object.material instanceof MeshToonMaterial) materials.add(object.material);
  });
  if (!materials.size) throw new Error("Create terrain detail after the initial terrain tiles");
  let quality: Quality = "Low", disposed = false;
  let pending: Promise<void> | undefined;
  let textures: Texture[] = [];
  let hooks: ReturnType<typeof attachTerrainDetail>[] = [];
  return {
    /** Await at world entry so KTX2, decoder and runtime count toward the 8 MB gate. */
    async setQuality(next: Quality): Promise<void> {
      if (disposed) return;
      quality = next;
      for (const hook of hooks) hook.setQuality(next);
      if (next === "Low") return;
      if (!pending) pending = (async () => {
        const { KTX2Loader } = await import("three/examples/jsm/loaders/KTX2Loader.js");
        if (disposed) return;
        const ktx = new KTX2Loader(new LoadingManager());
        // Three r187 resolves its bundled local decoder URLs by default.
        ktx.detectSupport(renderer);
        const results = await Promise.allSettled(TERRAIN_TEXTURE_URLS.map(url => ktx.loadAsync(url)));
        ktx.dispose();
        textures = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        const failure = results.find(result => result.status === "rejected");
        if (disposed || failure) {
          for (const texture of textures) texture.dispose();
          textures = [];
          if (failure) throw failure.reason;
          return;
        }
        for (const texture of textures) {
          texture.colorSpace = NoColorSpace;
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          texture.needsUpdate = true;
        }
        hooks = [...materials].map(material => attachTerrainDetail(material, textures));
        for (const hook of hooks) hook.setQuality(quality);
      })().catch(error => { pending = undefined; throw error; });
      await pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const hook of hooks) hook.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
