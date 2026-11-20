import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, ShaderChunk, Vector3, type Texture, type WebGLRenderer } from "three";
import { bakedPropQuality, bindBakedPropQuality } from "../props/batched";
import type { Quality } from "../terrain";

export interface RootsTreeAsset { group: Group; dispose(): void }
export type RootsTreeLoader = (renderer: WebGLRenderer, level: 0 | 1) => Promise<RootsTreeAsset>;

/** Matching offline oak profile; units are metres, radii rather than diameters. */
export function rootsOakLimb(i: number) {
  const a = i * Math.PI / 4 + .16 + Math.sin(i * 2.7) * .12;
  const reach = 15.2 + Math.sin(i * 1.9) * 1.6;
  const radial = (angle: number, r: number, y: number) => new Vector3(Math.cos(angle) * r + .8, y, Math.sin(angle) * r);
  const contact = radial(a + .1, 10 + (i % 3) * 1.25, .14);
  return { a, reach, contact, radial, points: [radial(a, .7, 2.6 + i % 3 * .12), radial(a - .06, 3.6, 2.6 + Math.sin(i * 1.7) * .65),
    radial(a + .04, 6.5, 1.8 + Math.cos(i * 2.1) * .7), contact,
    radial(a - .03, reach * .93, 2.5 + i % 2), radial(a + .08 * Math.sin(i), reach + 1, 4.8 + Math.sin(i * 1.4) * .6)] };
}

/** A continuous clearance field avoids pulling single bark/moss vertices into walls. */
export function rootsOakClearance(blocked: (x: number, z: number) => boolean, bole?: { x: number; z: number }) {
  const samples = new Map<string, number>();
  const mask = new Map<string, boolean>();
  const blockedAt = (x: number, z: number) => {
    const key = `${x},${z}`, cached = mask.get(key);
    if (cached !== undefined) return cached;
    const value = blocked(x, z); mask.set(key, value); return value;
  };
  const sample = (x: number, z: number) => {
    const key = `${x},${z}`, cached = samples.get(key);
    if (cached !== undefined) return cached;
    let distance = 5;
    for (let dx = -4; dx <= 4; dx += .5) for (let dz = -4; dz <= 4; dz += .5) {
      if (Math.hypot(dx, dz) < distance && blockedAt(x + dx, z + dz)) distance = Math.hypot(dx, dz);
    }
    const t = Math.min(1, Math.max(0, (3.5 - distance) / 2));
    // The unchanged Skills board reaches about 5 m above its bank. Limbs on
    // its road-facing side pass above the whole board and its 5 m approach.
    const lift = 6.5 * t * t * (3 - 2 * t);
    samples.set(key, lift); return lift;
  };
  return (x: number, z: number, height: number, ground: number) => {
    const ix = Math.floor(x * 2) / 2, iz = Math.floor(z * 2) / 2, fx = (x - ix) * 2, fz = (z - iz) * 2;
    const a = sample(ix, iz) * (1 - fx) + sample(ix + .5, iz) * fx;
    const b = sample(ix, iz + .5) * (1 - fx) + sample(ix + .5, iz + .5) * fx;
    const collar = bole ? Math.min(1, Math.max(0, Math.hypot(x - bole.x, z - bole.z) - 3)) : 1;
    const lift = (a * (1 - fz) + b * fz) * collar * collar * (3 - 2 * collar);
    // Add a smooth displacement, preserving the cross-section and moss separation.
    return height + lift * Math.max(0, 1 - (height - ground) / 9.5);
  };
}

/** Appended to index.ts's zoneBounds before composing ground/forest.
 * The canopy exclusion is independent of physics: only the bole/elbows are solid.
 * Derive the fixed bole from the unchanged interaction, even before its idle mesh exists. */
