import { Color, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, MeshDepthMaterial, MeshDistanceMaterial, Object3D, Ray, RGBADepthPacking, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { TRUNK_HEIGHT } from "./colliders";
import type { FoliageTree } from "./scatter";
import { BROADLEAF_BATCH_SEEDS, BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, pineHeight, PINE_VARIANT_SEEDS } from "./shapes";

export { createBroadleafCrown, createPineCrown } from "./shapes";

/** Position-only hash: selection survives input ordering, streaming and quality changes. */
export function foliageVariantAt(x: number, z: number, count: number): number {
  let hash = 2166136261;
  const key = `${x}:${z}`;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) % count;
}

/** Independent hash buckets keep ~30% deep crowns stable through streaming/LOD. */
export function isDeepCrown(x: number, z: number): boolean {
  return foliageVariantAt(x, z, 100) < 30;
}

export function hasHangingFoliage(x: number, z: number): boolean {
  return foliageVariantAt(z + 19.73, x - 41.19, 100) < 40;
}

/** Use the same geometry selection in the colour and existing shadow passes.
 * Two absolute shape deltas avoid extra batches or morph textures. */
function installTreeShapes(material: Material) {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.vertexShader = `attribute vec2 treeStyle;
attribute vec3 shapeA; attribute vec3 shapeB;
attribute vec3 normalA; attribute vec3 normalB;
attribute float hanging;
float treeA() { return step(0.5, treeStyle.x) - step(1.5, treeStyle.x); }
float treeB() { return step(1.5, treeStyle.x); }
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal += normalA * treeA() + normalB * treeB();")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
transformed += shapeA * treeA() + shapeB * treeB();
// Collapse every ribbon vertex to the same point on trees without vines.
transformed *= 1.0 - hanging * (1.0 - treeStyle.y);`);
  };
  material.customProgramCacheKey = () => previousKey() + "|forest-shapes-v1";
}

/**
 * The legacy camera selector uses a fixed sphere at the collider top (5 m).
 * Test the three sight segments against each actual crown's local bounding box
 * instead, so tall crowns, lean, scale and parent transforms need no new threshold.
 * Returned indices belong to this mesh, including after quality compaction.
 */
export function selectFoliageOccludingCrowns(crowns: InstancedMesh, camera: Vector3, player: Vector3): number[] {
  if (!crowns.geometry.boundingBox) crowns.geometry.computeBoundingBox();
  const bounds = crowns.geometry.boundingBox!;
  crowns.updateWorldMatrix(true, false);
  const inverse = new Matrix4();
  const start = new Vector3(), end = new Vector3(), hit = new Vector3();
  const ray = new Ray();
  const selected: number[] = [];
  for (let i = 0; i < crowns.count; i++) {
    crowns.getMatrixAt(i, inverse);
    inverse.premultiply(crowns.matrixWorld).invert();
    start.copy(camera).applyMatrix4(inverse);
    for (const offset of [-0.65, 0, 0.65]) {
      end.copy(player);
      end.y += offset;
      end.applyMatrix4(inverse);
      const length = end.distanceTo(start);
      if (length === 0) continue;
      ray.set(start, end.sub(start).divideScalar(length));
      if (bounds.containsPoint(start) || (ray.intersectBox(bounds, hit) && start.distanceTo(hit) < length)) {
        selected.push(i);
        break;
      }
    }
  }
  return selected;
}

