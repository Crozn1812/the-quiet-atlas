import {
  Box3, BufferGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Vector3, type Material, type Texture, type WebGLRenderer,
} from "three";
import { bindBakedPropQuality } from "./batched";
import { createLibraryBatch, type DressingLoader, type DressingSite } from "./library-batch";
import type { Quality } from "../terrain";

export const HR_PROP_FAMILIES = {
  bush: ["hr-prop-bush-broadleaf", "hr-prop-bush-needle", "hr-prop-bush-wildflower", "hr-prop-bush-bamboo"],
  fern: ["hr-prop-fern-arching", "hr-prop-fern-sword", "hr-prop-fern-round"],
  rock: ["hr-rock-boulder", "hr-rock-river", "hr-rock-slate", "hr-rock-moss-boulder", "hr-rock-moss-river", "hr-rock-moss-slate"],
  log: ["hr-prop-log-fungi", "hr-prop-log-moss"],
  palm: ["hr-palm-coconut", "hr-palm-leaning", "hr-palm-shore"],
  hill: ["hr-tree-spreading-crown", "hr-tree-umbrella-crown", "hr-tree-slender-upright", "hr-tree-leaning-riverside"],
  grass: ["hr-prop-grass-meadow"],
} as const;
export type HrPropId = typeof HR_PROP_FAMILIES[keyof typeof HR_PROP_FAMILIES][number];
export interface HrPropSite extends Omit<DressingSite, "asset"> { asset: HrPropId }
export function selectHrProp(asset: string, x: number, z: number): HrPropId {
  const family = asset.startsWith("rock") ? HR_PROP_FAMILIES.rock : asset.includes("fern") ? HR_PROP_FAMILIES.fern
    : asset.includes("bush") ? HR_PROP_FAMILIES.bush : asset.includes("log") ? HR_PROP_FAMILIES.log : HR_PROP_FAMILIES.grass;
  let seed = (Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return family[((seed ^ (seed >>> 16)) >>> 0) % family.length]!;
}
export function hrPropLod(distance: number, previous = 0) {
  return distance > (previous === 0 ? 26 : 21) ? 1 : 0;
}

export interface HrPropPart { geometry: BufferGeometry; material: Material; matrix: Matrix4 }
export interface HrPropAsset { lods: HrPropPart[][]; bounds: Box3; dispose(): void }
export type HrPropLoader = (renderer: WebGLRenderer, id: HrPropId) => Promise<HrPropAsset>;

/** Per-renderer leases share geometry across zones. Final release also owns late arrivals. */
const caches = new WeakMap<WebGLRenderer, Map<HrPropId, { refs: number; ready: Promise<HrPropAsset> }>>();
async function loadAsset(renderer: WebGLRenderer, id: HrPropId): Promise<HrPropAsset> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  const lods: HrPropPart[][] = [], textures = new Set<Texture>(), geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  const release = () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); };
  const bounds = new Box3();
  try {
    for (const level of [0, 1]) {
      const { scene } = await loader.loadAsync(`/world/lib/${id}-lod${level}.glb`);
      scene.updateMatrixWorld(true);
      const parts: HrPropPart[] = [];
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
        }
        if (Array.isArray(object.material)) throw new Error("HR props require separate PBR primitives");
        object.geometry.computeBoundingBox();
        // Both LODs must fit inside the clearance envelope, including wider far blades.
        bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
        parts.push({ geometry: object.geometry, material: object.material, matrix: object.matrixWorld.clone() });
      });
      if (!parts.length) throw new Error(`Empty HR prop ${id}`);
      lods.push(parts);
    }
    const size = bounds.getSize(new Vector3());
    if (!size.toArray().every(v => Number.isFinite(v) && v > 0)) throw new Error(`Malformed HR prop ${id}`);
    return { lods, bounds, dispose: release };
  } catch (error) { release(); throw error; }
  finally { ktx.dispose(); }
}
function acquire(renderer: WebGLRenderer, id: HrPropId) {
  let cache = caches.get(renderer);
  if (!cache) { cache = new Map(); caches.set(renderer, cache); }
  let entry = cache.get(id);
  if (!entry) { entry = { refs: 0, ready: loadAsset(renderer, id) }; cache.set(id, entry); }
  entry.refs++;
  let released = false;
  const lease = entry;
  return { ready: lease.ready, release() {
    if (released) return; released = true;
    if (--lease.refs === 0) {
      if (cache!.get(id) === lease) cache!.delete(id);
      void lease.ready.then(asset => asset.dispose()).catch(() => {});
    }
  } };
}

/** Fit at the root, preserving smooth normals and rigid trunks on slopes. */
export function fitHrProp(bounds: Box3, site: HrPropSite, heightAt: (x: number, z: number) => number) {
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  return new Matrix4().makeTranslation(site.x, heightAt(site.x, site.z) - .025, site.z)
    .multiply(new Matrix4().makeRotationY(site.yaw))
    .multiply(new Matrix4().makeScale(site.size[0] / size.x, site.size[1] / size.y, site.size[2] / size.z))
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
}

/** Replace only the dressing envelope; colliders and interaction anchors are untouched.
 * Real PBR primitives survive loading. Each asset/LOD/primitive is one instanced draw.
 */
