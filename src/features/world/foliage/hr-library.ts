import { Box3, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3, type Material, type Texture, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { HrLandscapeTreeId as HrTreeId } from "./hr-variation";
import { createCoastalTree, type CoastalTreeId } from "./hr-coastal";

export interface HrPart { geometry: BufferGeometry; material: Material; leaf: boolean; vine?: boolean }
export interface HrAsset { parts: HrPart[]; bounds: Box3; center: Vector3; dispose(): void }
interface ManifestTree { id: HrTreeId; bounds?: { min: number[]; max: number[] }; impostor?: { center: number[] } }

/** Keep indexed primitives and their photographed PBR maps, never flatten them. */
export function readHrParts(root: Group): HrPart[] {
  const parts: HrPart[] = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry.clone() as BufferGeometry;
    for (const name of ["position", "normal"]) {
      const a = geometry.getAttribute(name);
      if (!a) continue;
      const values = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { values[i * 3] = a.getX(i); values[i * 3 + 1] = a.getY(i); values[i * 3 + 2] = a.getZ(i); }
      geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
    }
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = object.material as MeshStandardMaterial;
    const vine = material.name === "hr-ivy-bark";
    const copy = material.clone();
    if (vine) copy.color.multiply(new Color("#665c47"));
    parts.push({ geometry, material: copy, leaf: material.alphaTest > 0, vine });
  });
  return parts;
}

/** Hanging stems start on sampled wood vertices rather than an invented crown disk.
 * Authored runtime geometry is project-original CC0; no new public asset. */
export function createHrVines(parts: readonly HrPart[], bounds: Box3): HrPart | undefined {
  const size = bounds.getSize(new Vector3()), candidates: Vector3[] = [];
  for (const part of parts) {
    if (part.leaf || part.vine) continue;
    const p = part.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 900))) {
      const v = new Vector3().fromBufferAttribute(p, i);
      if (v.y > size.y * 0.42 && v.y < size.y * 0.78 && Math.hypot(v.x, v.z) > Math.max(size.x, size.z) * 0.13) candidates.push(v);
    }
  }
  const strands: BufferGeometry[] = [];
  const stemColor = new Color("#443c2e"), leafColor = new Color("#3b4c2e");
  const pigment = (geometry: BufferGeometry, color: Color) => {
    const values = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
    geometry.setAttribute("color", new Float32BufferAttribute(values, 3));
    return geometry;
  };
  for (let i = 0; i < Math.min(9, candidates.length); i++) {
    const a = candidates[Math.floor((i + 0.5) * candidates.length / Math.min(9, candidates.length))]!;
    const length = Math.min(a.y - 1.2, size.y * (0.17 + (i % 4) * 0.045));
    const b = a.clone().add(new Vector3(0.08, -length * 0.5, 0.17));
    const c = a.clone().add(new Vector3(Math.sin(i * 2.1) * 0.4, -length, 0.15));
    const curve = new CatmullRomCurve3([a, b, c]);
    strands.push(pigment(new TubeGeometry(curve, 12, 0.018 + i % 3 * 0.006, 5, false), stemColor));
    for (let j = 1; j < 8; j++) {
      const point = curve.getPoint(j / 8), { x, y, z } = point;
      const angle = i * 2.4 + j * 2.1, dx = Math.cos(angle), dz = Math.sin(angle);
      const tip = point.clone().add(new Vector3(dx * 0.26, -0.09, dz * 0.26));
      const middle = point.clone().lerp(tip, 0.48);
      const left = middle.clone().add(new Vector3(-dz * 0.07, 0.025, dx * 0.07));
      const right = middle.clone().add(new Vector3(dz * 0.07, -0.015, -dx * 0.07));
      const fold = middle.clone().add(new Vector3(0, 0.045, 0));
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute([x, y, z, ...left.toArray(), ...tip.toArray(), ...right.toArray(), ...fold.toArray()], 3));
      g.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]); g.computeVertexNormals();
      // Tube UVs and leaf UVs share the same attribute layout for a single draw.
      g.setAttribute("uv", new Float32BufferAttribute([0, 0.5, 0.5, 1, 1, 0.5, 0.5, 0, 0.5, 0.5], 2));
      strands.push(pigment(g, leafColor.clone().multiplyScalar(0.85 + j % 3 * 0.08)));
    }
  }
  if (!strands.length) return;
  const geometry = mergeGeometries(strands)!; strands.forEach(g => g.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.97, side: DoubleSide }), leaf: true, vine: true };
}

