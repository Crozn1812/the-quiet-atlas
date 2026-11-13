import { Box3, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, HemisphereLight, DirectionalLight, InstancedBufferAttribute, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry, RGBADepthPacking, Scene, Sphere, SRGBColorSpace, Vector3, Vector4, WebGLRenderTarget, type InstancedMesh, type Material, type Texture, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Quality } from "../terrain";

export const TREE_LIBRARY_IDS = ["tree-pine-a", "tree-pine-b", "tree-pine-c", "tree-broadleaf-1", "tree-broadleaf-2", "tree-broadleaf-3"] as const;
type TreeId = typeof TREE_LIBRARY_IDS[number];
type TreeSource = { geometry: BufferGeometry; material: MeshStandardMaterial; depth: MeshDepthMaterial; distance: MeshDistanceMaterial };
type TreeAsset = { lods: TreeSource[]; impostor: WebGLRenderTarget; bounds: Box3; dispose(): void };

/** Tile batches switch only when their nearest bound is distant. Hysteresis avoids
 * chatter while walking; Low never requests or draws library assets. */
export function treeLibraryLod(distance: number, quality: Quality, previous = 0): number {
  if (quality === "Low") return -1;
  const near = quality === "High" ? 38 : 24;
  const far = quality === "High" ? 105 : 78;
  if (previous === 2 && distance > far - 10) return 2;
  if (distance > far + (previous === 2 ? 0 : 10)) return 2;
  if (previous >= 1 && distance > near - 5) return 1;
  return distance > near + 5 ? 1 : 0;
}

const playableScenes = new WeakSet<Scene>();
/** Called by the existing active simulation clock, including reduced motion.
 * Rendering the intro or a paused frame alone cannot start network requests. */
export function resumeTreeLibraries(meshes: readonly Mesh[]) {
  for (const mesh of meshes) {
    let parent = mesh.parent;
    while (parent && !(parent instanceof Scene)) parent = parent.parent;
    if (parent instanceof Scene) { playableScenes.add(parent); return; }
  }
}

function installLibraryCutout(material: Material, map: Texture | null) {
  material.onBeforeCompile = shader => {
    shader.uniforms.libraryNeedles = { value: map };
    shader.vertexShader = "attribute float librarySurface; varying float vLibrarySurface; varying vec2 vLibraryUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLibrarySurface = librarySurface; vLibraryUv = uv;");
    shader.fragmentShader = "varying float vLibrarySurface; varying vec2 vLibraryUv; uniform sampler2D libraryNeedles;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", map ? "if (vLibrarySurface > 1.5) { diffuseColor *= texture2D(libraryNeedles, vLibraryUv); }" : "");
  };
  material.customProgramCacheKey = () => `gfx-p3-cutout-v1:${!!map}`;
}

/** Bake material pigment into COLOR_0 and retain the photographed sprig UVs.
 * One surface attribute routes the cutout sample, keeping one draw per variant. */
