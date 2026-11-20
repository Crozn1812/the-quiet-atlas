import { Color, LoadingManager, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, NoColorSpace, SRGBColorSpace,
  type Material, type Object3D, type Texture, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { COAST_SAND_Z } from "../layout/scale";
import { cliffWeathering, weatherSpringCliff } from "./cliff";
import { createTerrainCliffs } from "../terrain/cliffs";
import { groundSurfaceShader } from "./ground";

export type PhotoSurface = "terrain" | "rock" | "road" | "bark" | "ground";
export const PHOTO_TILE_SIZE = { Low: 512, High: 2048 } as const;
export const photoTextureUrls = (quality: Quality) => ["color", "surface"].map(kind =>
  `/world/tex/${kind}-${PHOTO_TILE_SIZE[quality]}.ktx2`);

const fragment = `
varying vec3 photoWorld;
varying vec3 photoWorldNormal;
varying vec4 photoMask;
uniform sampler2D photoColor;
uniform sampler2D photoSurface;
uniform float photoTileSize;
// Inset at every sample avoids a neighbouring surface at wrapped atlas edges.
// Explicit gradients keep the fract() seam from selecting a coarse mip.
vec3 photoRead(sampler2D atlas, vec2 uv, float tile) {
  vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
  vec2 extent = vec2(4.0, 2.0);
  float span = 1.0;
  float pad = 4.0 / photoTileSize;
  if (photoTileSize > 1024.0) {
    // Packed High: four 2K photos above four 1K photos. Units are 1K cells.
    extent = vec2(8.0, 3.0);
    pad = 4.0 / 1024.0;
    span = 2.0;
    cell = vec2(0.0);
    if (tile < 0.5) cell = vec2(0.0, 0.0);
    else if (tile < 1.5) { cell = vec2(0.0, 2.0); span = 1.0; }
    else if (tile < 2.5) cell = vec2(2.0, 0.0);
    else if (tile < 3.5) { cell = vec2(1.0, 2.0); span = 1.0; }
    else if (tile < 4.5) cell = vec2(4.0, 0.0);
    else if (tile < 5.5) { cell = vec2(2.0, 2.0); span = 1.0; }
    else if (tile < 6.5) { cell = vec2(3.0, 2.0); span = 1.0; }
    else cell = vec2(6.0, 0.0);
  }
  vec2 scale = (span - 2.0 * pad) / extent;
  vec2 atlasUV = (cell + pad) / extent + fract(uv) * scale;
  // PNG rows and KTX2's unflipped upload use opposite Y to Blender image pixels.
  atlasUV.y = 1.0 - atlasUV.y;
  return textureGrad(atlas, atlasUV, dFdx(uv) * scale * vec2(1.0, -1.0), dFdy(uv) * scale * vec2(1.0, -1.0)).rgb;
}
vec3 photoOctaves(sampler2D atlas, vec2 uv, float tile) {
  #ifdef PHOTO_LOW
    return photoRead(atlas, uv, tile);
  #else
  return mix(photoRead(atlas, uv, tile), photoRead(atlas, uv * 0.237 + vec2(0.37, 0.61), tile), 0.24);
  #endif
}
vec3 photoProjection(sampler2D atlas, float tile, vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= max(dot(w, vec3(1.0)), 0.0001);
  return photoOctaves(atlas, p.zy / 3.0, tile) * w.x
    + photoOctaves(atlas, p.xz / 3.0, tile) * w.y
    + photoOctaves(atlas, p.xy / 3.0, tile) * w.z;
}
vec3 photoSample(sampler2D atlas, float tile, vec3 n) {
  #ifdef PHOTO_LOW
    // Dominant projection: one photo lookup, no PBR/normal work on Low.
    vec3 axis = abs(n);
    vec2 uv = axis.y >= max(axis.x, axis.z) ? photoWorld.xz
      : axis.x >= axis.z ? photoWorld.zy : photoWorld.xy;
    return photoRead(atlas, uv / 3.0, tile);
  #else
  if (abs(n.y) < 0.72) return photoProjection(atlas, tile, photoWorld, n);
  return photoOctaves(atlas, photoWorld.xz / 3.0, tile);
  #endif
}
vec3 photoBump(float tile, vec3 n) {
  if (abs(n.y) >= 0.72) {
    vec2 r = photoOctaves(photoSurface, photoWorld.xz / 3.0, tile).rg * 2.0 - 1.0;
    return vec3(r.x, 0.0, r.y) * 0.32;
  }
  vec3 w = pow(abs(n), vec3(4.0));
  w /= max(dot(w, vec3(1.0)), 0.0001);
  vec2 rx = photoOctaves(photoSurface, photoWorld.zy / 3.0, tile).rg * 2.0 - 1.0;
  vec2 ry = photoOctaves(photoSurface, photoWorld.xz / 3.0, tile).rg * 2.0 - 1.0;
  vec2 rz = photoOctaves(photoSurface, photoWorld.xy / 3.0, tile).rg * 2.0 - 1.0;
  return (vec3(0.0, rx.y, rx.x) * w.x + vec3(ry.x, 0.0, ry.y) * w.y + vec3(rz.x, rz.y, 0.0) * w.z) * 0.32;
}
`;

/** Two shared atlas samplers, real photo albedo/normal/roughness, no extra draw. */
export function createPhotoMaterial(kind: PhotoSurface, original: Material, textures: readonly Texture[], size: number) {
  const ground = kind === "terrain" && size !== 512;
  const source = original as Material & { color?: Color };
  const base = { color: source.color?.clone() ?? new Color(0xffffff), vertexColors: original.vertexColors, side: original.side };
  const material = size === 512
    ? new MeshToonMaterial({ ...base, gradientMap: (original as MeshToonMaterial).gradientMap ?? null })
    : new MeshStandardMaterial({ ...base, roughness: 0.95, metalness: 0, flatShading: kind === "ground" });
  material.name = `cc0-${kind}`;
  if (size === 512) material.defines = { PHOTO_LOW: "", ...(kind === "ground" ? { FLAT_SHADED: "" } : {}) };
  material.onBeforeCompile = (shader, renderer) => {
    if (kind === "ground" || size === 512) {
      // Retain the existing instanced geometry/color variant selection, while
      // replacing toon lighting with Three's physical lighting chunks.
      const physicalFragment = shader.fragmentShader;
      original.onBeforeCompile(shader, renderer);
      if (size !== 512) shader.fragmentShader = physicalFragment;
    }
    shader.uniforms.photoColor = { value: textures[0] };
    shader.uniforms.photoSurface = { value: textures[1] };
    shader.uniforms.photoTileSize = { value: size };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 photoWorld; varying vec3 photoWorldNormal; varying vec4 photoMask;
      ${kind === "terrain" ? "attribute vec4 cc0Surface; attribute vec2 cliffSurface; varying vec2 photoCliffMask;" : ""}
      ${ground ? "attribute vec4 groundSurface; varying vec4 photoGround;" : ""}`)
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 photoPosition = vec4(transformed, 1.0);
        vec3 photoN = objectNormal;
        #ifdef USE_INSTANCING
          photoPosition = instanceMatrix * photoPosition;
          photoN = mat3(instanceMatrix) * (photoN / vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz)));
        #endif
        photoWorld = (modelMatrix * photoPosition).xyz;
        photoWorldNormal = ${kind === "ground" ? "vec3(0.0, 1.0, 0.0)" : "normalize(mat3(modelMatrix) * photoN)"};
        photoMask = ${kind === "terrain" ? "cc0Surface" : kind === "ground" ? "vec4(groundVariant, 0.0, 0.0, 0.0)" : "vec4(0.0)"};
        ${kind === "terrain" ? "photoCliffMask = cliffSurface;" : ""}
        ${ground ? "photoGround = groundSurface;" : ""}`);
    const selection = kind === "terrain" ? `
      float baseTile = photoMask.x > 0.5 ? 0.0 : 1.0;
      float overlayTile = 5.0;
      float overlay = photoMask.y;
      if (photoMask.z > overlay) { overlay = photoMask.z; overlayTile = 2.0; }
      // Match MAP-01's coast boundary even across interpolated tile masks.
      float sandWeight = photoMask.w * (1.0 - smoothstep(${COAST_SAND_Z[0].toFixed(1)}, ${COAST_SAND_Z[1].toFixed(1)}, photoWorld.z));
      if (sandWeight > overlay) { overlay = sandWeight; overlayTile = 3.0; }
      float cliff = 1.0 - smoothstep(0.57, 0.82, abs(photoN.y));
      ${size === 512 ? "" : `
      // Photos and geometric normals break the grass/rock edge at sub-cell scale.
      float cliffPatch = cliffNoise(photoWorld * 1.1) - 0.5;
      cliff = (1.0 - smoothstep(0.55 + cliffPatch * 0.1, 0.83 + cliffPatch * 0.08, abs(photoN.y)))
        * photoCliffMask.y;
      `}
      if (cliff > overlay) { overlay = cliff; overlayTile = 4.0; }
    ` : `float baseTile = ${kind === "road" ? "6.0" : kind === "bark" ? "7.0" : kind === "ground" ? "(photoMask.x > 1.5 ? 7.0 : 4.0)" : "4.0"};
      float overlayTile = baseTile; float overlay = 0.0;`;
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `${fragment}\n${kind === "terrain" ? "varying vec2 photoCliffMask;" : ""}\n${ground ? cliffWeathering + groundSurfaceShader : ""}\nvoid main() {`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // Ground variants select different silhouettes from padded attributes.
        // Their shared normal attribute can be zero on a valid log triangle.
        // Use the selected triangle, matching the original flat ground shader.
        vec3 photoN = ${kind === "ground"
          ? "normalize(cross(dFdx(photoWorld), dFdy(photoWorld))) * (gl_FrontFacing ? 1.0 : -1.0)"
          : "normalize(photoWorldNormal)"};
        ${selection}
        ${ground ? `
        GroundPhoto gentleGround = GroundPhoto(vec3(0.0), vec3(0.5, 0.5, 1.0));
        if (cliff < 0.999) gentleGround = groundSurface(photoN, sandWeight);
        vec3 photoRelief = gentleGround.surface;
        diffuseColor.rgb = gentleGround.color;
        ` : `vec3 photoAlbedo = photoSample(photoColor, baseTile, photoN);
        vec3 photoRelief = photoSample(photoSurface, baseTile, photoN);
        ${kind === "terrain" ? `if (photoMask.x > 0.001 && photoMask.x < 0.999) {
          photoAlbedo = mix(photoSample(photoColor, 1.0, photoN), photoSample(photoColor, 0.0, photoN), photoMask.x);
          photoRelief = mix(photoSample(photoSurface, 1.0, photoN), photoSample(photoSurface, 0.0, photoN), photoMask.x);
        }` : ""}
        if (overlay > 0.001) {
          photoAlbedo = mix(photoAlbedo, photoSample(photoColor, overlayTile, photoN), overlay);
          photoRelief = mix(photoRelief, photoSample(photoSurface, overlayTile, photoN), overlay);
        }
        float region = sin(photoWorld.x * 0.031 + sin(photoWorld.z * 0.023)) * 0.035;
        // Source images are normalized around sRGB .68 (linear .42).
        // The existing palette stays the broad tint; real photos add hue and relief.
        diffuseColor.rgb *= clamp(photoAlbedo / 0.42, vec3(0.55), vec3(1.6)) * (1.0 + region);`}
        ${kind === "terrain" && size !== 512 ? `
        vec4 terrainWeather = vec4(0.0);
        if (cliff > 0.001) {
          terrainWeather = cliffWeather(photoWorld, photoN, photoCliffMask.x);
          photoRelief = mix(photoRelief, photoSample(photoSurface, 4.0, photoN), cliff);
          // Keep the photograph's mineral hue instead of multiplying it by beige grass pigment.
          vec3 stone = cliffPigment(photoSample(photoColor, 4.0, photoN) * 0.8, terrainWeather);
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, cliff);
        }` : ""}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(photoRelief.b, ${ground ? "0.32" : "0.72"}, 1.0);
        ${ground ? "roughnessFactor = mix(roughnessFactor, max(0.6, clamp(photoRelief.b, 0.72, 1.0) - terrainWeather.z * 0.12), cliff);" : ""}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        #ifndef PHOTO_LOW
        // Fetch each projection separately before combining world-space normals.
        ${ground ? `
        vec2 groundNormal = gentleGround.surface.rg * 2.0 - 1.0;
        vec3 detailWorld = vec3(groundNormal.x, 0.0, groundNormal.y) * 0.55;
        detailWorld -= photoN * dot(detailWorld, photoN);
        if (cliff > 0.001) detailWorld = mix(detailWorld, photoBump(4.0, photoN), cliff);
        ` : `vec3 detailWorld = photoBump(baseTile, photoN);
        if (overlay > 0.001) detailWorld = mix(detailWorld, photoBump(overlayTile, photoN), overlay);`}
        normal = normalize(normal + mat3(viewMatrix) * detailWorld * faceDirection);
        #endif`);
  };
  material.customProgramCacheKey = () => `photo-pbr-v3:${kind}:${size}`;
  return material;
}

