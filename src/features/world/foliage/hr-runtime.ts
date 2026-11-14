import { Box3, BufferGeometry, Color, Frustum, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, Scene, Sphere, Vector2, Vector3, type Material, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { acquireHrTree, type HrAsset } from "./hr-library";
import { installHrMaterial } from "./hr-material";
import { chooseHrTrees, hrLeafTint, hrTreeLod, treeRandom, type HrTreeId } from "./hr-variation";
import { createHrUnderstorey } from "./hr-understorey";

const clocks = new WeakMap<Scene, Vector2>();
const cadence = new WeakMap<Scene, { last: number; slowFrames: number; constrained: boolean }>();
const softwareRenderers = new WeakMap<WebGLRenderer, boolean>();
function usesSoftwareRasterizer(renderer: WebGLRenderer) {
  let software = softwareRenderers.get(renderer);
  if (software === undefined) {
    const gl = renderer.getContext?.();
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
    software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name);
    softwareRenderers.set(renderer, software);
  }
  return software;
}
// In-memory world ownership, including unloaded tiles. Neighbours on opposite
// tile/grove boundaries participate in the same solve and keep their choice on
// revisit. The entire registry dies with its Scene; nothing is persisted.
const neighbourhoods = new WeakMap<Scene, Map<string, { x: number; z: number; id: HrTreeId }>>();
export function advanceHrTrees(meshes: readonly Mesh[], dt: number, reducedMotion: boolean) {
  let root = meshes[0]?.parent;
  while (root && !(root instanceof Scene)) root = root.parent;
  if (!(root instanceof Scene) || dt <= 0) return;
  const now = performance.now();
  let timing = cadence.get(root);
  if (!timing) { timing = { last: now, slowFrames: 0, constrained: false }; cadence.set(root, timing); }
  const elapsed = now - timing.last; timing.last = now;
  // Sustained slow rendering needs coarser geometry even with High textures.
  // Ignore suspension gaps, and use hysteresis so a decoder/upload spike does
  // not repeatedly switch LODs. This also serves weak hardware renderers.
  if (elapsed > 0 && elapsed < 2000) {
    timing.slowFrames = Math.max(0, Math.min(8, timing.slowFrames + (elapsed > 100 ? 1 : -1)));
    if (timing.slowFrames >= 3) timing.constrained = true;
    else if (timing.slowFrames === 0 && elapsed < 45) timing.constrained = false;
  }
  let clock = clocks.get(root);
  if (!clock) { clock = new Vector2(); clocks.set(root, clock); }
  clock.y = reducedMotion ? 0 : 1;
  if (!reducedMotion && Number.isFinite(dt)) clock.x += Math.max(0, dt);
}
interface Site { x: number; z: number; source: InstancedMesh; index: number; matrix: Matrix4; bounds: Sphere; visible: boolean; id: HrTreeId; phase: number; tint: Color; level: number; canopy: boolean }
interface Batch { group: Group; meshes: InstancedMesh[]; sites: Site[]; active: Site[]; fits: Map<InstancedMesh, Matrix4>; level: number }

/** Bind to the existing tile factories. The procedural forest remains playable
 * during streaming and is also the complete Low/network-failure path. */