export function flattenLibraryTree(root: Scene | import("three").Group): TreeSource {
  const parts: BufferGeometry[] = [];
  let map: Texture | null = null;
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const original = object.geometry as BufferGeometry;
    const expanded = original.index ? original.toNonIndexed() : original.clone();
    const p = expanded.getAttribute("position"), n = expanded.getAttribute("normal");
    if (!p || !n) { expanded.dispose(); throw new Error("Invalid library tree"); }
    // Quantized meshopt attributes must be expanded before an affine transform.
    for (const name of ["position", "normal"]) {
      const attr = expanded.getAttribute(name), values: number[] = [];
      for (let i = 0; i < attr.count; i++) values.push(attr.getX(i), attr.getY(i), attr.getZ(i));
      expanded.setAttribute(name, new Float32BufferAttribute(values, 3));
    }
    expanded.applyMatrix4(object.matrixWorld);
    const colors: number[] = [], surfaces: number[] = [], uvs: number[] = [];
    const c = expanded.getAttribute("color"), uv = expanded.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      const group = expanded.groups.find(g => i >= g.start && i < g.start + g.count);
      const material = materials[Array.isArray(object.material) ? group?.materialIndex ?? 0 : 0] as MeshStandardMaterial;
      const leaf = material.alphaTest > 0 || material.color.g * (c?.getY(i) ?? 1) > material.color.r * (c?.getX(i) ?? 1) * 1.15;
      const textured = leaf && !!material.map;
      if (textured) map = material.map;
      const pigment = material.color ?? new Color(1, 1, 1);
      colors.push(pigment.r * (c?.getX(i) ?? 1), pigment.g * (c?.getY(i) ?? 1), pigment.b * (c?.getZ(i) ?? 1));
      surfaces.push(textured ? 2 : leaf ? 1 : 0);
      uvs.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
    }
    const part = new BufferGeometry();
    part.setAttribute("position", expanded.getAttribute("position").clone());
    part.setAttribute("normal", expanded.getAttribute("normal").clone());
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
    part.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    part.setAttribute("librarySurface", new Float32BufferAttribute(surfaces, 1));
    parts.push(part); expanded.dispose();
  });
  if (!parts.length) throw new Error("Empty library tree");
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const span = geometry.boundingBox!.getSize(new Vector3());
  if (geometry.getAttribute("position").count / 3 > 1500 || ![span.x, span.y, span.z].every(v => Number.isFinite(v) && v > 0)) {
    geometry.dispose(); throw new Error("Library tree is malformed or over budget");
  }
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide, alphaTest: 0.45 });
  material.forceSinglePass = true;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, alphaTest: 0.45, side: DoubleSide });
  const distance = new MeshDistanceMaterial({ alphaTest: 0.45, side: DoubleSide });
  for (const m of [material, depth, distance]) installLibraryCutout(m, map);
  const cutout = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    cutout(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
// Thin leaves transmit the graded sun; wood keeps the regular rough PBR response.
if (vLibrarySurface > 0.5) {
  #if NUM_DIR_LIGHTS > 0
    float backLight = max(0.0, -dot(normalize(vNormal), directionalLights[0].direction));
    outgoingLight += diffuseColor.rgb * directionalLights[0].color * backLight * 0.18;
  #endif
  outgoingLight = max(outgoingLight, diffuseColor.rgb * 0.38);
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `gfx-p3-leaves-v1:${!!map}`;
  return { geometry, material, depth, distance };
}

/** Four azimuth views, baked once after play. No render target is allocated on Low. */
function bakeImpostor(source: TreeSource, renderer: WebGLRenderer): WebGLRenderTarget {
  const bounds = source.geometry.boundingBox!, size = bounds.getSize(new Vector3());
  const radius = Math.max(size.x, size.z) * 0.72;
  const center = bounds.getCenter(new Vector3());
  const scene = new Scene(), model = new Mesh(source.geometry, source.material);
  scene.add(model, new HemisphereLight(0xd1dfcf, 0x475e42, 2.5));
  const sun = new DirectionalLight(0xffedc8, 2.5); sun.position.set(-3, 6, 4); scene.add(sun);
  const camera = new OrthographicCamera(-radius, radius, size.y * 0.52, -size.y * 0.52, 0.1, size.y * 8);
  const target = new WebGLRenderTarget(1024, 256, { depthBuffer: true });
  target.texture.colorSpace = SRGBColorSpace;
  const previous = renderer.getRenderTarget(), clear = renderer.getClearColor(new Color()), alpha = renderer.getClearAlpha();
  const viewport = renderer.getViewport(new Vector4()), scissor = renderer.getScissor(new Vector4());
  const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
  const toneMapping = renderer.toneMapping;
  try {
    renderer.toneMapping = NoToneMapping; // the final world draw owns tone mapping
    renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.setScissorTest(false); renderer.clear();
    renderer.autoClear = false; renderer.setScissorTest(true);
    for (let view = 0; view < 4; view++) {
      const angle = view * Math.PI / 2;
      camera.position.copy(center).add(new Vector3(Math.sin(angle) * size.y * 3, size.y * 0.08, Math.cos(angle) * size.y * 3));
      camera.lookAt(center); camera.updateMatrixWorld();
      renderer.setViewport(view * 256, 0, 256, 256); renderer.setScissor(view * 256, 0, 256, 256);
      renderer.render(scene, camera);
    }
  } catch (error) { target.dispose(); throw error; }
  finally {
    renderer.setRenderTarget(previous); renderer.setViewport(viewport); renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest); renderer.setClearColor(clear, alpha); renderer.autoClear = autoClear;
    renderer.toneMapping = toneMapping;
  }
  return target;
}

