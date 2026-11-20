import { BufferGeometry, Color, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Mesh,
  NoColorSpace, Object3D, PlaneGeometry, Scene, SRGBColorSpace, Vector3, type Material, type Texture, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { PHOTO_TILE_SIZE, photoTextureUrls } from "../materials/cc0";
import { createStreambedLayout, type BedItem, type BedReach } from "./streambed-layout";
import { bedStoneColor, createBedFoamMaterial, createBedPlantMaterial, createBedStoneFallback, createBedStoneMaterial } from "./streambed-shader";
import { createWeedClump, roundBedStone } from "./streambed-geometry";
import { createStreambedCuller, type StreambedCuller } from "./streambed-cull";

interface Resident { group: Group; meshes: InstancedMesh[]; layout: BedReach; cullers: Map<InstancedMesh, StreambedCuller>; }

/** Match the world's photo fallback on CPU rasterizers, even with High pinned. */
export function streambedUsesLow(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext?.(), debug = gl?.getExtension("WEBGL_debug_renderer_info");
  const device = gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(device));
}

/** Visual only: no physics/camera registration. The caller schedules build after playability. */
export function createStreambed(renderer: WebGLRenderer) {
  const software = streambedUsesLow(renderer);
  const group = new Group(); group.name = "streambed";
  const residents = new Map<number, Resident>();
  const plant = createBedPlantMaterial(false), leaf = createBedPlantMaterial(true), foam = createBedFoamMaterial();
  const stoneTime = { value: 0 };
  const fallback = createBedStoneFallback();
  const planes = [createWeedClump(), new PlaneGeometry(1, 1, 2, 6), new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)];
  let layout: ReturnType<typeof createStreambedLayout> | undefined;
  let rocks: BufferGeometry[] = [], textures: Texture[] = [], photoMaterials: Material[] = [];
  let disposed = false, enabled = false, ready = false, elapsed = 0, frames = 0, reviewEnabled = true;
  let quality: Quality = software ? "Low" : "High", requested: Quality | undefined, revision = 0;
  let decoder: import("three/addons/loaders/KTX2Loader.js").KTX2Loader | undefined;
  let loadTextures: ((quality: Quality) => Promise<void>) | undefined;
  const transform = new Object3D(), tint = new Color();

  function clearResident(resident: Resident) {
    for (const culler of resident.cullers.values()) culler.dispose();
    for (const mesh of resident.meshes) { mesh.dispose(); mesh.geometry.dispose(); }
    resident.group.removeFromParent(); resident.group.clear();
  }
  function materialFor(name: string) {
    return name === "streambed-pebbles" ? photoMaterials[0] ?? fallback : name === "streambed-boulders" ? photoMaterials[1] ?? fallback
      : name === "streambed-rong" ? plant.material : name === "streambed-leaves" ? leaf.material : foam;
  }
  function updateMaterials() {
    for (const resident of residents.values()) for (const mesh of resident.meshes) mesh.material = materialFor(mesh.name);
  }
  async function load() {
    const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    if (disposed) return;
    decoder = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
    const ktx = decoder;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
    loadTextures = async next => {
      requested = next;
      const token = ++revision;
      if (next === "Low") {
        photoMaterials.forEach(m => m.dispose()); photoMaterials = [];
        textures.forEach(t => t.dispose()); textures = []; updateMaterials(); return;
      }
      const selected = "High";
      const results = await Promise.allSettled(photoTextureUrls(selected).map(url => ktx.loadAsync(url)));
      const loaded = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
      if (disposed || token !== revision || loaded.length !== 2) { loaded.forEach(t => t.dispose()); return; }
      loaded.forEach((t, i) => { t.colorSpace = i === 0 ? SRGBColorSpace : NoColorSpace; t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true; });
      photoMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      textures = loaded;
      photoMaterials = [false, true].map(boulder => createBedStoneMaterial(loaded, PHOTO_TILE_SIZE[selected], boulder, stoneTime));
      updateMaterials();
    };
    // Existing CC0, meshopt + KTX2 library. No new asset bytes in public/.
    const results = await Promise.allSettled([1, 2, 3, 4].flatMap(variant => [0, 1].map(async lod => {
      const gltf = await loader.loadAsync(`/world/lib/rock-boulder-${variant}-lod${lod}.glb`);
      let geometry: BufferGeometry | undefined;
      const releasedTextures = new Set<Texture>();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (!geometry) {
          const part = object.geometry.clone() as BufferGeometry;
          const p = part.getAttribute("position"), unpacked: number[] = [];
          for (let i = 0; i < p.count; i++) unpacked.push(p.getX(i), p.getY(i), p.getZ(i));
          part.setAttribute("position", new Float32BufferAttribute(unpacked, 3));
          geometry = part.applyMatrix4(object.matrixWorld);
        }
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) releasedTextures.add(value as Texture);
          material.dispose();
        }
      });
      releasedTextures.forEach(t => t.dispose());
      if (!geometry) throw new Error("Empty streambed rock");
      const smooth = lod === 1 ? [roundBedStone(geometry, true, variant), roundBedStone(geometry, true, variant + 4)]
        : [roundBedStone(geometry, false)];
      geometry.dispose();
      return smooth;
    })));
    const loaded = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
    if (disposed || loaded.length !== 12) { loaded.forEach(g => g.dispose()); return; }
    rocks = loaded; ready = true;
    await loadTextures(quality);
  }

  function batch(resident: Resident, name: string, source: BufferGeometry, items: BedItem[], mode: number) {
    if (!items.length) return;
    const geometry = source.clone();
    geometry.setAttribute("bedWet", new InstancedBufferAttribute(new Float32Array(items.flatMap(p => [p.water, p.seed])), 2));
    const mesh = new InstancedMesh(geometry, materialFor(name), items.length);
    mesh.name = name; mesh.raycast = () => {}; mesh.receiveShadow = mode < 3;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      transform.position.copy(item.position).sub(resident.layout.center);
      transform.rotation.set(mode === 3 ? -Math.PI / 2 : 0, mode === 4 ? item.flow : item.yaw, 0, "YXZ");
      transform.scale.copy(item.scale);
      // Clumps spread over a footprint proportional to the authored blade width.
      if (mode === 2) transform.scale.set(item.scale.x * 2.3, item.scale.y, item.scale.x * 2.3);
      if (mode === 4) {
        transform.position.y = item.water + 0.022 - resident.layout.center.y;
        transform.position.x -= Math.sin(item.flow) * item.scale.z * 1.45;
        transform.position.z -= Math.cos(item.flow) * item.scale.z * 1.45;
        transform.scale.set(item.scale.x * 1.65, 1, item.scale.z * (2.5 + item.seed));
      }
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
      if (mode < 2) mesh.setColorAt(i, bedStoneColor(item.seed, tint));
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    // Leaves drift entirely on the GPU. Expand bounds for their full swept route.
    if (mode === 3 && mesh.boundingSphere) mesh.boundingSphere.radius += 0.5;
    resident.meshes.push(mesh); resident.group.add(mesh);
    if (mode < 2) resident.cullers.set(mesh, createStreambedCuller(mesh));
  }
  function createReach(id: number) {
    const bed = layout!.reach(id), root = new Group(); root.position.copy(bed.center);
    const resident: Resident = { group: root, meshes: [], layout: bed, cullers: new Map() };
    for (let variant = 0; variant < 8; variant++)
      batch(resident, "streambed-pebbles", rocks[Math.floor(variant / 2) * 3 + 1 + variant % 2]!, bed.pebbles.filter((_, i) => i % 8 === variant), 0);
    for (let variant = 0; variant < 4; variant++)
      batch(resident, "streambed-boulders", rocks[variant * 3]!, bed.boulders.filter((_, i) => i % 4 === variant), 1);
    batch(resident, "streambed-rong", planes[0]!, bed.weeds, 2);
    batch(resident, "streambed-leaves", planes[1]!, bed.leaves, 3);
    batch(resident, "streambed-foam", planes[2]!, bed.boulders, 4);
    residents.set(id, resident); group.add(root);
    let owner = group.parent;
    while (owner && !(owner instanceof Scene)) owner = owner.parent;
    if (owner instanceof Scene) for (const culler of resident.cullers.values()) culler.register(owner);
    return resident;
  }
  // Explicit review opt-in, matching the world journey hook. ABBA never alters gameplay state.
  const reviewCanvas = renderer.domElement as HTMLCanvasElement & { __tqaStreambedReview?: {
    setEnabled(value: boolean): void;
    info(): { ready: boolean; reaches: number; instances: number; triangles: number; drawCalls: number };
  } };
  const review = typeof window !== "undefined" && window.__tqaJourney ? Object.freeze({
    setEnabled(value: boolean) { reviewEnabled = value; group.visible = value; },
    info() {
      let instances = 0, triangles = 0, drawCalls = 0;
      for (const resident of residents.values()) if (resident.group.visible) for (const mesh of resident.meshes) if (mesh.visible) {
        instances += mesh.count; triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3 * mesh.count; drawCalls++;
      }
      return { ready, reaches: residents.size, instances, triangles, drawCalls };
    },
  }) : undefined;
  if (review) reviewCanvas.__tqaStreambedReview = review;
  return { group,
    *build(): Generator<void> {
      if (disposed || enabled) return;
      layout = createStreambedLayout(); enabled = true;
      // Loading does not hold the existing shared dressing queue open.
      void load().catch(() => { /* Optional visuals retain the quiet fallback on decode failure. */ });
      yield;
    },
    update(dt: number, reducedMotion: boolean, player: Readonly<Vector3>, next: Quality) {
      if (disposed) return;
      if (software) next = "Low";
      quality = next;
      if (!reviewEnabled) return;
      if (!enabled || !ready) return;
      if (loadTextures && requested !== next) void loadTextures(next).catch(() => {});
      if (Number.isFinite(dt) && dt > 0 && !reducedMotion) elapsed += Math.min(dt, 0.1);
      plant.time.value = leaf.time.value = stoneTime.value = foam.uniforms.bedTime!.value = elapsed;
      const range = next === "Low" ? 38 : 88;
      let candidate = -1, nearest = Infinity;
      for (let id = 0; id < layout!.centers.length; id++) {
        const center = layout!.centers[id]!, dx = center.x - player.x, dz = center.z - player.z, distance = Math.hypot(dx, dz);
        const resident = residents.get(id);
        if (resident && distance > 125) { clearResident(resident); residents.delete(id); continue; }
        if (resident) {
          resident.group.visible = distance < range;
          for (const mesh of resident.meshes) {
            const stone = mesh.name === "streambed-pebbles" || mesh.name === "streambed-boulders";
            mesh.visible = next !== "Low" || stone;
            mesh.count = Math.ceil(mesh.instanceMatrix.count * (next === "Low" && mesh.name === "streambed-pebbles" ? 0.25 : 1));
            resident.cullers.get(mesh)?.setLimit(mesh.count, next !== "Low");
          }
        } else if (distance < range && distance < nearest) { nearest = distance; candidate = id; }
      }
      // One bounded reach per few frames; distant reaches are evicted, not accumulated.
      if (candidate >= 0 && ++frames % 4 === 0 && dt > 0) createReach(candidate);
    },
    dispose() {
      if (disposed) return; disposed = true; revision++;
      if (reviewCanvas.__tqaStreambedReview === review) delete reviewCanvas.__tqaStreambedReview;
      for (const resident of residents.values()) clearResident(resident);
      residents.clear(); group.removeFromParent(); group.clear();
      rocks.forEach(g => g.dispose()); planes.forEach(g => g.dispose());
      photoMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      plant.material.dispose(); leaf.material.dispose(); foam.dispose(); fallback.dispose(); decoder?.dispose();
    },
  };
}
