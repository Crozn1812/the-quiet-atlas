import { Color, Group, InstancedMesh, Matrix4, Object3D, Ray, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { TRUNK_HEIGHT } from "./colliders";
import type { FoliageTree } from "./scatter";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, pineHeight, PINE_VARIANT_SEEDS } from "./shapes";

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
  const trunkGeometry = createTreeTrunk();
  const trunkMaterial = createRampMaterial(RAMP_PRESETS.trunk);
  const crownMaterial = createRampMaterial(RAMP_PRESETS.crown);
  crownMaterial.vertexColors = true;
  const neutral = new Color(1, 1, 1);
  // Instance colours multiply the shared ramp colour; compensate in linear RGB.
  const deep = new Color(PALETTE.forestDeep);
  deep.setRGB(deep.r / crownMaterial.color.r, deep.g / crownMaterial.color.g, deep.b / crownMaterial.color.b);
  function createSpecies(seeds: readonly number[], createCrown: (seed: number) => ReturnType<typeof createPineCrown>) {
    const variants = seeds.map(seed => ({
      seed,
      trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind),
      crowns: new InstancedMesh(createCrown(seed), crownMaterial, maxPerKind),
    }));
    // Legacy material access targets variant zero; all variants share those materials.
    return { trunks: variants[0]!.trunks, crowns: variants[0]!.crowns, variants };
  }
  const species = {
    pine: createSpecies(PINE_VARIANT_SEEDS, createPineCrown),
    broadleaf: createSpecies(BROADLEAF_VARIANT_SEEDS, createBroadleafCrown),
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
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      // Ramp gradients are shared and owned by the world, not this factory.
    },
  };
}
