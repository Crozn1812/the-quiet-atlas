import {
  BufferGeometry, Camera, Float32BufferAttribute, Material, MeshStandardMaterial,
  NoColorSpace, SkinnedMesh, Texture, Vector3, type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { HR_CHARACTER_URLS, loadHrCharacterSkin } from "./hr-appearance";

export type AppearanceQuality = "Low" | "Balanced" | "High";
export type BakedSurface = "linen" | "shorts" | "skin" | "hair" | "glass" | "paint" | "metal" | "rubber" | "leather";
export const BAKED_SURFACES: readonly BakedSurface[] = ["linen", "shorts", "skin", "hair", "glass", "paint", "metal", "rubber", "leather"];

/** Inset atlas cells: no repeat wrapping or texture bleed across material classes. */
export function bakedUV(surface: BakedSurface, u: number, v: number): [number, number] {
  const slot = BAKED_SURFACES.indexOf(surface);
  // glTF also flips Blender's bottom-origin UVs on export. Match it here.
  return [(slot % 3 + .06 + .88 * u) / 3, 1 - (Math.floor(slot / 3) + .06 + .88 * v) / 3];
}

export function vehicleSurface(name: string, metal: boolean): BakedSurface {
  if (/^tote/.test(name)) return "linen";
  if (/^(long_seat|seat)$/.test(name)) return "leather";
  if (/lens|mirror_face|round_headlamp/.test(name)) return "glass";
  if (/wheel|tire|grip|boot|lining|strap|chain|frame|swingarm|recess|outlet|footpeg|cylinder/.test(name)) return "rubber";
  return metal ? "metal" : "paint";
}

export interface BakedResources {
  material: MeshStandardMaterial;
  /** HR-CHAR: one material per geometry group (photoreal close-up skin). */
  materials?: Material[];
  /** Every texture to upload before first use; defaults to the atlas pair. */
  textures?: Texture[];
  geometry?: BufferGeometry;
  dispose(): void;
}

type Atlas = { textures: Texture[]; release(): void };
const atlases = new WeakMap<WebGLRenderer, Map<number, { promise: Promise<Texture[]>; references: number }>>();

/** Both skins reuse the same decoded textures and GPU allocations. */
async function acquireAtlas(renderer: WebGLRenderer, size: number): Promise<Atlas> {
  let cache = atlases.get(renderer);
  if (!cache) { cache = new Map(); atlases.set(renderer, cache); }
  let entry = cache.get(size);
  if (!entry) {
    entry = { references: 0, promise: loadAtlas(renderer, size) };
    cache.set(size, entry);
  }
  entry.references++;
  const current = entry;
  const release = () => {
    if (--current.references !== 0) return;
    if (cache.get(size) === current) cache.delete(size);
    void current.promise.then(textures => textures.forEach(texture => texture.dispose()), () => {});
  };
  try { return { textures: await current.promise, release }; }
  catch (error) { release(); throw error; }
}

async function loadAtlas(renderer: WebGLRenderer, size: number): Promise<Texture[]> {
  const { KTX2Loader } = await import("three/examples/jsm/loaders/KTX2Loader.js");
  const loader = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const base = "/world/character/";
  let textures: Texture[] = [];
  try {
    // allSettled lets a partial failure release every successful allocation.
    const results = await Promise.allSettled([
      loader.loadAsync(`${base}normal-${size}.ktx2`),
      loader.loadAsync(`${base}orm-${size}.ktx2`),
    ]);
    textures = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
    for (const texture of textures) {
      texture.colorSpace = NoColorSpace;
      texture.flipY = false;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    }
    return textures;
  } catch (error) {
    textures.forEach(texture => texture.dispose());
    throw error;
  } finally { loader.dispose(); }
}

export async function loadBakedResources(renderer: WebGLRenderer, quality: AppearanceQuality, character: boolean): Promise<BakedResources> {
  if (character) {
    // HR-CHAR (ADR 0019): photoreal skin on the same skeleton; High = LOD0, Balanced = LOD1.
    const skin = await loadHrCharacterSkin(renderer, HR_CHARACTER_URLS[quality === "High" ? "High" : "Balanced"]);
    skin.geometry.userData.bones = skin.bones;
    return { material: skin.materials[0] as MeshStandardMaterial, materials: skin.materials, textures: skin.textures, geometry: skin.geometry, dispose: skin.dispose };
  }
  const atlas = await acquireAtlas(renderer, quality === "High" ? 1024 : 512);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  let geometry: BufferGeometry | undefined;
  try {
    material.normalMap = atlas.textures[0]!;
    material.roughnessMap = material.metalnessMap = atlas.textures[1]!;
    material.normalScale.setScalar(.22);
    material.envMapIntensity = .55;
    if (character) {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/world/character/character-duy-c.glb");
      const skins: SkinnedMesh[] = [];
      gltf.scene.traverse(node => { if (node instanceof SkinnedMesh) skins.push(node); });
      try {
        if (skins.length !== 1 || skins[0]!.skeleton.bones.length !== 19) throw new Error("Invalid D-23 closeup skin");
        // Clone so the temporary asset can release its own skeleton/materials.
        geometry = skins[0]!.geometry.clone();
        geometry.userData.bones = skins[0]!.skeleton.bones.map(bone => bone.name);
      } finally {
        const { disposeCharacterTree } = await import("./runtime");
        disposeCharacterTree(gltf.scene);
      }
    }
    let disposed = false;
    return { material, geometry, dispose() {
      if (disposed) return;
      disposed = true;
      geometry?.dispose(); material.dispose(); atlas.release();
    } };
  } catch (error) {
    geometry?.dispose(); material.dispose(); atlas.release();
    throw error;
  }
}

type ResourceLoader = typeof loadBakedResources;
const appearances = new WeakMap<SkinnedMesh, ReturnType<typeof installBakedAppearance>>();

/** First visible render schedules the bake assets after the playable frame.
 * The DOM attribute is the existing manual/adaptive-quality contract. An
 * optional explicit setter also supports isolated viewers and Lead integration.
 */
export function installBakedAppearance(mesh: SkinnedMesh, character: boolean, load: ResourceLoader = loadBakedResources) {
  appearances.get(mesh)?.dispose();
  const originalGeometry = mesh.geometry;
  const originalMaterial = mesh.material;
  const originalAfter = mesh.onAfterRender;
  // Low, distant, software and build-pending frames keep main's original
  // material: no extra shader program compiles mid-game, no unlit look on Low.
  const fallbackMaterial = originalMaterial;
  const bundles = new Map<AppearanceQuality, BakedResources>();
  const pending = new Set<AppearanceQuality>();
  const failed = new Set<AppearanceQuality>();
  let disposed = false;
  let explicitQuality: AppearanceQuality | undefined;
  let currentQuality: AppearanceQuality = "Low";
  let software: boolean | undefined;
  let transitioning = () => false;
  const scheduled = new Map<AppearanceQuality, ReturnType<typeof setTimeout>>();
  const uploaded = new WeakSet<Texture>();
  const origin = new Vector3(), view = new Vector3();
  function restore() { mesh.geometry = originalGeometry; mesh.material = originalMaterial; }
  function applyFallback() { mesh.geometry = originalGeometry; mesh.material = fallbackMaterial; }
  function apply(renderer: WebGLRenderer, camera: Camera) {
    if (software === undefined) {
      // Same renderer detection as materials/cc0.ts, including manually pinned High.
      const gl = renderer.getContext?.();
      const debug = gl?.getExtension("WEBGL_debug_renderer_info");
      const device = gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
      software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(device));
    }
    const container = renderer.domElement?.closest?.("[data-world-quality]");
    const attribute = container?.getAttribute("data-world-quality");
    const requested = explicitQuality ?? (attribute === "high" ? "High" : attribute === "balanced" ? "Balanced" : "Low");
    const quality = software || (renderer.capabilities?.maxTextureSize ?? 16384) < 4096 ? "Low" : requested;
    currentQuality = quality;
    const cancelScheduled = () => {
      for (const timer of scheduled.values()) clearTimeout(timer);
      for (const tier of scheduled.keys()) pending.delete(tier);
      scheduled.clear();
    };
    // Avoid world-matrix updates entirely on the software/Low path.
    if (disposed || quality === "Low") {
      applyFallback();
      cancelScheduled();
      return;
    }
    // A resolved bundle stays CPU-side while the rider transitions. Keeping the
    // current geometry/material also prevents first GPU upload on the next draw.
    if (transitioning()) { cancelScheduled(); return; }
    mesh.getWorldPosition(origin); camera.getWorldPosition(view);
    const near = origin.distanceToSquared(view) < (quality === "High" ? 24 ** 2 : 14 ** 2);
    const bundle = bundles.get(quality);
    if (!near || container?.getAttribute("data-world-build") === "pending") {
      applyFallback(); cancelScheduled();
      return;
    }
    if (bundle) {
      // Upload now, while the guard is false. A mount can start between this
      // after-draw callback and the next draw that first uses the material.
      for (const texture of bundle.textures ?? [bundle.material.normalMap, bundle.material.roughnessMap]) {
        if (texture && !uploaded.has(texture)) {
          renderer.initTexture(texture);
          uploaded.add(texture);
        }
      }
      mesh.geometry = bundle.geometry ?? originalGeometry;
      mesh.material = bundle.materials ?? bundle.material;
      return;
    }
    applyFallback();
    if (pending.has(quality) || failed.has(quality)) return;
    pending.add(quality);
    scheduled.set(quality, setTimeout(() => {
      scheduled.delete(quality);
      if (disposed || currentQuality !== quality || transitioning()) { pending.delete(quality); return; }
      void load(renderer, quality, character).then(resource => {
        pending.delete(quality);
        if (disposed) { resource.dispose(); return; }
        if (character && resource.geometry) {
          const names: unknown = resource.geometry.userData.bones;
          const actual = mesh.skeleton.bones.map(bone => bone.name);
          if (!Array.isArray(names) || names.length !== actual.length || names.some((name, index) => name !== actual[index])) {
            resource.dispose(); failed.add(quality); return;
          }
        }
        bundles.set(quality, resource);
      }).catch(() => { pending.delete(quality); failed.add(quality); });
    }, 0));
  }
  const controller = {
    setTransitionGuard(guard: () => boolean) { transitioning = guard; },
    setQuality(quality: AppearanceQuality) {
      if (disposed) return;
      currentQuality = explicitQuality = quality;
      if (quality === "Low") applyFallback();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const timer of scheduled.values()) clearTimeout(timer);
      scheduled.clear(); pending.clear();
      mesh.onAfterRender = originalAfter;
      restore(); bundles.forEach(bundle => bundle.dispose()); bundles.clear();
      appearances.delete(mesh);
    },
  };
  // WebGLRenderer captures geometry/material before onBeforeRender. Swap only
  // after the draw so both resources agree on the following frame.
  mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
    originalAfter.call(this, renderer, scene, camera, geometry, material, group);
    apply(renderer, camera);
  };
  appearances.set(mesh, controller);
  return controller;
}

export function disposeBakedAppearance(mesh: SkinnedMesh): void { appearances.get(mesh)?.dispose(); }

/** Give a test/viewer an explicit quality without changing gameplay state. */
export function setBakedAppearanceQuality(mesh: SkinnedMesh, quality: AppearanceQuality): void {
  appearances.get(mesh)?.setQuality(quality);
}

/** Presentation-only guard, supplied by the existing rider pose. */
export function setBakedAppearanceTransitionGuard(mesh: SkinnedMesh, guard: () => boolean): void {
  appearances.get(mesh)?.setTransitionGuard(guard);
}

/** Authoring helper used by vehicle mesh batching; preserves one material/draw. */
export function assignBakedUVs(geometry: BufferGeometry, surfaces: readonly BakedSurface[]): void {
  const position = geometry.getAttribute("position");
  const values = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    // Continuous projection for each triangle, kept inside a padded atlas cell.
    const u = Math.max(.01, Math.min(.99, position.getX(i) * .65 + .5));
    const v = Math.max(.01, Math.min(.99, (position.getY(i) + position.getZ(i) * .25) * .5 + .15));
    values.set(bakedUV(surfaces[i]!, u, v), i * 2);
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(values, 2));
}
