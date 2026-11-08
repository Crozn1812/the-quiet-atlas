import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import { createRampMaterial } from "../materials/ramp";
import type { Quality } from "../terrain";
import { createRockGeometry } from "./rocks";
import { createBenchGeometry, createFenceSpanGeometry, createLogGeometry } from "./wood";

export const PROP_ASSETS = {
  "rock-small-1": { triangles: 68, bytes: 3460 },
  "rock-small-2": { triangles: 92, bytes: 3676 },
  "rock-large-1": { triangles: 68, bytes: 3484 },
  "rock-large-2": { triangles: 92, bytes: 3712 },
  "prop-log": { triangles: 292, bytes: 5468 },
  "prop-bench": { triangles: 404, bytes: 9180 },
  "prop-fence": { triangles: 192, bytes: 5864 },
} as const;
export type PropAsset = keyof typeof PROP_ASSETS;
export type PropGeometryLoader = (asset: PropAsset) => Promise<BufferGeometry>;

/** Decoder and network stay deferred until the caller explicitly requests detail. Own the result. */
export async function loadPropGeometry(asset: PropAsset): Promise<BufferGeometry> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(`/world/props/${asset}.glb`);
  let geometry: BufferGeometry | undefined;
  try {
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    scene.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    if (meshes.length !== 1) throw new Error("Expected a single baked prop mesh");
    const mesh = meshes[0]!;
    geometry = mesh.geometry.clone();
    // meshopt stores normalized integers. Expand through getters before transforms
    // or Float32 copies: raw storage values are neither metres nor linear pigments.
    for (const name of ["position", "normal", "color"]) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      const values = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; i++) {
        values.set([attribute.getX(i), attribute.getY(i), attribute.getZ(i)], i * 3);
      }
      geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    const position = geometry.getAttribute("position"), color = geometry.getAttribute("color");
    if (!position || !color || position.count !== color.count
      || (geometry.index?.count ?? position.count) / 3 > (asset.startsWith("rock-small") ? 200 : asset.startsWith("rock") ? 400 : 600)) {
      throw new Error("Invalid baked prop geometry");
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry?.dispose();
    throw error;
  } finally {
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  }
}

function fallback(asset: PropAsset, seed: number) {
  if (asset === "prop-log") return createLogGeometry(seed);
  if (asset === "prop-bench") return createBenchGeometry(seed);
  if (asset === "prop-fence") return createFenceSpanGeometry(seed, { flowers: false });
  return createRockGeometry(asset.startsWith("rock-small") ? "stone" : "boulder", seed, true);
}

/** Add group immediately; call loadDetail after entering play. Failed loads keep the fallback. */
export function createDeferredProp(asset: PropAsset, seed = 201, load: PropGeometryLoader = loadPropGeometry) {
  const group = new Group(), procedural = fallback(asset, seed);
  const material = createRampMaterial(0xffffff, { steps: 4, soft: true });
  material.vertexColors = true;
  const mesh = new Mesh(procedural, material);
  mesh.receiveShadow = true;
  mesh.name = asset;
  group.add(mesh);
  let detail: BufferGeometry | undefined, pending: Promise<boolean> | undefined;
  let disposed = false, quality: Quality = "High";
  function refresh() { mesh.geometry = quality === "Low" ? procedural : detail ?? procedural; }
  const controller = {
    group,
    setQuality(next: Quality) { quality = next; if (!disposed) refresh(); },
    loadDetail(): Promise<boolean> {
      if (disposed || quality === "Low") return Promise.resolve(false);
      if (detail) return Promise.resolve(true);
      if (pending) return pending;
      pending = load(asset).then(geometry => {
        if (disposed) { geometry.dispose(); return false; }
        detail = geometry;
        refresh();
        return true;
      }).catch(() => false).finally(() => { pending = undefined; });
      return pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      procedural.dispose();
      detail?.dispose();
      material.dispose();
    },
  };
  // Match ground batches: network starts only after a visible fallback was drawn.
  mesh.onAfterRender = () => {
    if (disposed || quality === "Low") return;
    mesh.onAfterRender = () => {};
    void controller.loadDetail();
  };
  return controller;
}
