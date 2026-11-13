import {
  Box3, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial,
  Vector3, type Group, type Texture, type WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bindBakedPropQuality } from "./batched";
import type { Quality } from "../terrain";

export type DressingAsset = "rock-boulder-1" | "rock-boulder-3" | "prop-fern" | "prop-bush" | "prop-grass" | "prop-fallen-log";
export interface DressingSite {
  asset: DressingAsset;
  x: number;
  z: number;
  size: readonly [number, number, number];
  yaw: number;
  tint: number;
}
export interface LibrarySource { geometry: BufferGeometry; maps: (Texture | null)[]; dispose(): void }
export type DressingLoader = (renderer: WebGLRenderer, asset: DressingAsset) => Promise<LibrarySource>;

/** Retain photographed UVs, cutout and material pigment in one opaque/cutout draw. */
export function flattenDressing(root: Group, asset: DressingAsset): LibrarySource {
  const parts: BufferGeometry[] = [], textures = new Set<Texture>();
  const maps: (Texture | null)[] = [null, null, null];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const original = object.geometry as BufferGeometry;
    const source = original.index ? original.toNonIndexed() : original.clone();
    const p = source.getAttribute("position"), n = source.getAttribute("normal");
    const uv = source.getAttribute("uv"), color = source.getAttribute("color");
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [], surfaces: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const group = source.groups.find(g => i >= g.start && i < g.start + g.count);
      const m = materials[Array.isArray(object.material) ? group?.materialIndex ?? 0 : 0] as MeshStandardMaterial;
      const pigment = m.color ?? new Color(1, 1, 1);
      const slot = !m.map ? -1 : asset.startsWith("rock") ? 0 : asset === "prop-fern" ? 1 : 2;
      if (slot >= 0) maps[slot] = m.map;
      for (const value of Object.values(m)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n?.getX(i) ?? 0, n?.getY(i) ?? 1, n?.getZ(i) ?? 0);
      colors.push(pigment.r * (color?.getX(i) ?? 1), pigment.g * (color?.getY(i) ?? 1), pigment.b * (color?.getZ(i) ?? 1));
      uvs.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0); surfaces.push(slot);
    }
    const part = new BufferGeometry();
    part.setAttribute("position", new Float32BufferAttribute(positions, 3));
    part.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
    part.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    part.setAttribute("dressingSurface", new Float32BufferAttribute(surfaces, 1));
    part.applyMatrix4(object.matrixWorld); parts.push(part); source.dispose();
  });
  if (!parts.length) throw new Error("Empty dressing asset");
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox();
  const span = geometry.boundingBox!.getSize(new Vector3());
  if (geometry.getAttribute("position").count / 3 > 300 || !span.toArray().every(v => Number.isFinite(v) && v > 0)) {
    geometry.dispose(); throw new Error("Dressing asset exceeds its LOD1 budget");
  }
  return { geometry, maps, dispose() { geometry.dispose(); textures.forEach(texture => texture.dispose()); } };
}

/** Every request uses the existing compact library LOD; no new public assets. */
async function createLoader(renderer: WebGLRenderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/KTX2Loader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  return { async load(asset: DressingAsset) {
    const gltf = await loader.loadAsync(`/world/lib/${asset}-lod1.glb`);
    try { return flattenDressing(gltf.scene, asset); }
    catch (error) {
      const textures = new Set<Texture>();
      gltf.scene.traverse(object => { if (object instanceof Mesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
      } });
      textures.forEach(texture => texture.dispose()); throw error;
    }
    finally { gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    }); }
  }, dispose() { ktx.dispose(); } };
}