const caches = new WeakMap<WebGLRenderer, Map<TreeId, { refs: number; ready: Promise<TreeAsset> }>>();
async function createLibraryDecoder(renderer: WebGLRenderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/KTX2Loader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  return { ktx, loader: new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder) };
}
const decoders = new WeakMap<WebGLRenderer, { refs: number; ready: ReturnType<typeof createLibraryDecoder> }>();
function acquireTree(renderer: WebGLRenderer, id: TreeId) {
  let cache = caches.get(renderer);
  if (!cache) { cache = new Map(); caches.set(renderer, cache); }
  let entry = cache.get(id);
  if (!entry) {
    const consumers = { refs: 0 };
    let decoder = decoders.get(renderer);
    if (!decoder) { decoder = { refs: 0, ready: createLibraryDecoder(renderer) }; decoders.set(renderer, decoder); }
    decoder.refs++;
    const shared = decoder;
    const ready = (async () => {
      const { loader } = await shared.ready;
      const lods: TreeSource[] = [], textures = new Set<Texture>();
      try {
        // Sequential: do not create twelve decoder workers during world entry.
        for (const level of [0, 1]) {
          if (!consumers.refs) throw new Error("Library tree released during load");
          const gltf = await loader.loadAsync(`/world/lib/${id}-lod${level}.glb`);
          try { lods.push(flattenLibraryTree(gltf.scene)); }
          finally {
            gltf.scene.traverse(o => { if (o instanceof Mesh) {
              o.geometry.dispose();
              for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                for (const value of Object.values(m)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
                m.dispose();
              }
            } });
          }
        }
        if (!consumers.refs) throw new Error("Library tree released before bake");
        const impostor = bakeImpostor(lods[0]!, renderer);
        return { lods, impostor, bounds: lods[0]!.geometry.boundingBox!.clone(), dispose() {
          for (const source of lods) { source.geometry.dispose(); source.material.dispose(); source.depth.dispose(); source.distance.dispose(); }
          for (const texture of textures) texture.dispose(); impostor.dispose();
        } };
      } catch (error) {
        for (const source of lods) { source.geometry.dispose(); source.material.dispose(); source.depth.dispose(); source.distance.dispose(); }
        for (const texture of textures) texture.dispose(); throw error;
      }
    })();
    entry = Object.assign(consumers, { ready }); cache.set(id, entry);
    // Decoder lifetime includes outstanding requests, even if every tile leaves
    // before a fetch completes. All variants share this one worker pool.
    const releaseDecoder = () => {
      if (--shared.refs === 0) {
        decoders.delete(renderer);
        void shared.ready.then(({ ktx }) => ktx.dispose()).catch(() => {});
      }
    };
    // Each entry releases its decoder only after both its asset and last lease.
    const originalReady = ready;
    entry.ready = originalReady.then(asset => ({ ...asset, dispose() { asset.dispose(); releaseDecoder(); } }), error => { releaseDecoder(); throw error; });
  }
  entry.refs++;
  const acquired = entry;
  let released = false;
  return { ready: acquired.ready, release() {
    if (released) return; released = true;
    if (--acquired.refs === 0) {
      cache!.delete(id);
      void acquired.ready.then(asset => asset.dispose()).catch(() => {});
    }
  } };
}

/** Fit the approved canopy envelope, without moving its rooted instance matrix. */
export function fitLibraryGeometry(source: BufferGeometry, bounds: Box3): BufferGeometry {
  const geometry = source.clone();
  geometry.computeBoundingBox();
  const old = geometry.boundingBox!, size = old.getSize(new Vector3()), target = bounds.getSize(new Vector3());
  if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) {
    geometry.dispose(); throw new Error("Invalid library tree bounds");
  }
  geometry.translate(-old.min.x, -old.min.y, -old.min.z);
  geometry.scale(target.x / size.x, target.y / size.y, target.z / size.z);
  geometry.translate(bounds.min.x, bounds.min.y, bounds.min.z);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function impostorGeometry(bounds: Box3) {
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  const geometry = new PlaneGeometry(Math.max(size.x, size.z) * 1.44, size.y * 1.04);
  geometry.translate(center.x, center.y, center.z);
  geometry.boundingBox = bounds.clone().expandByScalar(Math.max(size.x, size.z) * 0.3);
  geometry.boundingBox.getBoundingSphere(geometry.boundingSphere ??= new Sphere());
  return geometry;
}

/** Existing factories own fallback geometry/material. This binding owns only its
 * deferred replacements and restores the fallback before the factory tears down. */