export function bindHrProps(mesh: Mesh, sites: readonly HrPropSite[], heightAt: (x: number, z: number) => number,
  retained?: BufferGeometry, load?: HrPropLoader) {
  const fallback = mesh.geometry, empty = retained ?? new BufferGeometry();
  if (!fallback.boundingBox) fallback.computeBoundingBox();
  const group = new Group(); group.name = "hr-props-streamed"; group.visible = false;
  const before = mesh.onBeforeRender, after = mesh.onAfterRender, originalCull = mesh.frustumCulled;
  // A retained workshop surface may have a smaller bound than its dressing.
  mesh.frustumCulled = false;
  let quality: Quality = "High", disposed = false, pending: Promise<boolean> | undefined, ready = false, nearby = true;
  const batches: { meshes: InstancedMesh[][]; center: Vector3; level: number }[] = [];
  const leases: { release(): void }[] = [], customAssets: HrPropAsset[] = [];
  const refresh = () => { mesh.geometry = quality === "Low" || !ready ? fallback : empty; group.visible = ready && quality !== "Low" && nearby; };
  const unbind = bindBakedPropQuality(mesh, next => { quality = next; refresh(); });
  const eye = new Vector3();
  mesh.onBeforeRender = function (...args) {
    before.apply(this, args);
    args[2].getWorldPosition(eye); mesh.worldToLocal(eye);
    nearby = (fallback.boundingBox?.distanceToPoint(eye) ?? Infinity) < (quality === "High" ? 65 : 45);
    mesh.geometry.setDrawRange(0, nearby ? Infinity : 0); refresh();
    for (const batch of batches) {
      const distance = eye.distanceTo(batch.center); batch.level = hrPropLod(distance, batch.level);
      batch.meshes.forEach((lod, level) => lod.forEach(part => {
        part.visible = quality !== "Low" && distance < (quality === "High" ? 70 : 48) && level === batch.level;
        part.castShadow = level === 0 && distance < 22;
      }));
    }
  };
  function clear() {
    group.clear();
    for (const batch of batches) for (const lod of batch.meshes) for (const part of lod) part.dispose();
    batches.length = 0; leases.splice(0).forEach(lease => lease.release()); customAssets.splice(0).forEach(asset => asset.dispose());
  }
  async function stream(renderer: WebGLRenderer) {
    try {
      const ids = [...new Set(sites.map(site => site.asset))];
      for (const id of ids) {
        if (disposed) return false;
        let asset: HrPropAsset;
        if (load) { asset = await load(renderer, id); if (disposed) { asset.dispose(); return false; } customAssets.push(asset); }
        else { const lease = acquire(renderer, id); leases.push(lease); asset = await lease.ready; if (disposed) return false; }
        const selected = sites.filter(site => site.asset === id);
        const batchCenter = selected.reduce((sum, site) => sum.add(new Vector3(site.x, heightAt(site.x, site.z) + site.size[1] / 2, site.z)), new Vector3()).divideScalar(selected.length);
        const meshes = asset.lods.map(parts => parts.map(part => {
          const instances = new InstancedMesh(part.geometry, part.material, selected.length);
          instances.name = `${id}-instanced`; instances.receiveShadow = true; instances.raycast = () => {};
          selected.forEach((site, index) => {
            instances.setMatrixAt(index, fitHrProp(asset.bounds, site, heightAt).multiply(part.matrix));
            instances.setColorAt(index, new Color().setScalar(site.tint));
          });
          instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere(); instances.computeBoundingBox();
          group.add(instances); return instances;
        }));
        batches.push({ meshes, center: batchCenter, level: 0 });
      }
      ready = true; mesh.add(group); mesh.userData.hrPropsReady = true; refresh(); return true;
    } catch (error) {
      mesh.userData.hrPropsError = error instanceof Error ? error.message : String(error);
      clear(); refresh(); return false;
    }
  }
  function loadDetail(renderer: WebGLRenderer) {
    if (disposed || quality === "Low") return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    return pending ??= stream(renderer);
  }
  mesh.onAfterRender = function (renderer, ...args) {
    after.call(this, renderer, ...args);
    if (pending || quality === "Low" || disposed || !nearby) return;
    const viewport = renderer.domElement.closest("[data-world-build]");
    if (viewport?.getAttribute("data-world-build") === "done" && viewport.getAttribute("data-world-intro") === "done"
      && viewport.getAttribute("data-world-paused") === "false") void loadDetail(renderer);
  };
  return { loadDetail, dispose() {
    if (disposed) return; disposed = true; unbind();
    mesh.onBeforeRender = before; mesh.onAfterRender = after; mesh.frustumCulled = originalCull;
    mesh.geometry = fallback; group.removeFromParent(); clear(); empty.dispose();
  } };
}

/** Identical factory signature lets zone tests inject the compact fixture loader. */
export function createHrPropsBatch(fallback: BufferGeometry, sites: readonly DressingSite[], heightAt: (x: number, z: number) => number,
  load?: DressingLoader, retained?: BufferGeometry, extras: readonly HrPropSite[] = []) {
  if (load) return createLibraryBatch(fallback, sites, heightAt, load, retained);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .96, side: DoubleSide });
  material.forceSinglePass = true;
  const mesh = new Mesh(fallback, material); mesh.receiveShadow = true; mesh.raycast = () => {};
  const controller = bindHrProps(mesh, [...sites.map(site => ({ ...site, asset: selectHrProp(site.asset, site.x, site.z) })), ...extras], heightAt, retained);
  let disposed = false;
  return { mesh, loadDetail: controller.loadDetail, dispose() {
    if (disposed) return; disposed = true;
    controller.dispose(); mesh.removeFromParent(); fallback.dispose(); material.dispose();
  } };
}
