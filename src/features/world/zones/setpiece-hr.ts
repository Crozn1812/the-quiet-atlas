import {
  Box3, BufferAttribute, BufferGeometry, Group, Mesh, Vector3,
  type Material, type Object3D, type Texture, type WebGLRenderer,
} from "three";
import { usesSoftwareRasterizer } from "../foliage/hr-capabilities";
import { bakedPropQuality } from "../props/batched";

/** HR-FIX-SETPIECE: authored hero objects (public/world/lib/hr-prop-setpiece-*.glb).
 * The procedural solids stay the Low/software path and keep every collider, pick and
 * interaction anchor; on hardware Balanced/High the authored model replaces only their render.
 */
export type SetpieceFile = "signpost" | "workshop" | "horizon" | "quiet-shore" | "last-postcard";
export interface SetpieceAsset {
  /** A new group of meshes for one authored piece; geometry and materials stay shared. */
  piece(name: string): Group;
  dispose(): void;
}
export type SetpieceLoader = (renderer: WebGLRenderer, file: SetpieceFile) => Promise<SetpieceAsset>;

interface Pool {
  refs: number;
  decoder: Promise<{ load(url: string): Promise<{ scene: Group }>; dispose(): void }>;
  files: Map<SetpieceFile, { refs: number; ready: Promise<SetpieceAsset> }>;
}
const pools = new WeakMap<WebGLRenderer, Pool>();

async function createDecoder(renderer: WebGLRenderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  return { load: (url: string) => loader.loadAsync(url) as Promise<{ scene: Group }>, dispose: () => ktx.dispose() };
}

