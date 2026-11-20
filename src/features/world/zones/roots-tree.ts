import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3, type Texture, type WebGLRenderer } from "three";
import { bakedPropQuality, bindBakedPropQuality } from "../props/batched";
import type { Quality } from "../terrain";

export interface RootsTreeAsset { group: Group; dispose(): void }
export type RootsTreeLoader = (renderer: WebGLRenderer, level: 0 | 1) => Promise<RootsTreeAsset>;

/** A rounded soil collar covers the open ends of the generator's fused tubes.
 * Its outer ring is buried in the same sampled soil as the original roots. */
export function rootsSoilCollar(placement: { side: number; x: number; y: number; z: number; heightAt(x: number, z: number): number }) {
  const position: number[] = [], normal: number[] = [], uv: number[] = [], color: number[] = [], index: number[] = [];
  const sides = 96, rings = 8;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2;
      // Smooth union of the fluted bole and its eight fused columns. A broad,
      // irregular flare blends into soil instead of ending in straight teeth.
      const lobes = Math.pow(0.5 + 0.5 * Math.cos((a - 0.25) * 8), 0.65);
      const radius = 1.72 + lobes * 0.34 + t * (0.8 + Math.sin(a * 3 + 1.3) * 0.12);
      const x = placement.x + placement.side * (0.8 + Math.cos(a) * radius);
      const z = placement.z + placement.side * Math.sin(a) * radius;
      const ground = placement.heightAt(x, z);
      const rise = (1 - t) ** 2 * (0.95 + lobes * 0.22);
      const y = ground + rise - 0.06;
      position.push(x, y, z); normal.push(0, 1, 0);
      // V follows the flare's surface length into the soil, rather than its
      // shrinking vertical projection (which stretched bark at the outer lip).
      uv.push(side / sides * 14, 1.05 - t * 1.6);
      const ao = 0.63 + (1 - t) * 0.16;
      color.push(ao * 0.94, ao * 0.89, ao * 0.79);
      if (ring < rings && side < sides) {
        const q = ring * (sides + 1) + side;
        index.push(q, q + 1, q + sides + 1, q + 1, q + sides + 2, q + sides + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(color, 3)); geometry.setIndex(index);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

/** Each tree owns its decoders and GPU resources, including late completions. */
export async function loadRootsTree(renderer: WebGLRenderer, level: 0 | 1): Promise<RootsTreeAsset> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({ name: "KHR_materials_diffuse_transmission" }));
  try {
    const { scene } = await loader.loadAsync(`/world/roots/roots-tree-lod${level}.glb`);
    scene.name = `roots-tree-lod${level}`;
    let disposed = false;
    return { group: scene, dispose() {
      if (disposed) return; disposed = true;
      const textures = new Set<Texture>();
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
          material.dispose();
        }
      });
      textures.forEach(t => t.dispose()); scene.removeFromParent(); scene.clear();
    } };
  } finally { ktx.dispose(); }
}

/** The first playable paint always uses the cheap tree. Quality and distance
 * select streamed LODs with hysteresis; physics and interaction stay in roots.ts.
 * A failed request leaves a complete tree and is not retried every frame. */
