import {
  Box3, BufferGeometry, Color, DoubleSide, Frustum, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Sphere, Vector3, type Material, type Texture, type WebGLRenderer,
} from "three";
import { bindBakedPropQuality } from "./batched";
import { createLibraryBatch, type DressingLoader, type DressingSite } from "./library-batch";
import type { Quality } from "../terrain";
import { usesSoftwareRasterizer } from "../foliage/hr-capabilities";
import { bindHrZoneStructures } from "./hr-structures";

export const HR_PROP_FAMILIES = {
  bush: ["hr-prop-bush-broadleaf", "hr-prop-bush-needle", "hr-prop-bush-wildflower", "hr-prop-bush-bamboo"],
  fern: ["hr-prop-fern-arching", "hr-prop-fern-sword", "hr-prop-fern-round"],
  rock: ["hr-rock-boulder", "hr-rock-river", "hr-rock-slate", "hr-rock-moss-boulder", "hr-rock-moss-river", "hr-rock-moss-slate"],
  log: ["hr-prop-log-fungi", "hr-prop-log-moss"],
  palm: ["hr-palm-coconut", "hr-palm-leaning", "hr-palm-shore"],
  hill: ["hr-tree-spreading-crown", "hr-tree-umbrella-crown", "hr-tree-slender-upright", "hr-tree-leaning-riverside"],
  grass: ["hr-prop-grass-meadow"],
  structure: ["hr-prop-sawn-timber", "hr-prop-coastal-coating", "hr-prop-storm-lantern"],
} as const;
export type HrPropId = typeof HR_PROP_FAMILIES[keyof typeof HR_PROP_FAMILIES][number];
export interface HrPropSite extends Omit<DressingSite, "asset"> { asset: HrPropId; baseY?: number }
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
async function createPropDecoder(renderer: WebGLRenderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  const textures = new Map<string, Promise<Texture>>(), originalLoad = ktx.load.bind(ktx);
  ktx.load = (url, onLoad, onProgress, onError) => {
    let pending = textures.get(url);
    if (!pending) { pending = new Promise((resolve, reject) => { originalLoad(url, resolve, onProgress, reject); }); textures.set(url, pending); }
    void pending.then(texture => onLoad?.(texture as import("three").CompressedTexture)).catch(error => onError?.(error));
  };
  return { loader, dispose() { ktx.dispose(); for (const pending of textures.values()) void pending.then(t => t.dispose()).catch(() => {}); } };
}
const caches = new WeakMap<WebGLRenderer, {
  assets: Map<HrPropId, { refs: number; ready: Promise<HrPropAsset> }>;
  refs: number; decoder: ReturnType<typeof createPropDecoder>; queue: Promise<unknown>;
}>();
async function loadAsset(loader: Awaited<ReturnType<typeof createPropDecoder>>["loader"], id: HrPropId): Promise<HrPropAsset> {
  const lods: HrPropPart[][] = [], geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  const release = () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); };
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
}
export function acquireHrProp(renderer: WebGLRenderer, id: HrPropId) {
  let pool = caches.get(renderer);
  if (!pool) { pool = { assets: new Map(), refs: 0, decoder: createPropDecoder(renderer), queue: Promise.resolve() }; caches.set(renderer, pool); }
  const shared = pool;
  let entry = shared.assets.get(id);
  if (!entry) {
    const ready = shared.queue.catch(() => {}).then(() => shared.decoder).then(({ loader }) => loadAsset(loader, id));
    entry = { refs: 0, ready }; shared.assets.set(id, entry); shared.queue = ready;
  }
  entry.refs++; shared.refs++;
  let released = false;
  const lease = entry;
  return { ready: lease.ready, release() {
    if (released) return; released = true;
    if (--lease.refs === 0) {
      if (shared.assets.get(id) === lease) shared.assets.delete(id);
      void lease.ready.then(asset => asset.dispose()).catch(() => {});
    }
    if (--shared.refs === 0) {
      caches.delete(renderer);
      void shared.queue.catch(() => {}).then(() => shared.decoder).then(decoder => decoder.dispose()).catch(() => {});
    }
  } };
}