/** Flat palette fallback: no photo, normal, procedural detail or lighting lookups. */
export function createPhotoFallback(kind: PhotoSurface, original: Material) {
  const material = new MeshBasicMaterial({
    color: (original as Material & { color?: Color }).color?.clone() ?? new Color(0xffffff),
    vertexColors: original.vertexColors, side: original.side,
  });
  material.name = `cc0-fallback-${kind}`;
  material.onBeforeCompile = (shader, renderer) => {
    // Ground batches select padded silhouettes and their colours in the vertex
    // hook. Retain those transforms, with the plain colour/fog fragment shader.
    const fragment = shader.fragmentShader;
    original.onBeforeCompile(shader, renderer);
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `photo-flat-v1:${kind}:${original.customProgramCacheKey()}`;
  return material;
}

function surfaceFor(mesh: Mesh): PhotoSurface | undefined {
  if (mesh.name === "terrain-tile") return "terrain";
  if (mesh.name === "coast-asphalt-and-markings") return "road";
  if (mesh.name === "spring-mossy-cliff" || mesh.name === "rock-stack-stones" || /^rock-(small|large)-\d$/.test(mesh.name)) return "rock";
  if (mesh.name === "prop-log") return "bark";
  if (mesh.name === "ground-wood-stone") return "ground";
  // P3 can opt in individual bark meshes without applying bark to leaves.
  if (mesh.userData.photoSurface === "bark") return "bark";
}

/** Owns photo resources after the dressing gate, or flat software shading during build. */
export function createPhotoSurfaces(root: Object3D, renderer: WebGLRenderer) {
  const cliffs = createTerrainCliffs(root, renderer);
  // Even toon mask blending and procedural detail are expensive on software
  // rasterizers, especially when the user pins overall quality to High.
  const gl = renderer.getContext?.();
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  const device = gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(device));
  let disposed = false, revision = 0;
  let textures: Texture[] = [];
  const originals = new Map<Mesh, Material>();
  const replacements = new Map<Material, Map<PhotoSurface, Material>>();
  let activeSize = 0;
  let pending: { size: number; promise: Promise<void> } | undefined;
  const previous = root.onBeforeRender;
  let frames = 0;
  const refresh = () => {
    if (disposed || activeSize === 0) return;
    const resident = new Set<Mesh>();
    root.traverse(object => {
      if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
      if (object.name.startsWith("first-light-sculpted-rock") && object.material instanceof MeshStandardMaterial) {
        weatherSpringCliff(object.material, activeSize > 0 ? textures : undefined, Math.max(0, activeSize));
      }
      const kind = surfaceFor(object);
      if (!kind) return;
      resident.add(object);
      const original = originals.get(object) ?? object.material;
      originals.set(object, original);
      let kinds = replacements.get(original);
      if (!kinds) { kinds = new Map(); replacements.set(original, kinds); }
      let material = kinds.get(kind);
      if (!material) {
        material = activeSize < 0 ? createPhotoFallback(kind, original) : createPhotoMaterial(kind, original, textures, activeSize);
        kinds.set(kind, material);
      }
      object.material = material;
    });
    // Streamed-out tiles must not be retained for the lifetime of the world.
    for (const mesh of originals.keys()) if (!resident.has(mesh)) {
      mesh.material = originals.get(mesh)!;
      originals.delete(mesh);
    }
    cliffs.refresh(activeSize > 0, textures, Math.max(0, activeSize));
  };
  root.onBeforeRender = function (...args) {
    previous.apply(this, args);
    if (++frames % 30 === 0) refresh();
  };
  const clearMaterials = () => {
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
    for (const kinds of replacements.values()) for (const material of kinds.values()) material.dispose();
    replacements.clear();
  };
  return {
    software,
    refresh,
    async setQuality(quality: Quality) {
      if (disposed) return;
      const max = renderer.capabilities.maxTextureSize ?? 16384;
      const selected = software || max < 4096 ? "Low" : quality;
      if (selected === "Low") {
        // Adaptive Low must take effect synchronously, including during an
        // outstanding High decode. Late completions cannot replace this fallback.
        revision++; pending = undefined;
        if (activeSize === -1) return;
        clearMaterials();
        textures.forEach(texture => texture.dispose()); textures = [];
        activeSize = -1;
        refresh();
        return;
      }
      const size = PHOTO_TILE_SIZE[selected];
      if (size === activeSize) { revision++; pending = undefined; return; }
      if (pending?.size === size) return pending.promise;
      const token = ++revision;
      const promise = (async () => {
        const { KTX2Loader } = await import("three/examples/jsm/loaders/KTX2Loader.js");
        if (disposed || token !== revision) return;
        const loader = new KTX2Loader(new LoadingManager());
        let loaded: Texture[] = [];
        try {
          loader.detectSupport(renderer);
          const results = await Promise.allSettled(photoTextureUrls(selected).map(url => loader.loadAsync(url)));
          loaded = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
          const failure = results.find(result => result.status === "rejected");
          if (disposed || token !== revision || failure) {
            loaded.forEach(texture => texture.dispose());
            if (failure && !disposed && token === revision) throw failure.reason;
            return;
          }
          loaded.forEach((texture, index) => {
            texture.colorSpace = index === 0 ? SRGBColorSpace : NoColorSpace;
            texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            texture.needsUpdate = true;
          });
          clearMaterials();
          textures.forEach(texture => texture.dispose());
          textures = loaded;
          activeSize = size;
          refresh();
        } finally { loader.dispose(); }
      })().finally(() => { if (pending?.promise === promise) pending = undefined; });
      pending = { size, promise };
      return promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true; revision++;
      cliffs.dispose();
      root.onBeforeRender = previous;
      clearMaterials();
      textures.forEach(texture => texture.dispose()); textures = [];
    },
  };
}