export function bindHrForest(fallbacks: readonly InstancedMesh[], options: { canopyOnly?: boolean } = {}) {
  let quality: Quality = "High", disposed = false, revision = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let sites: Site[] = [], clock = new Vector2(), lastFrame = -1;
  const group = new Group(); group.name = "hr-tree2-streamed";
  const batches = new Map<string, Batch>();
  const leases = new Map<string, ReturnType<typeof acquireHrTree>>();
  const failed = new Set<string>();
  let understorey: ReturnType<typeof createHrUnderstorey> | undefined;
  const materialBackups = fallbacks.map(mesh => mesh.material);
  const shadowBackups = fallbacks.map(mesh => [mesh.customDepthMaterial, mesh.customDistanceMaterial] as const);
  const callbacks = fallbacks.map(mesh => mesh.onAfterRender);
  let masked = false, residencyDirty = true, lastConstrained = false;
  function maskFallback(material: Material) {
    const hook = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      hook(shader, renderer);
      shader.vertexShader = "attribute float hrReplaced; varying float vHrReplaced;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvHrReplaced = hrReplaced;");
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nif (hrReplaced > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);");
      shader.fragmentShader = "varying float vHrReplaced;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", "if (vHrReplaced > 0.5) discard;\n#include <clipping_planes_fragment>");
    };
    material.customProgramCacheKey = () => key() + "|hr-replaced";
  }
  const replaced = fallbacks.map(mesh => {
    const attribute = new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count), 1);
    mesh.geometry.setAttribute("hrReplaced", attribute);
    return attribute;
  });
  const nextReplaced = replaced.map(a => new Float32Array(a.count));
  function maskFallbacks() {
    if (masked) return;
    masked = true;
    for (const mesh of fallbacks) {
      const material = (mesh.material as Material).clone();
      const original = mesh.material as Material;
      material.onBeforeCompile = original.onBeforeCompile; material.customProgramCacheKey = original.customProgramCacheKey;
      maskFallback(material);
      mesh.material = material;
      const depth = mesh.customDepthMaterial?.clone() ?? new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      const distance = mesh.customDistanceMaterial?.clone() ?? new MeshDistanceMaterial();
      maskFallback(depth); maskFallback(distance); mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = distance;
    }
  }
  function clearBatches() {
    understorey?.dispose(); understorey = undefined;
    for (const batch of batches.values()) {
      batch.group.removeFromParent();
      for (const mesh of batch.meshes) {
        mesh.dispose(); mesh.geometry.dispose();
        (mesh.material as Material).dispose(); mesh.customDepthMaterial?.dispose(); mesh.customDistanceMaterial?.dispose();
      }
    }
    batches.clear();
    for (const lease of leases.values()) lease.release(); leases.clear(); failed.clear();
    replaced.forEach(a => { a.array.fill(0); a.needsUpdate = true; });
  }
  function collect(scene: Scene) {
    sites = [];
    for (const mesh of fallbacks) for (let i = 0; i < mesh.count; i++) {
      const matrix = new Matrix4(); mesh.getMatrixAt(i, matrix);
      const p = new Vector3().setFromMatrixPosition(matrix);
      // Additional independent yaw, aspect and slight rooted tilt distinguish
      // neighbouring instances even when they share an architecture.
      matrix.multiply(new Matrix4().makeRotationY(treeRandom(p.x, p.z, 51) * Math.PI * 2));
      matrix.multiply(new Matrix4().makeRotationX((treeRandom(p.x, p.z, 53) - 0.5) * 0.035));
      matrix.scale(new Vector3(0.94 + treeRandom(p.x, p.z, 55) * 0.14, 0.97 + treeRandom(p.x, p.z, 57) * 0.08, 0.94 + treeRandom(p.x, p.z, 59) * 0.14));
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const bounds = mesh.geometry.boundingSphere!.clone().applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld);
      bounds.radius += 0.5;
      sites.push({ x: p.x, z: p.z, source: mesh, index: i, matrix, bounds, visible: true, id: "hr-tree-spreading-crown", phase: treeRandom(p.x, p.z, 71), tint: hrLeafTint(p.x, p.z), level: -1, canopy: !!options.canopyOnly || new Vector3().setFromMatrixScale(matrix).y > 2 });
    }
    let registry = neighbourhoods.get(scene);
    if (!registry) { registry = new Map(); neighbourhoods.set(scene, registry); }
    const namespace = options.canopyOnly ? "roof" : "tree";
    const neighbours = [...registry.entries()].filter(([key]) => key.startsWith(namespace + ":")).map(([, value]) => value);
    const ids = chooseHrTrees(sites, neighbours);
    sites.forEach((s, i) => { s.id = ids[i]!; registry.set(`${namespace}:${s.x}:${s.z}`, { x: s.x, z: s.z, id: s.id }); });
  }
  function createBatch(asset: HrAsset, selected: Site[], level: number): Batch {
    maskFallbacks(); residencyDirty = true;
    const source = selected[0]!.source;
    const parts = options.canopyOnly ? asset.parts.filter(p => p.leaf && !p.vine) : asset.parts;
    const originalBounds = options.canopyOnly ? parts.reduce((b, p) => b.union(p.geometry.boundingBox!), new Box3()) : asset.bounds;
    const old = originalBounds.getSize(new Vector3()), fits = new Map<InstancedMesh, Matrix4>();
    // Preserve the root at (0,0,0). Height and canopy spread follow the existing
    // approved envelope, retaining the FL-03 roof and physics root positions.
    const id = selected[0]!.id;
    // A source variant changes only the instance fit, not the draw's geometry
    // or material. Share one architecture/LOD batch across those variants.
    for (const source of new Set(selected.map(site => site.source))) {
      source.geometry.computeBoundingBox();
      const target = source.geometry.boundingBox!, size = target.getSize(new Vector3());
      const fit = new Matrix4().makeScale(size.x / old.x, size.y / old.y, size.z / old.z);
      if (!options.canopyOnly && (id.includes("dead") || id.includes("bamboo"))) {
        const scale = size.y / old.y;
        fit.makeScale(Math.min(size.x / old.x, scale), scale, Math.min(size.z / old.z, scale));
      }
      if (!options.canopyOnly && id.includes("fallen")) {
        const scale = Math.min(size.x / old.x, size.z / old.z, 1.2);
        fit.makeScale(scale, scale, scale);
      }
      if (options.canopyOnly) {
        const center = target.getCenter(new Vector3()), origin = originalBounds.getCenter(new Vector3());
        fit.premultiply(new Matrix4().makeTranslation(center.x, center.y, center.z)).multiply(new Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
      }
      fits.set(source, fit);
    }
    const batchGroup = new Group(); batchGroup.name = `${selected[0]!.id}-lod${level}`;
    const meshes = parts.map(part => {
      const geometry = new BufferGeometry();
      geometry.setIndex(part.geometry.index);
      for (const [name, attribute] of Object.entries(part.geometry.attributes)) geometry.setAttribute(name, attribute);
      geometry.boundingBox = part.geometry.boundingBox?.clone() ?? null;
      geometry.boundingSphere = part.geometry.boundingSphere?.clone() ?? null;
      geometry.setAttribute("hrTint", new InstancedBufferAttribute(new Float32Array(selected.length * 3), 3));
      geometry.setAttribute("hrSeed", new InstancedBufferAttribute(new Float32Array(selected.length), 1));
      geometry.setAttribute("hrFade", new InstancedBufferAttribute(new Float32Array(selected.length), 1));
      const material = level === 2 ? new MeshBasicMaterial({ map: (part.material as MeshBasicMaterial).map, alphaTest: 0.42, side: part.material.side }) : part.material.clone();
      material.name = `hr-tree2-${part.vine ? "vine" : part.leaf ? "leaf" : "bark"}`;
      installHrMaterial(material, clock, part.leaf, part.vine, level === 2);
      if (level === 2) {
        const hook = material.onBeforeCompile.bind(material);
        material.onBeforeCompile = (shader, renderer) => { hook(shader, renderer); shader.uniforms.hrCenter = { value: asset.center }; };
      }
      const mesh = new InstancedMesh(geometry, material, selected.length);
      mesh.matrixAutoUpdate = false;
      mesh.onBeforeRender = (renderer, scene, camera) => refresh(renderer, scene, camera);
      mesh.count = 0; mesh.castShadow = source.castShadow && level === 0; mesh.receiveShadow = source.receiveShadow && level < 2;
      if (level < 2) {
        const map = (material as MeshBasicMaterial).map;
        const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest: part.leaf ? 0.42 : 0, side: material.side });
        const distance = new MeshDistanceMaterial({ map, alphaTest: part.leaf ? 0.42 : 0, side: material.side });
        installHrMaterial(depth, clock, part.leaf, part.vine); installHrMaterial(distance, clock, part.leaf, part.vine);
        mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = distance;
      }
      batchGroup.add(mesh); return mesh;
    });
    group.add(batchGroup);
    return { group: batchGroup, meshes, sites: selected, active: [], fits, level };
  }
  function request(renderer: WebGLRenderer, selected: Site[], level: number) {
    const key = `${selected[0]!.id}:${level}`;
    if (leases.has(key) || failed.has(key)) return;
    const generation = revision;
    const lease = acquireHrTree(renderer, selected[0]!.id, level); leases.set(key, lease);
    void lease.ready.then(asset => {
      if (disposed || generation !== revision || quality === "Low") return;
      batches.set(key, createBatch(asset, selected, level));
    }).catch(() => { if (!disposed && generation === revision) failed.add(key); });
  }
  const position = new Vector3(), eye = new Vector3(), matrix = new Matrix4(), frustum = new Frustum();
  const lastEye = new Vector3(Infinity, Infinity, Infinity), lastView = new Matrix4();
  function refresh(renderer: WebGLRenderer, scene: Scene, camera: import("three").Camera) {
    if (disposed || quality === "Low" || !clocks.has(scene) || renderer.info.render.frame === lastFrame) return;
    // PBR leaf overdraw and first-use texture/program uploads starve simulation
    // on CPU rasterizers, even at coarse geometry LOD. Keep the complete static
    // procedural forest here, as on Low, before requesting/compiling HR assets.
    // This is a renderer capability path, independent of UA, quality pin or QA.
    if (usesSoftwareRasterizer(renderer)) return;
    // Active simulation also ticks during the cinematic. Network/GPU upgrades
    // wait until the real viewport has handed control back and finished dressing.
    const viewport = renderer.domElement?.closest<HTMLElement>(".world-viewport");
    if (viewport && (viewport.dataset.worldIntro !== "done" || viewport.dataset.worldBuild !== "done")) return;
    lastFrame = renderer.info.render.frame;
    clock = clocks.get(scene)!;
    const constrained = cadence.get(scene)?.constrained ?? false;
    if (!sites.length) collect(scene);
    if (!group.parent) fallbacks[0]?.parent?.add(group);
    eye.setFromMatrixPosition(camera.matrixWorld);
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const moved = lastEye.distanceToSquared(eye) >= 0.25;
    const turned = matrix.elements.some((value, i) => i % 4 !== 3 && i < 12 && Math.abs(value - lastView.elements[i]!) > 0.015);
    if (residencyDirty || moved || turned || constrained !== lastConstrained) {
      residencyDirty = false; lastEye.copy(eye); lastView.copy(matrix); lastConstrained = constrained;
      frustum.setFromProjectionMatrix(matrix);
      understorey?.update(eye, quality === "High");
      const pending = new Map<string, { sites: Site[]; level: number }>();
      for (const site of sites) {
        position.setFromMatrixPosition(site.matrix).applyMatrix4(site.source.matrixWorld);
        const distance = Math.hypot(position.x - eye.x, position.z - eye.z);
        site.level = hrTreeLod(distance, quality === "High", site.level);
        if (constrained && site.level >= 0) site.level = distance < 28 ? 1 : 2;
        site.visible = frustum.intersectsSphere(site.bounds);
        // A roof is a crown slice, not a whole-tree billboard with a floating stem.
        if (options.canopyOnly && site.level === 2) site.level = 1;
        if (site.level < 0 || !site.visible) continue;
        const key = `${site.id}:${site.level}`;
        let entry = pending.get(key);
        if (!entry) { entry = { sites: sites.filter(s => s.id === site.id), level: site.level }; pending.set(key, entry); }
      }
      // Yield to paint; the serial decoder queue requests only currently needed LODs.
      if (timer === undefined && [...pending.keys()].some(k => !leases.has(k) && !failed.has(k))) timer = setTimeout(() => {
        timer = undefined; if (disposed || quality === "Low") return;
        if (!understorey && !options.canopyOnly) { understorey = createHrUnderstorey(sites, clock); group.add(understorey.group); }
        for (const entry of [...pending.values()].sort((a, b) => a.level - b.level)) request(renderer, entry.sites, entry.level);
      }, 0);
    }
    nextReplaced.forEach(a => a.fill(0));
    for (const batch of batches.values()) {
      const active = batch.sites.filter(site => site.level === batch.level && site.visible);
      const changed = active.length !== batch.active.length || active.some((site, i) => site !== batch.active[i]);
      let faded = false;
      let count = 0;
      for (const site of active) {
        if (changed) matrix.copy(site.matrix).multiply(batch.fits.get(site.source)!);
        const fade = site.source.geometry.getAttribute("crownAlpha")?.getX(site.index) ?? 1;
        for (const mesh of batch.meshes) {
          if (changed) {
            mesh.setMatrixAt(count, matrix);
            mesh.geometry.getAttribute("hrTint").setXYZ(count, site.tint.r, site.tint.g, site.tint.b);
            mesh.geometry.getAttribute("hrSeed").setX(count, site.phase);
          }
          const alpha = mesh.geometry.getAttribute("hrFade");
          if (alpha.getX(count) !== fade) { alpha.setX(count, fade); faded = true; }
        }
        nextReplaced[fallbacks.indexOf(site.source)]![site.index] = 1; count++;
      }
      for (const mesh of batch.meshes) {
        if (changed) {
          mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
          for (const name of ["hrTint", "hrSeed"]) mesh.geometry.getAttribute(name).needsUpdate = true;
          mesh.computeBoundingBox(); mesh.computeBoundingSphere();
          if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.3;
        }
        if (faded) mesh.geometry.getAttribute("hrFade").needsUpdate = true;
      }
      batch.active = active;
    }
    replaced.forEach((a, i) => {
      const next = nextReplaced[i]!;
      if (next.some((value, index) => value !== a.getX(index))) { a.array.set(next); a.needsUpdate = true; }
    });
  }
  fallbacks.forEach((mesh, i) => { mesh.onAfterRender = function (renderer, scene, camera, ...args) {
    callbacks[i]!.call(this, renderer, scene, camera, ...args); refresh(renderer, scene, camera);
  }; });
  return {
    setQuality(next: Quality) {
      if (quality === next) return;
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      quality = next; revision++; clearBatches(); sites = []; lastFrame = -1; residencyDirty = true;
    },
    dispose() {
      if (disposed) return; disposed = true; revision++;
      if (timer !== undefined) clearTimeout(timer);
      clearBatches(); group.removeFromParent();
      fallbacks.forEach((mesh, i) => {
        mesh.onAfterRender = callbacks[i]!;
        if (masked) {
          (mesh.material as Material).dispose(); mesh.material = materialBackups[i]!;
          mesh.customDepthMaterial?.dispose(); mesh.customDistanceMaterial?.dispose();
          [mesh.customDepthMaterial, mesh.customDistanceMaterial] = shadowBackups[i]!;
        }
        mesh.geometry.deleteAttribute("hrReplaced");
      });
    },
  };
}