async function createDecoder(renderer: WebGLRenderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/KTX2Loader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  // Three bundles these URLs through import.meta.url; no CDN/public decoder copies.
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const textures = new Map<string, Promise<Texture>>();
  const loadTexture = ktx.load.bind(ktx);
  ktx.load = (url, onLoad, onProgress, onError) => {
    if (!url.includes("/hr-shared-") && !url.includes("/hr-tree-casuarina-shared-")) return loadTexture(url, onLoad, onProgress, onError);
    let pending = textures.get(url);
    if (!pending) {
      pending = new Promise((resolve, reject) => { loadTexture(url, resolve, onProgress, reject); });
      textures.set(url, pending);
    }
    void pending.then(texture => onLoad?.(texture as import("three").CompressedTexture)).catch(error => onError?.(error));
  };
  const loader = new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({
    name: "KHR_materials_diffuse_transmission",
  }));
  const manifest = await fetch("/world/lib/manifest.json").then(r => { if (!r.ok) throw new Error("Tree manifest unavailable"); return r.json() as Promise<{ assets: ManifestTree[] }>; });
  return { loader, manifest, dispose() {
    ktx.dispose();
    for (const pending of textures.values()) void pending.then(t => t.dispose()).catch(() => {});
  } };
}
const renderers = new WeakMap<WebGLRenderer, { refs: number; decoder: ReturnType<typeof createDecoder>; queue: Promise<unknown>; assets: Map<string, { refs: number; ready: Promise<HrAsset> }> }>();

/** A renderer-wide serial queue and reference-counted leases include in-flight
 * requests. Tile teardown cannot free textures still used by its neighbours. */
export function acquireHrTree(renderer: WebGLRenderer, id: HrTreeId, level: number) {
  let pool = renderers.get(renderer);
  if (!pool) { pool = { refs: 0, decoder: createDecoder(renderer), queue: Promise.resolve(), assets: new Map() }; renderers.set(renderer, pool); }
  const shared = pool, key = `${id}:${level}`;
  let entry = shared.assets.get(key);
  if (!entry) {
    const consumers = { refs: 0 };
    const ready = shared.queue.catch(() => {}).then(async () => {
      const decoder = await shared.decoder;
      if (!consumers.refs) throw new Error("Tree tile released before request");
      const coastal = id.startsWith("hr-coast-");
      const meta = decoder.manifest.assets.find(a => a.id === (coastal ? "hr-tree-slender-upright" : id));
      if (!meta) throw new Error(`Missing tree ${id}`);
      const gltf = await decoder.loader.loadAsync(`/world/lib/${meta.id}-${!coastal && level === 2 && meta.impostor ? "impostor" : `lod${Math.min(level, 1)}`}.glb`);
      const parts = readHrParts(gltf.scene), owned = new Set<Texture>();
      const coastAsset = coastal ? createCoastalTree(id as CoastalTreeId, parts.find(p => !p.leaf)!.material as MeshStandardMaterial, level) : undefined;
      const bounds = meta.bounds ? new Box3(new Vector3().fromArray(meta.bounds.min), new Vector3().fromArray(meta.bounds.max))
        : parts.reduce((box, part) => box.union(part.geometry.boundingBox!), new Box3());
      if (!coastal && level < 2 && !id.includes("bamboo") && !id.includes("dead") && !id.includes("palm") && !id.includes("casuarina")) {
        const vines = createHrVines(parts, bounds); if (vines) parts.push(vines);
      }
      gltf.scene.traverse(o => { if (o instanceof Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          // Shared HR textures belong to the decoder; embedded impostors belong here.
          if (level === 2) for (const value of Object.values(m)) if (value && typeof value === "object" && "isTexture" in value) owned.add(value as Texture);
          m.dispose();
        }
      } });
      if (coastAsset) { parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); return coastAsset; }
      return { parts, bounds, center: meta.impostor ? new Vector3().fromArray(meta.impostor.center) : bounds.getCenter(new Vector3()), dispose() {
        parts.forEach(p => { p.geometry.dispose(); p.material.dispose(); }); owned.forEach(t => t.dispose());
      } };
    });
    shared.queue = ready;
    entry = Object.assign(consumers, { ready }); shared.assets.set(key, entry);
  }
  entry.refs++; shared.refs++;
  const acquired = entry;
  let released = false;
  return { ready: acquired.ready, release() {
    if (released) return; released = true;
    if (--acquired.refs === 0) {
      shared.assets.delete(key);
      void acquired.ready.then(asset => asset.dispose()).catch(() => {});
    }
    if (--shared.refs === 0) {
      renderers.delete(renderer);
      void shared.queue.catch(() => {}).then(() => shared.decoder).then(d => d.dispose()).catch(() => {});
    }
  } };
}
