import { ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Object3D } from "three";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { TRUNK_HEIGHT, TRUNK_RADIUS } from "./colliders";
import type { FoliageTree } from "./scatter";

/** Capacity is per species. Overflow throws before changing the current scene. */
export function createFoliage(maxPerKind: number) {
  if (!Number.isSafeInteger(maxPerKind) || maxPerKind < 0) throw new RangeError("Foliage capacity must be a non-negative integer");
  const group = new Group();
  const trunkGeometry = new CylinderGeometry(TRUNK_RADIUS, TRUNK_RADIUS, 1, 6);
  const trunkMaterial = createRampMaterial(RAMP_PRESETS.trunk);
  const crownMaterial = createRampMaterial(RAMP_PRESETS.crown);
  const species = {
    pine: {
      trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind),
      crowns: new InstancedMesh(new ConeGeometry(1.8, 4, 7), crownMaterial, maxPerKind),
    },
    broadleaf: {
      trunks: new InstancedMesh(trunkGeometry, trunkMaterial, maxPerKind),
      crowns: new InstancedMesh(new IcosahedronGeometry(2, 0), crownMaterial, maxPerKind),
    },
  };
  const meshes = Object.values(species).flatMap(({ trunks, crowns }) => [trunks, crowns]);
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
      const { trunks, crowns } = species[tree.kind];
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
      species.pine.crowns.geometry.dispose();
      species.broadleaf.crowns.geometry.dispose();
      trunkMaterial.dispose();
      crownMaterial.dispose();
      // Ramp gradients are shared and owned by the world, not this factory.
    },
  };
}