export function createRootsTree(fallback: Mesh, trigger: Mesh, placement: { side: number; x: number; y: number; z: number;
  heightAt(x: number, z: number): number; onDetail?(active: boolean): void }, load: RootsTreeLoader = loadRootsTree) {
  const group = new Group(); group.name = "roots-tree-streamed";
  let quality: Quality = "High", disposed = false, selected: 0 | 1 = 0;
  let renderer: WebGLRenderer | undefined, started = false, revision = 0;
  const assets = new Map<0 | 1, RootsTreeAsset>(), pending = new Set<0 | 1>(), failed = new Set<0 | 1>();
  const eye = new Vector3(), origin = new Vector3();
  const detail = { value: 0 }, decorated = new WeakSet<import("three").Material>();
  const refresh = () => {
    const active = quality === "Low" ? undefined : assets.get(selected) ?? assets.get(selected === 0 ? 1 : 0);
    fallback.visible = !active;
    detail.value = active ? 1 : 0; placement.onDetail?.(!!active);
    for (const asset of assets.values()) asset.group.visible = asset === active;
  };
  const unbind = bindBakedPropQuality(fallback, next => { quality = next; refresh(); });
  async function request(level: 0 | 1) {
    if (!renderer || disposed || quality === "Low" || assets.has(level) || pending.has(level) || failed.has(level)) return;
    pending.add(level);
    const current = revision;
    try {
      const asset = await load(renderer, level);
      if (disposed || current !== revision) { asset.dispose(); return; }
      // Bake terrain following only into the feet. Upper wood stays continuous.
      asset.group.updateMatrixWorld(true);
      const meshes: Mesh[] = [];
      asset.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        meshes.push(object);
        // meshopt quantization uses normalized attributes and node transforms.
        // Expand those before baking the zone placement/terrain deformation.
        for (const name of ["position", "normal"]) {
          const attribute = object.geometry.getAttribute(name);
          const values = new Float32Array(attribute.count * 3);
          for (let i = 0; i < attribute.count; i++) { values[i * 3] = attribute.getX(i); values[i * 3 + 1] = attribute.getY(i); values[i * 3 + 2] = attribute.getZ(i); }
          object.geometry.setAttribute(name, new Float32BufferAttribute(values, 3));
        }
        object.geometry.applyMatrix4(object.matrixWorld);
        object.position.set(0, 0, 0); object.quaternion.identity(); object.scale.set(1, 1, 1); object.updateMatrix();
        const p = object.geometry.getAttribute("position");
        // The generator's tube UV has its U axis around the branch. Pine bark
        // grows along texture V; retain that orientation at metre-scale density.
        if (!Array.isArray(object.material) && object.material.name === "roots-tree-bark") {
          const source = object.geometry.getAttribute("uv"), uv = new Float32Array(source.count * 2);
          for (let i = 0; i < source.count; i++) { uv[i * 2] = source.getX(i) * 2; uv[i * 2 + 1] = source.getY(i) * 2.2; }
          object.geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        }
        for (let i = 0; i < p.count; i++) {
          const x = placement.x + placement.side * p.getX(i), z = placement.z + placement.side * p.getZ(i);
          const y = p.getY(i);
          const ground = placement.heightAt(x, z);
          const support = ground + (placement.y - ground) * Math.min(1, Math.max(0, y / 3));
          const scale = Math.min(1, 29.8 / Math.hypot(x, z));
          // Bury the open tube rim below the sampled soil. Smoothly release
          // the sink above the collar so there is no exposed serrated cut.
          const foot = Math.min(1, Math.max(0, y / 0.9));
          const sink = 0.48 * (1 - foot * foot * (3 - 2 * foot));
          p.setXYZ(i, x * scale, y + support - sink, z * scale);
        }
        // A half turn preserves triangle winding on the opposite verge.
        if (placement.side < 0) {
          const n = object.geometry.getAttribute("normal");
          for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), n.getY(i), -n.getZ(i));
        }
        // Terrain following changes the root slopes; imported normals no longer
        // describe those surfaces (or their normal-mapped bark).
        object.geometry.computeVertexNormals();
        object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere();
        object.castShadow = level === 0; object.receiveShadow = true;
        // These meshes are decorative, and must not change interaction raycasts.
        object.raycast = () => {};
      });
      // GLTFLoader groups primitives beneath the quantized node transform.
      // Their transforms have just been baked, so remove those wrapper nodes.
      const bark = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === "roots-tree-bark");
      if (bark && !Array.isArray(bark.material)) {
        const collar = new Mesh(rootsSoilCollar(placement), bark.material.clone());
        collar.name = "roots-rounded-soil-collar"; collar.receiveShadow = true; collar.raycast = () => {};
        meshes.push(collar);
      }
      asset.group.clear(); assets.set(level, asset);
      meshes.forEach(mesh => asset.group.add(mesh));
      group.add(asset.group); refresh();
    } catch { failed.add(level); }
    finally { pending.delete(level); }
  }
  // The board/root batch keeps drawing when the old crown hides. Chain its
  // existing callbacks (including sign grain); add no draw call for streaming.
  const before = trigger.onBeforeRender, after = trigger.onAfterRender;
  trigger.onBeforeRender = function (gpu, scene, camera, ...rest) {
    before.call(this, gpu, scene, camera, ...rest);
    if (disposed) return;
    // Root/collar geometry shares the sign batch. Mask only its unmarked
    // vertices after the sign hook, including photo material replacements.
    const material = trigger.material;
    if (!Array.isArray(material) && !decorated.has(material)) {
      decorated.add(material);
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, gpu) => {
        compile(shader, gpu); shader.uniforms.rootsTreeDetail = detail;
        if (shader.fragmentShader.includes("uniform float rootsTreeDetail;")) return;
        const keep = shader.vertexShader.includes("attribute vec3 signGrain;") ? "signGrain.z" : "0.0";
        if (!shader.vertexShader.includes("varying float vRootsTreeKeep;")) {
          shader.vertexShader = "varying float vRootsTreeKeep;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\nvRootsTreeKeep = ${keep};`);
        }
        shader.fragmentShader = "uniform float rootsTreeDetail; varying float vRootsTreeKeep;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (rootsTreeDetail > 0.5 && vRootsTreeKeep < 0.5) discard;");
      };
      material.customProgramCacheKey = () => key() + "|roots-tree-legacy-mask-v1";
      material.needsUpdate = true;
    }
    const viewport = gpu.domElement?.closest?.("[data-world-build]");
    if (viewport?.getAttribute("data-world-build") !== "done" || viewport.getAttribute("data-world-intro") !== "done") return;
    renderer = gpu; quality = bakedPropQuality(fallback);
    // Measure against the root collar in world space, without allocating per frame.
    eye.set(placement.x, placement.y, placement.z).applyMatrix4(group.matrixWorld);
    camera.getWorldPosition(origin);
    const distance = origin.distanceTo(eye);
    selected = distance > 32 ? 1 : distance < 26 ? 0 : selected;
    refresh();
    if (quality === "Low" || distance > 85) return;
    // onAfterRender of the first playable frame queues decoder imports.
    started = true;
  };
  trigger.onAfterRender = function (...args) { after.apply(this, args); if (started && !disposed) void request(selected); };
  return { group, refresh, dispose() {
    if (disposed) return; disposed = true; revision++;
    unbind(); trigger.onBeforeRender = before; trigger.onAfterRender = after;
    group.removeFromParent();
    for (const asset of assets.values()) asset.dispose(); assets.clear(); group.clear();
    fallback.visible = true; detail.value = 0; placement.onDetail?.(false);
  } };
}
