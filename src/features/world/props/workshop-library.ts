import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3, type Texture, type WebGLRenderer } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bakedPropQuality } from "./batched";

export type WorkshopAsset = "rock-boulder-1" | "rock-boulder-2" | "rock-boulder-4"
  | "prop-fern" | "prop-bush" | "prop-grass" | "prop-fallen-log";

/** One decoder per workshop, created only after a playable, visible frame.
 * LOD1 keeps the complete dressing under 1,800 triangles on both detail tiers.
 * Geometry retains baked pigment; P2 supplies the shared stone/bark photos.
 */
export function createWorkshopLibrary() {
  let disposed = false;
  let decoder: Promise<{
    loader: import("three/addons/loaders/GLTFLoader.js").GLTFLoader;
    ktx: import("three/addons/loaders/KTX2Loader.js").KTX2Loader;
  }> | undefined;
  const pending = new Map<WorkshopAsset, Promise<BufferGeometry>>();
  async function source(asset: WorkshopAsset, renderer: WebGLRenderer) {
    decoder ??= (async () => {
      const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
      return { ktx, loader: new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder) };
    })();
    const { loader } = await decoder;
    if (disposed) throw new Error("Workshop released before library load");
    const { scene } = await loader.loadAsync(`/world/lib/${asset}-lod1.glb`);
    const parts: BufferGeometry[] = [], textures = new Set<Texture>();
    try {
      scene.updateMatrixWorld(true);
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const original = object.geometry as BufferGeometry;
        const expanded = original.index ? original.toNonIndexed() : original.clone();
        try {
          const p = expanded.getAttribute("position"), c = expanded.getAttribute("color");
          const positions: number[] = [], colors: number[] = [];
          const point = new Vector3();
          for (let i = 0; i < p.count; i++) {
            point.fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld);
            positions.push(point.x, point.y, point.z);
            const group = expanded.groups.find(g => i >= g.start && i < g.start + g.count);
            const pigment = materials[Array.isArray(object.material) ? group?.materialIndex ?? 0 : 0]!.color;
            colors.push(pigment.r * (c?.getX(i) ?? 1), pigment.g * (c?.getY(i) ?? 1), pigment.b * (c?.getZ(i) ?? 1));
          }
          const part = new BufferGeometry();
          part.setAttribute("position", new Float32BufferAttribute(positions, 3));
          part.setAttribute("color", new Float32BufferAttribute(colors, 3));
          parts.push(part);
        } finally { expanded.dispose(); }
      });
      if (disposed || !parts.length) throw new Error("Workshop library unavailable");
      const result = mergeGeometries(parts)!;
      return result;
    } finally {
      parts.forEach(part => part.dispose());
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
          material.dispose();
        }
      });
      textures.forEach(texture => texture.dispose());
    }
  }
  return {
    load(asset: WorkshopAsset, renderer: WebGLRenderer) {
      let ready = pending.get(asset);
      if (!ready) { ready = source(asset, renderer); pending.set(asset, ready); }
      return ready.then(geometry => geometry.clone());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const loads = [...pending.values()];
      for (const ready of pending.values()) void ready.then(g => g.dispose()).catch(() => {});
      pending.clear();
      // Do not terminate the decoder underneath outstanding GLB requests.
      if (decoder) void Promise.allSettled(loads).then(() => decoder!.then(({ ktx }) => ktx.dispose())).catch(() => {});
    },
  };
}

/** Render callbacks only; no new object enters the simulation update list.
 * Zero draw range suppresses submissions beyond the workshop's 70 m envelope.
 */
export function bindWorkshopBatch(mesh: Mesh, render: (renderer: WebGLRenderer) => void) {
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  const eye = new Vector3(), center = new Vector3();
  mesh.onBeforeRender = function (...args) {
    before.apply(this, args);
    args[2].getWorldPosition(eye);
    mesh.getWorldPosition(center);
    mesh.geometry.setDrawRange(0, eye.distanceToSquared(center) > 70 * 70 ? 0 : Infinity);
  };
  mesh.onAfterRender = function (renderer, scene, camera, ...args) {
    const viewport = renderer.domElement.closest("[data-world-build]");
    if (mesh.geometry.drawRange.count === 0 || bakedPropQuality(mesh) === "Low"
      || viewport?.getAttribute("data-world-build") !== "done"
      || viewport.getAttribute("data-world-intro") !== "done"
      || viewport.getAttribute("data-world-paused") !== "false") return;
    render(renderer);
    after.call(this, renderer, scene, camera, ...args);
  };
  return () => {
    mesh.onBeforeRender = before; mesh.onAfterRender = after;
    mesh.geometry.setDrawRange(0, Infinity);
  };
}
