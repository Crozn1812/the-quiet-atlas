import { Group, InstancedMesh, Object3D } from "three";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { TRUNK_HEIGHT } from "./colliders";
import type { FoliageTree } from "./scatter";
import { BROADLEAF_VARIANT_SEEDS, createBroadleafCrown, createPineCrown, createTreeTrunk, PINE_VARIANT_SEEDS } from "./shapes";

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

/** Capacity is per species. Overflow throws before changing the current scene. */
export function createFoliage(maxPerKind: number) {
  if (!Number.isSafeInteger(maxPerKind) || maxPerKind < 0) throw new RangeError("Foliage capacity must be a non-negative integer");
  const group = new Group();
  const trunkGeometry = createTreeTrunk();
  const trunkMaterial = createRampMaterial(RAMP_PRESETS.trunk);
  const crownMaterial = createRampMaterial(RAMP_PRESETS.crown);
  crownMaterial.vertexColors = true;
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
      const { trunks, crowns } = variants[foliageVariantAt(tree.x, tree.z, variants.length)]!;
      const index = trunks.count++;
      crowns.count++;
      const height = TRUNK_HEIGHT * tree.scale;
      transform.rotation.set(0, 0, tree.lean);
      transform.position.set(tree.x - Math.sin(tree.lean) * height / 2, tree.y + Math.cos(tree.lean) * height / 2, tree.z);
      transform.scale.set(1, height, 1);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x - Math.sin(tree.lean) * height, tree.y + Math.cos(tree.lean) * height, tree.z);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
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