export function fitDressing(source: BufferGeometry, site: DressingSite, heightAt: (x: number, z: number) => number) {
  const geometry = source.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, span = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z)
    .scale(site.size[0] / span.x, site.size[1] / span.y, site.size[2] / span.z)
    .rotateY(site.yaw).translate(site.x, -0.025, site.z);
  const p = geometry.getAttribute("position"), c = geometry.getAttribute("color");
  for (let i = 0; i < p.count; i++) {
    p.setY(i, p.getY(i) + heightAt(p.getX(i), p.getZ(i)));
    if (c) c.setXYZ(i, c.getX(i) * site.tint, c.getY(i) * site.tint, c.getZ(i) * site.tint);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createLibraryBatch(fallback: BufferGeometry, sites: readonly DressingSite[], heightAt: (x: number, z: number) => number,
  load?: DressingLoader) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: DoubleSide });
  material.forceSinglePass = true;
  const maps = [0, 1, 2].map(() => ({ value: null as Texture | null }));
  material.onBeforeCompile = shader => {
    maps.forEach((uniform, index) => { shader.uniforms[`dressingMap${index}`] = uniform; });
    shader.vertexShader = "attribute float dressingSurface; varying float vDressingSurface; varying vec2 vDressingUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDressingSurface = dressingSurface; vDressingUv = uv;");
    shader.fragmentShader = "varying float vDressingSurface; varying vec2 vDressingUv; uniform sampler2D dressingMap0; uniform sampler2D dressingMap1; uniform sampler2D dressingMap2;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
if (vDressingSurface > -0.5) {
  vec4 sampleColor;
  if (vDressingSurface < 0.5) sampleColor = texture2D(dressingMap0, vDressingUv);
  else if (vDressingSurface < 1.5) sampleColor = texture2D(dressingMap1, vDressingUv);
  else sampleColor = texture2D(dressingMap2, vDressingUv);
  if (vDressingSurface > 0.5 && vDressingSurface < 1.5 && sampleColor.a < 0.5) discard;
  diffuseColor.rgb *= sampleColor.rgb;
}`);
  };
  material.customProgramCacheKey = () => "gfx-z-library-batch-v1";
  const mesh = new Mesh(fallback, material);
  mesh.name = "first-light-dressing";
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  let quality: Quality = "High", disposed = false, pending = false;
  let detail: BufferGeometry | undefined, decoder: Awaited<ReturnType<typeof createLoader>> | undefined;
  const sources: LibrarySource[] = [];
  const refresh = () => { mesh.geometry = quality === "Low" ? fallback : detail ?? fallback; };
  const unbind = bindBakedPropQuality(mesh, next => { quality = next; refresh(); });
  const eye = new Vector3(), bounds = new Box3();
  // Render hook only: no simulation update, timers, scene traversal or per-prop work.
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    camera.getWorldPosition(eye);
    mesh.geometry.setDrawRange(0, bounds.distanceToPoint(eye) > (quality === "High" ? 65 : 45) ? 0 : Infinity);
  };
  async function loadDetail(renderer: WebGLRenderer) {
    if (disposed || pending || detail || quality === "Low") return;
    pending = true;
    const parts: BufferGeometry[] = [];
    try {
      if (!load) decoder = await createLoader(renderer);
      const unique = new Map<DressingAsset, LibrarySource>();
      // Six compact assets, decoded sequentially to avoid an entry-time worker spike.
      for (const site of sites) {
        if (disposed) return;
        let source = unique.get(site.asset);
        if (!source) {
          source = await (load ? load(renderer, site.asset) : decoder!.load(site.asset));
          if (disposed) { source.dispose(); return; }
          unique.set(site.asset, source); sources.push(source);
          source.maps.forEach((texture, index) => { if (texture) maps[index]!.value = texture; });
        }
        parts.push(fitDressing(source.geometry, site, heightAt));
      }
      if (!parts.length || disposed) return;
      detail = mergeGeometries(parts)!;
      detail.computeBoundingBox(); detail.computeBoundingSphere(); refresh();
    } catch {
      // A missing/undecodable asset leaves the complete cheap dressing in place.
      sources.splice(0).forEach(source => source.dispose());
      maps.forEach(uniform => { uniform.value = null; });
    } finally {
      parts.forEach(part => part.dispose()); decoder?.dispose(); decoder = undefined;
    }
  }
  mesh.onAfterRender = renderer => {
    if (pending || quality === "Low") return;
    // Intro frames do not request assets; first playable paint precedes decoder imports.
    const viewport = renderer?.domElement?.closest("[data-world-build]");
    if (viewport?.getAttribute("data-world-build") === "done" && viewport.getAttribute("data-world-intro") === "done") void loadDetail(renderer);
  };
  return { mesh, loadDetail, dispose() {
    if (disposed) return; disposed = true; unbind();
    mesh.onBeforeRender = () => {}; mesh.onAfterRender = () => {};
    mesh.removeFromParent(); fallback.dispose(); detail?.dispose(); material.dispose();
    sources.splice(0).forEach(source => source.dispose());
  } };
}