function wrap(scene: Group, renderer: WebGLRenderer): SetpieceAsset {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  const anisotropy = Math.min(8, renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
  scene.updateMatrixWorld(true);
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material]) as Material[]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value) {
          const texture = value as Texture;
          if (!textures.has(texture)) { texture.anisotropy = anisotropy; textures.add(texture); }
        }
      }
    }
  });
  let disposed = false;
  return {
    piece(name) {
      const group = new Group(); group.name = `hr-setpiece-${name}`;
      scene.traverse(node => {
        if (!(node instanceof Mesh) || !node.name.startsWith(`${name}-`)) return;
        const mesh = new Mesh(node.geometry, node.material);
        mesh.name = node.name; mesh.applyMatrix4(node.matrixWorld);
        mesh.castShadow = mesh.receiveShadow = true; mesh.raycast = () => {};
        group.add(mesh);
      });
      if (!group.children.length) throw new Error(`Missing set-piece ${name}`);
      return group;
    },
    dispose() {
      if (disposed) return; disposed = true;
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}

/** One decoder per renderer and one decoded file per zone family, shared by every signpost. */
export function acquireSetpiece(renderer: WebGLRenderer, file: SetpieceFile) {
  let pool = pools.get(renderer);
  if (!pool) { pool = { refs: 0, decoder: createDecoder(renderer), files: new Map() }; pools.set(renderer, pool); }
  const shared = pool;
  let entry = shared.files.get(file);
  if (!entry) {
    entry = { refs: 0, ready: shared.decoder.then(d => d.load(`/world/lib/hr-prop-setpiece-${file}.glb`)).then(gltf => wrap(gltf.scene, renderer)) };
    shared.files.set(file, entry);
  }
  entry.refs++; shared.refs++;
  const lease = entry;
  let released = false;
  return { ready: lease.ready, release() {
    if (released) return; released = true;
    if (--lease.refs === 0) {
      if (shared.files.get(file) === lease) shared.files.delete(file);
      void lease.ready.then(asset => asset.dispose()).catch(() => {});
    }
    if (--shared.refs === 0) {
      pools.delete(renderer);
      void shared.decoder.then(decoder => decoder.dispose()).catch(() => {});
    }
  } };
}

/** Copy of a non-indexed batch without the triangles whose centroid lies in any box.
 * No boxes: every triangle belongs to the replaced object, so the copy is empty.
 */
export function retainOutside(source: BufferGeometry, boxes?: readonly Box3[]): BufferGeometry {
  const geometry = new BufferGeometry();
  // Keep the source bounds: the emptied draw must stay in the render list for its hooks.
  if (!source.boundingSphere) source.computeBoundingSphere();
  if (!source.boundingBox) source.computeBoundingBox();
  geometry.boundingSphere = source.boundingSphere!.clone(); geometry.boundingBox = source.boundingBox!.clone();
  if (!boxes) return geometry;
  const flat = source.index ? source.toNonIndexed() : source;
  const position = flat.getAttribute("position"), keep: number[] = [];
  const centroid = new Vector3(), point = new Vector3();
  for (let i = 0; i + 2 < position.count; i += 3) {
    centroid.set(0, 0, 0);
    for (let j = 0; j < 3; j++) centroid.add(point.fromBufferAttribute(position, i + j));
    centroid.divideScalar(3);
    if (!boxes.some(box => box.containsPoint(centroid))) keep.push(i);
  }
  for (const name of Object.keys(flat.attributes)) {
    const attribute = flat.getAttribute(name) as BufferAttribute, size = attribute.itemSize;
    const array = new (attribute.array.constructor as Float32ArrayConstructor)(keep.length * 3 * size);
    keep.forEach((start, slot) => {
      for (let k = 0; k < 3 * size; k++) array[slot * 3 * size + k] = attribute.array[start * size + k]!;
    });
    geometry.setAttribute(name, new BufferAttribute(array, size, attribute.normalized));
  }
  if (flat !== source) flat.dispose();
  return geometry;
}

export interface SetpieceBinding {
  file: SetpieceFile;
  /** Build the placed model once the file is decoded. `add` parents to the anchor's parent by default. */
  place(asset: SetpieceAsset, add: (object: Object3D, parent?: Object3D) => void): void;
  /** Procedural draws that the model replaces; `boxes` (mesh-local) limit the removal to part of a batch. */
  hide?: readonly { mesh: Mesh; boxes?: readonly Box3[] }[];
  /** Called when the authored model is shown or withdrawn (quality change, release). */
  onToggle?(active: boolean): void;
  load?: SetpieceLoader;
}

/** Hooks an existing always-drawn mesh: no extra draw, update-list entry or allocation
 * before the first playable hardware frame. Release restores every swapped geometry.
 */
export function bindSetpieces(anchor: Mesh, binding: SetpieceBinding) {
  const before = anchor.onBeforeRender;
  const placed: Object3D[] = [], swapped = new Map<Mesh, BufferGeometry>(), retained = new Map<BufferGeometry, BufferGeometry>();
  let state: "idle" | "loading" | "ready" | "failed" = "idle", active = false, disposed = false;
  let lease: { release(): void } | undefined, custom: SetpieceAsset | undefined;
  const status = { state: state as string, active };
  anchor.userData.hrSetpiece = status;

  function toggle(next: boolean) {
    active = next; status.active = next;
    for (const object of placed) object.visible = next;
    for (const { mesh, boxes } of binding.hide ?? []) {
      if (next) {
        const full = mesh.geometry;
        let copy = retained.get(full);
        if (!copy) { copy = retainOutside(full, boxes); retained.set(full, copy); }
        swapped.set(mesh, full); mesh.geometry = copy;
      } else {
        const full = swapped.get(mesh);
        if (full) mesh.geometry = full;
        swapped.delete(mesh);
      }
    }
    binding.onToggle?.(next);
  }
  function start(renderer: WebGLRenderer) {
    state = "loading"; status.state = state;
    let ready: Promise<SetpieceAsset>;
    if (binding.load) ready = binding.load(renderer, binding.file).then(asset => { custom = asset; return asset; });
    else { const acquired = acquireSetpiece(renderer, binding.file); lease = acquired; ready = acquired.ready; }
    void ready.then(asset => {
      if (disposed) { custom?.dispose(); return; }
      binding.place(asset, (object, parent) => {
        object.visible = false; (parent ?? anchor.parent ?? anchor).add(object); placed.push(object);
      });
      state = "ready"; status.state = state;
    }).catch(error => {
      state = "failed"; status.state = `failed: ${error instanceof Error ? error.message : String(error)}`;
      placed.splice(0).forEach(object => object.removeFromParent());
    });
  }
  anchor.onBeforeRender = function (renderer, ...args) {
    before.call(this, renderer, ...args);
    if (disposed) return;
    const allowed = bakedPropQuality(anchor) !== "Low" && !!renderer?.domElement && !usesSoftwareRasterizer(renderer);
    if (allowed && state === "idle") {
      const viewport = renderer.domElement.closest?.("[data-world-build]");
      if (viewport?.getAttribute("data-world-build") === "done" && viewport.getAttribute("data-world-intro") === "done"
        && viewport.getAttribute("data-world-paused") === "false") start(renderer);
    }
    const next = allowed && state === "ready";
    if (next !== active) toggle(next);
  };
  return () => {
    if (disposed) return; disposed = true;
    if (active) toggle(false);
    anchor.onBeforeRender = before;
    placed.splice(0).forEach(object => object.removeFromParent());
    retained.forEach(geometry => geometry.dispose()); retained.clear();
    lease?.release(); custom?.dispose();
    delete anchor.userData.hrSetpiece;
  };
}