/** Capacity is per species. Overflow throws before changing the current scene. */
export function createFoliage(maxPerKind: number) {
  if (!Number.isSafeInteger(maxPerKind) || maxPerKind < 0) throw new RangeError("Foliage capacity must be a non-negative integer");
  const group = new Group();
  const trunkGeometry = createTreeTrunk(true);
  const trunkMaterial = createRampMaterial(RAMP_PRESETS.trunk);
  trunkMaterial.vertexColors = true;
  const crownMaterial = createRampMaterial(RAMP_PRESETS.crown);
  crownMaterial.vertexColors = true;
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const distanceMaterial = new MeshDistanceMaterial();
  for (const material of [crownMaterial, depthMaterial, distanceMaterial]) installTreeShapes(material);
  const neutral = new Color(1, 1, 1);
  // Instance colours multiply the shared ramp colour; compensate in linear RGB.
  const deep = new Color(PALETTE.forestDeep);
  deep.setRGB(deep.r / crownMaterial.color.r, deep.g / crownMaterial.color.g, deep.b / crownMaterial.color.b);
  function createSpecies(seeds: readonly number[], broadleaf: boolean) {
    const variants = seeds.map(seed => {
      const geometry = broadleaf ? createBroadleafCrown() : createPineCrown(seed);
      const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
      for (const [targetIndex, suffix] of [[1, "A"], [2, "B"]] as const) {
        const target = broadleaf ? createBroadleafCrown(BROADLEAF_VARIANT_SEEDS[targetIndex]) : undefined;
        for (const [source, attribute] of [[position, "shape"], [normal, "normal"]] as const) {
          const values = new Float32Array(source.count * 3);
          if (target) {
            const end = target.getAttribute(attribute === "shape" ? "position" : "normal");
            for (let i = 0; i < values.length; i++) values[i] = end.array[i]! - source.array[i]!;
          }
          geometry.setAttribute(attribute + suffix, new Float32BufferAttribute(values, 3));
        }
        if (target) { geometry.boundingBox!.union(target.boundingBox!); target.dispose(); }
      }
      if (!broadleaf) geometry.setAttribute("hanging", new Float32BufferAttribute(new Float32Array(position.count), 1));
      // Bounds include all three real silhouettes; camera selection stays conservative.
      geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
      geometry.setAttribute("treeStyle", new InstancedBufferAttribute(new Float32Array(maxPerKind * 2), 2));
      const crowns = new InstancedMesh(geometry, crownMaterial, maxPerKind);
      crowns.customDepthMaterial = depthMaterial;
      crowns.customDistanceMaterial = distanceMaterial;
      return { seed, trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind), crowns };
    });
    // Legacy material access targets variant zero; all variants share those materials.
    return { trunks: variants[0]!.trunks, crowns: variants[0]!.crowns, variants };
  }
  const species = {
    pine: createSpecies(PINE_VARIANT_SEEDS, false),
    broadleaf: { ...createSpecies(BROADLEAF_BATCH_SEEDS, true), shapeSeeds: BROADLEAF_VARIANT_SEEDS },
  };
  const meshes = Object.values(species).flatMap(({ variants }) => variants.flatMap(({ trunks, crowns }) => [trunks, crowns]));
  for (const mesh of meshes) {
    mesh.count = 0;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let trees: readonly FoliageTree[] = [];
  let quality: Quality = "High";
  let disposed = false;
  const transform = new Object3D();
  function update() {
    if (disposed) throw new Error("Foliage has been disposed");
    for (const mesh of meshes) mesh.count = 0;
    const count = Math.round(trees.length * PRESETS[quality].density);
    // Stratified selection spans all tiles and species; total count is exact.
    for (let i = 0; i < count; i++) {
      const tree = trees[Math.floor((i + 0.5) * trees.length / count)]!;
      const { variants } = species[tree.kind];
      const { seed, trunks, crowns } = variants[foliageVariantAt(tree.x, tree.z, variants.length)]!;
      const index = trunks.count++;
      crowns.count++;
      // Scatter varies scale from 0.8 to 1.3. Limit pine height to 14–18 m while
      // retaining its width variation and leaving every physics cylinder alone.
      const nominalHeight = pineHeight(seed);
      const heightScale = tree.kind === "pine" ? Math.max(14, Math.min(18, nominalHeight * tree.scale)) / nominalHeight : tree.scale;
      const anchorHeight = TRUNK_HEIGHT * heightScale;
      // Extend the visual trunk slightly into the crown to hide the join.
      const height = tree.kind === "pine" ? nominalHeight * (2 / 3 + 0.05) * heightScale : anchorHeight;
      transform.rotation.set(0, 0, tree.lean);
      transform.position.set(tree.x - Math.sin(tree.lean) * height / 2, tree.y + Math.cos(tree.lean) * height / 2, tree.z);
      transform.scale.set(1, height, 1);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x - Math.sin(tree.lean) * anchorHeight, tree.y + Math.cos(tree.lean) * anchorHeight, tree.z);
      transform.scale.set(tree.scale, heightScale, tree.scale);
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      crowns.setColorAt(index, isDeepCrown(tree.x, tree.z) ? deep : neutral);
      const style = crowns.geometry.getAttribute("treeStyle");
      style.setXY(index, tree.kind === "broadleaf" ? foliageVariantAt(tree.x, tree.z, BROADLEAF_VARIANT_SEEDS.length) : 0,
        tree.kind === "broadleaf" && hasHangingFoliage(tree.x, tree.z) ? 1 : 0);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const style = mesh.geometry.getAttribute("treeStyle");
      if (style) style.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }
  return {
    group,
    species,
    setTiles(next: readonly FoliageTree[]) {
      if (disposed) throw new Error("Foliage has been disposed");
      for (const kind of ["pine", "broadleaf"] as const) {
        if (next.filter(tree => tree.kind === kind).length > maxPerKind) throw new RangeError(`Foliage capacity exceeded: ${kind}`);
      }
      trees = next.map(tree => ({ ...tree }));
      update();
    },
    setQuality(next: Quality) {
      if (disposed) throw new Error("Foliage has been disposed");
      quality = next;
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      trees = [];
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.count = 0; mesh.dispose(); }
      trunkGeometry.dispose();
      for (const { variants } of Object.values(species)) {
        for (const { crowns } of variants) crowns.geometry.dispose();
      }
      trunkMaterial.dispose();
      crownMaterial.dispose();
      depthMaterial.dispose();
      distanceMaterial.dispose();
      // Ramp gradients are shared and owned by the world, not this factory.
    },
  };
}