export function bindLibraryTree(mesh: InstancedMesh, id: TreeId) {
  const fallback = mesh.geometry, originalMaterial = mesh.material;
  const oldDepth = mesh.customDepthMaterial, oldDistance = mesh.customDistanceMaterial, castShadow = mesh.castShadow;
  fallback.computeBoundingBox();
  const envelope = fallback.boundingBox!.clone();
  const after = mesh.onAfterRender;
  let quality: Quality = "High", disposed = false, requested = false, timer: ReturnType<typeof setTimeout> | undefined;
  let lease: ReturnType<typeof acquireTree> | undefined;
  let geometries: BufferGeometry[] = [], materials: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  let level = -1;
  let asset: TreeAsset | undefined;
  const worldBounds = new Box3(), eye = new Vector3();
  function apply(next: number) {
    if (!geometries.length || next < 0) {
      mesh.geometry = fallback; mesh.material = originalMaterial; level = -1;
      mesh.customDepthMaterial = oldDepth; mesh.customDistanceMaterial = oldDistance; mesh.castShadow = castShadow; return;
    }
    const alpha = fallback.getAttribute("crownAlpha");
    if (alpha) geometries[next]!.setAttribute("crownAlpha", alpha);
    mesh.geometry = geometries[next]!; mesh.material = materials[next]!; level = next;
    mesh.customDepthMaterial = asset?.lods[Math.min(next, 1)]?.depth;
    mesh.customDistanceMaterial = asset?.lods[Math.min(next, 1)]?.distance;
    mesh.castShadow = castShadow && next !== 2;
  }
  mesh.onAfterRender = function (renderer, scene, camera, ...args) {
    after.call(this, renderer, scene, camera, ...args);
    if (disposed || quality === "Low" || mesh.count === 0 || !playableScenes.has(scene)) return;
    if (!requested && typeof window !== "undefined") {
      requested = true;
      // A complete rendered frame precedes decoder import, fetch and the bake.
      timer = setTimeout(() => {
        if (disposed || quality === "Low") { requested = false; return; }
        lease = acquireTree(renderer, id);
        void lease.ready.then(loaded => {
          if (disposed) return;
          asset = loaded;
          for (const source of asset.lods) geometries.push(fitLibraryGeometry(source.geometry, envelope));
          geometries.push(impostorGeometry(envelope));
          for (const source of asset.lods) {
            const material = source.material.clone();
            material.onBeforeCompile = source.material.onBeforeCompile;
            material.customProgramCacheKey = source.material.customProgramCacheKey;
            materials.push(material);
          }
          const sprite = new MeshBasicMaterial({ map: asset.impostor.texture, alphaTest: 0.45, side: DoubleSide });
          const center = envelope.getCenter(new Vector3());
          sprite.onBeforeCompile = shader => {
            shader.uniforms.libraryCenter = { value: center };
            shader.vertexShader = "uniform vec3 libraryCenter; varying float vLibraryView;\n" + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vec3 localEye = (inverse(modelMatrix * instanceMatrix) * vec4(cameraPosition, 1.0)).xyz - libraryCenter;
float yaw = atan(localEye.x, localEye.z);
vLibraryView = mod(floor(yaw / 1.57079632679 + 0.5) + 4.0, 4.0);
vec3 offset = transformed - libraryCenter;
transformed = libraryCenter + vec3(cos(yaw) * offset.x, offset.y, -sin(yaw) * offset.x);`);
            shader.fragmentShader = "varying float vLibraryView;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "diffuseColor *= texture2D(map, vec2((clamp(vMapUv.x, 0.002, 0.998) + vLibraryView) * 0.25, vMapUv.y));");
          };
          sprite.customProgramCacheKey = () => "gfx-p3-four-view-impostor-v1";
          materials.push(sprite);
          // Reuse the existing camera fade attribute, including after Low compaction.
          for (const material of materials) {
            if (!(fallback.getAttribute("crownAlpha") instanceof InstancedBufferAttribute)) continue;
            const compile = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
            material.alphaHash = true;
            material.onBeforeCompile = (shader, r) => {
              compile(shader, r);
              shader.vertexShader = "attribute float crownAlpha; varying float vLibraryFade;\n" + shader.vertexShader;
              shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLibraryFade = crownAlpha;");
              shader.fragmentShader = "varying float vLibraryFade;\n" + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace("#include <alphahash_fragment>", "diffuseColor.a *= vLibraryFade;\n#include <alphahash_fragment>");
            };
            material.customProgramCacheKey = () => key() + "|library-fade";
          }
          apply(quality === "Low" ? -1 : 0);
          mesh.userData.treeLibrary = id;
        }).catch(() => {
          if (disposed) return;
          apply(-1);
          geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
          geometries = []; materials = []; asset = undefined;
          lease?.release(); lease = undefined; mesh.userData.treeLibraryError = true;
        });
      }, 0);
    }
    if (geometries.length) {
      eye.setFromMatrixPosition(camera.matrixWorld);
      const distance = mesh.boundingBox ? worldBounds.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld).distanceToPoint(eye) : 0;
      const next = treeLibraryLod(distance, quality, level);
      if (next !== level) apply(next);
      mesh.userData.treeLibraryLod = level;
    }
  };
  return {
    setQuality(next: Quality) { quality = next; apply(next === "Low" ? -1 : 0); },
    dispose() {
      if (disposed) return; disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      mesh.onAfterRender = after; mesh.geometry = fallback; mesh.material = originalMaterial;
      mesh.customDepthMaterial = oldDepth; mesh.customDistanceMaterial = oldDistance; mesh.castShadow = castShadow;
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      geometries = []; materials = []; lease?.release();
      delete mesh.userData.treeLibrary; delete mesh.userData.treeLibraryLod;
      delete mesh.userData.treeLibraryError;
    },
  };
}