/** Fit at the root, preserving smooth normals and rigid trunks on slopes. */
export function fitHrProp(bounds: Box3, site: HrPropSite, heightAt: (x: number, z: number) => number) {
  const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
  return new Matrix4().makeTranslation(site.x, site.baseY ?? heightAt(site.x, site.z) - .025, site.z)
    .multiply(new Matrix4().makeRotationY(site.yaw))
    .multiply(new Matrix4().makeScale(site.size[0] / size.x, site.size[1] / size.y, site.size[2] / size.z))
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
}

/** Replace only the dressing envelope; colliders and interaction anchors are untouched.
 * Real PBR primitives survive loading. Each asset/LOD/primitive is one instanced draw.
 */
export function bindHrProps(mesh: Mesh, sites: readonly HrPropSite[], heightAt: (x: number, z: number) => number,
  retained?: BufferGeometry, load?: HrPropLoader, detail: { minimumLod?: 0 | 1; radius?: number } = {}) {
  const fallback = mesh.geometry, empty = retained ?? new BufferGeometry();
  if (!fallback.boundingBox) fallback.computeBoundingBox();
  const envelope = fallback.boundingBox?.clone() ?? new Box3();
  for (const site of sites) {
    const y = site.baseY ?? heightAt(site.x, site.z);
    const r = Math.hypot(site.size[0], site.size[2]) / 2;
    envelope.expandByPoint(new Vector3(site.x - r, y, site.z - r));
    envelope.expandByPoint(new Vector3(site.x + r, y + site.size[1], site.z + r));
  }
  const group = new Group(); group.name = "hr-props-streamed"; group.visible = false;
  const before = mesh.onBeforeRender, after = mesh.onAfterRender, originalCull = mesh.frustumCulled;
  // A retained workshop surface may have a smaller bound than its dressing.
  mesh.frustumCulled = false;
  let quality: Quality = "High", disposed = false, pending: Promise<boolean> | undefined, ready = false, nearby = true;
  const batches: { meshes: InstancedMesh[][]; center: Vector3; level: number; roots: Vector3[]; bounds: Sphere[]; transforms: Matrix4[][][]; tints: Color[]; active: number[][] }[] = [];
  const leases: { release(): void }[] = [], customAssets: HrPropAsset[] = [];
  const refresh = () => { mesh.geometry = quality === "Low" || !ready ? fallback : empty; group.visible = ready && quality !== "Low" && nearby; };
  const unbind = bindBakedPropQuality(mesh, next => { quality = next; refresh(); });
  const eye = new Vector3(), lastEye = new Vector3(Infinity,Infinity,Infinity);
  const frustum = new Frustum(), view = new Matrix4(), lastView = new Matrix4();
  let lastQuality: Quality | undefined;
  mesh.onBeforeRender = function (...args) {
    before.apply(this, args);
    args[2].getWorldPosition(eye); mesh.worldToLocal(eye);
    nearby = envelope.distanceToPoint(eye) < (quality === "High" ? 65 : 45);
    mesh.geometry.setDrawRange(0, nearby ? Infinity : 0); refresh();
    view.multiplyMatrices(args[2].projectionMatrix, args[2].matrixWorldInverse).multiply(mesh.matrixWorld);
    const changedView = lastEye.distanceToSquared(eye) >= 0.25 || lastQuality !== quality
      || view.elements.some((value, i) => Math.abs(value - lastView.elements[i]!) > 0.01);
    if (changedView) { lastEye.copy(eye); lastQuality = quality; lastView.copy(view); frustum.setFromProjectionMatrix(view); }
    for (const batch of batches) {
      if (detail.radius !== undefined) {
        if (!changedView) continue;
        const radiusSquared = detail.radius * detail.radius;
        const active = batch.meshes.map(() => [] as number[]);
        batch.roots.forEach((root,index) => {
          const distanceSquared = eye.distanceToSquared(root);
          // Compact the actual visible community, including partially visible
          // crowns. Offscreen saplings no longer submit their full HR meshes.
          if (distanceSquared >= radiusSquared || !frustum.intersectsSphere(batch.bounds[index]!)) return;
          const previous = batch.active[0]!.includes(index) ? 0 : 1;
          const level = Math.max(detail.minimumLod ?? 0, hrPropLod(Math.sqrt(distanceSquared),previous));
          active[level]!.push(index);
        });
        batch.meshes.forEach((lod,level) => lod.forEach((part,primitive) => {
          const members = active[level]!, changed = members.length !== batch.active[level]!.length || members.some((index,i) => index !== batch.active[level]![i]);
          part.visible = quality !== "Low" && members.length > 0; part.castShadow = false;
          if (changed) {
            members.forEach((index,slot) => { part.setMatrixAt(slot,batch.transforms[level]![primitive]![index]!); part.setColorAt(slot,batch.tints[index]!); });
            part.count = members.length; part.instanceMatrix.needsUpdate = true; if (part.instanceColor) part.instanceColor.needsUpdate = true;
            part.computeBoundingSphere(); part.computeBoundingBox();
          }
        }));
        batch.active = active;
        continue;
      }
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
        else { const lease = acquireHrProp(renderer, id); leases.push(lease); asset = await lease.ready; if (disposed) return false; }
        const selected = sites.filter(site => site.asset === id);
        const fits = selected.map(site => fitHrProp(asset.bounds,site,heightAt));
        const roots = selected.map(site => new Vector3(site.x,site.baseY ?? heightAt(site.x,site.z),site.z));
        const bounds = selected.map((site, i) => new Sphere(roots[i]!.clone().add(new Vector3(0, site.size[1] / 2, 0)), Math.hypot(...site.size) / 2 + 0.35));
        const tints = selected.map(site => new Color().setScalar(site.tint));
        const batchCenter = selected.reduce((sum, site) => sum.add(new Vector3(site.x, heightAt(site.x, site.z) + site.size[1] / 2, site.z)), new Vector3()).divideScalar(selected.length);
        const transforms: Matrix4[][][] = asset.lods.map(parts => parts.map(part => fits.map(fit => fit.clone().multiply(part.matrix))));
        const meshes = asset.lods.map((parts,level) => parts.map((part,primitive) => {
          const instances = new InstancedMesh(part.geometry, part.material, selected.length);
          instances.name = `${id}-instanced`; instances.receiveShadow = true; instances.raycast = () => {};
          const matrices = transforms[level]![primitive]!;
          selected.forEach((site, index) => {
            instances.setMatrixAt(index, matrices[index]!);
            instances.setColorAt(index, new Color().setScalar(site.tint));
          });
          instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere(); instances.computeBoundingBox();
          group.add(instances); return instances;
        }));
        batches.push({ meshes, center: batchCenter, level: 0, roots, bounds, transforms, tints, active: meshes.map(() => []) });
      }
      ready = true; lastEye.set(Infinity,Infinity,Infinity); mesh.add(group); mesh.userData.hrPropsReady = true; refresh(); return true;
    } catch (error) {
      mesh.userData.hrPropsError = error instanceof Error ? error.message : String(error);
      clear(); refresh(); return false;
    }
  }
  function loadDetail(renderer: WebGLRenderer) {
    if (disposed || quality === "Low" || (!load && usesSoftwareRasterizer(renderer))) return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    return pending ??= stream(renderer);
  }
  mesh.onAfterRender = function (renderer, ...args) {
    after.call(this, renderer, ...args);
    if (pending || quality === "Low" || disposed || !nearby) return;
    const viewport = renderer?.domElement?.closest("[data-world-build]");
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
  const releaseStructures = bindHrZoneStructures(mesh);
  let disposed = false;
  return { mesh, loadDetail: controller.loadDetail, dispose() {
    if (disposed) return; disposed = true;
    releaseStructures(); controller.dispose(); mesh.removeFromParent(); fallback.dispose(); material.dispose();
  } };
}