export function rootsCanopyGroundBounds(group: Group, interaction: Readonly<Vector3>): Box3 {
  const side = Math.sign(interaction.x) || 1;
  const center = group.localToWorld(new Vector3(interaction.x + side * 2.5864, interaction.y - 1.15, interaction.z));
  return new Box3().setFromCenterAndSize(center, new Vector3(45, 40, 45));
}

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
      const radius = 1.15 + lobes * 0.18 + t * (1.5 + Math.sin(a * 3 + 1.3) * 0.12);
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
  heightAt(x: number, z: number): number; blocked?(x: number, z: number): boolean; onDetail?(active: boolean): void }, load: RootsTreeLoader = loadRootsTree) {
  const group = new Group(); group.name = "roots-tree-streamed";
  let quality: Quality = "High", disposed = false, selected: 0 | 1 = 0;
  let renderer: WebGLRenderer | undefined, started = false, revision = 0;
  const assets = new Map<0 | 1, RootsTreeAsset>(), pending = new Set<0 | 1>(), failed = new Set<0 | 1>();
  const eye = new Vector3(), origin = new Vector3();
  const detail = { value: 1 }, decorated = new WeakSet<import("three").Material>();
  const clearance = rootsOakClearance(placement.blocked ?? (() => false), { x: placement.x + placement.side * .8, z: placement.z });
  const refresh = () => {
    const active = quality === "Low" ? undefined : assets.get(selected) ?? assets.get(selected === 0 ? 1 : 0);
    fallback.visible = !active;
    const canvas = renderer?.domElement, state = active ? active.group.name : "fallback";
    if (canvas?.getAttribute?.("data-roots-tree") !== state) canvas?.setAttribute?.("data-roots-tree", state);
    detail.value = 1; placement.onDetail?.(true);
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
        if (object.material instanceof MeshStandardMaterial && object.material.name === "roots-tree-leaves") {
          object.material.emissive.setRGB(.005, .009, .002);
        }
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
        // Custom anchors stay in the generator's metre coordinates through meshopt.
        // Apply one displacement to each whole section, including its moss/ferns.
        const centers = object.geometry.getAttribute("_roots_center");
        // The generator's tube UV has its U axis around the branch. Pine bark
        // grows along texture V; retain that orientation at metre-scale density.
        if (!Array.isArray(object.material) && object.material.name === "roots-tree-bark") {
          const compile = object.material.onBeforeCompile;
          object.material.onBeforeCompile = (shader: Parameters<MeshStandardMaterial["onBeforeCompile"]>[0], gpu: WebGLRenderer) => {
            compile(shader, gpu);
            // Sample only the bark quadrant of the reused CC0 roughness atlas.
            const roughness = ShaderChunk.roughnessmap_fragment.replace("texture2D( roughnessMap, vRoughnessMapUv )", "texture2D( roughnessMap, vec2(0.506, 0.506) + fract(vRoughnessMapUv) * 0.488 )");
            shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", roughness + "\nroughnessFactor = max(0.84, roughnessFactor);");
          };
          object.material.customProgramCacheKey = () => "roots-oak-rough-bark-v1";
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
          const px = x * scale, pz = z * scale;
          const height = y + support - sink;
          let lift: number;
          if (centers) {
            const cx = placement.x + placement.side * centers.getX(i), cz = placement.z + placement.side * centers.getZ(i), cy = centers.getY(i);
            const soil = placement.heightAt(cx, cz), centerHeight = cy + soil + (placement.y - soil) * Math.min(1, Math.max(0, cy / 3));
            lift = clearance(cx, cz, centerHeight, soil) - centerHeight;
          } else lift = clearance(px, pz, height, placement.heightAt(px, pz)) - height;
          p.setXYZ(i, px, height + lift, pz);
        }
        // A half turn preserves triangle winding on the opposite verge.
        if (placement.side < 0) {
          const n = object.geometry.getAttribute("normal");
          for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), n.getY(i), -n.getZ(i));
        }
        // Terrain following changes the root slopes; imported normals no longer
        // describe those surfaces (or their normal-mapped bark).
        object.geometry.computeVertexNormals();
        // Clearance can turn an authored upper surface upright. Keep moss on
        // the upper face after placement as well, rather than green side walls.
        if (!Array.isArray(object.material) && object.material.name === "roots-tree-moss") {
          const indices = object.geometry.index, kept: number[] = [];
          const a = new Vector3(), b = new Vector3(), c = new Vector3();
          const count = indices?.count ?? p.count;
          for (let i = 0; i < count; i += 3) {
            const ids = [0, 1, 2].map(j => indices ? indices.getX(i + j) : i + j);
            a.fromBufferAttribute(p, ids[0]!); b.fromBufferAttribute(p, ids[1]!); c.fromBufferAttribute(p, ids[2]!);
            if (b.sub(a).cross(c.sub(a)).normalize().y > .45) kept.push(...ids);
          }
          object.geometry.setIndex(kept);
        }
        object.geometry.deleteAttribute("_roots_center");
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
    renderer?.domElement?.removeAttribute?.("data-roots-tree");
    unbind(); trigger.onBeforeRender = before; trigger.onAfterRender = after;
    group.removeFromParent();
    for (const asset of assets.values()) asset.dispose(); assets.clear(); group.clear();
    fallback.visible = true; detail.value = 0; placement.onDetail?.(false);
  } };
}
