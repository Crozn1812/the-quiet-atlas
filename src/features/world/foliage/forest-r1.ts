import { Color, Group, InstancedMesh, Matrix4, Vector3, type BufferGeometry } from "three";
import { PALETTE } from "../art/palette";
import { hillR1Weight } from "./hill-r1";
import { forestAtmosphereWeight } from "../art/direction";
import { createRampMaterial } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { nearestPath } from "../terrain/samples";
import { createDenseFirstLightTree as createFirstLightTree, firstLightGroveWeight } from "./first-light-grove";
import { foliageVariantAt, selectFoliageOccludingCrowns } from "./instances";
import { createCrownFade } from "../crown-fade";
import type { FoliageTree } from "./scatter";
import { bindHrForest } from "./hr-runtime";

/** Route-distance biome blend, independent of travel direction and zone centres. */
export function forestR1Weight(x: number, z: number, pathT = nearestPath(x, z).t) {
  return Math.max(firstLightGroveWeight(x, z), forestAtmosphereWeight(pathT));
}

/** Stable interleaving at the 40 m biome feather, rather than a row of changing silhouettes. */
export function isForestR1Tree(tree: Pick<FoliageTree, "x" | "z">) {
  return foliageVariantAt(tree.x + 17.3, tree.z - 9.1, 1000) / 1000 < forestR1Weight(tree.x, tree.z);
}

/** Streamed companions to the authored grove: three silhouettes, three draws, no wind pass. */
export function createForestR1Trees(trees: readonly FoliageTree[], options?: {
  geometry: (variant: number) => BufferGeometry;
  name: string;
  scale: (tree: FoliageTree) => readonly [number, number, number];
}) {
  // Warm hill crowns reuse the same three batches and branched silhouettes.
  // Bake once at tile construction; quality changes never resample the route.
  const hillTint = new Color(PALETTE.grass).lerp(new Color(PALETTE.grassDry), 0.28);
  const dawnTint = new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.22).lerp(new Color(PALETTE.mist), 0.12);
  hillTint.setRGB(hillTint.r / dawnTint.r, hillTint.g / dawnTint.g, hillTint.b / dawnTint.b);
  const pigments = trees.map(tree => new Color(1, 1, 1).lerp(hillTint, hillR1Weight(nearestPath(tree.x, tree.z).t)));
  const group = new Group();
  group.name = options?.name ?? "forest-r1-trees";
  const meshes = [0, 1, 2].map(variant => {
    const material = createRampMaterial(0xffffff, { steps: 4, soft: false });
    material.vertexColors = true;
    const mesh = new InstancedMesh((options?.geometry ?? createFirstLightTree)(variant), material, trees.length);
    mesh.name = `${group.name}-${variant}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  const fades = meshes.map(mesh => createCrownFade(mesh, trees.length));
  // Retain three draws per streamed tile. Hill stands use the three conifers;
  // forest stands use the three overlapping broadleaf silhouettes.
  const library = options ? [] : [bindHrForest(meshes)];
  const matrix = new Matrix4(), rotation = new Matrix4();
  function setQuality(quality: Quality) {
    library.forEach(binding => binding.setQuality(quality));
    meshes.forEach(mesh => { mesh.count = 0; });
    const count = Math.round(trees.length * PRESETS[quality].density);
    for (let i = 0; i < count; i++) {
      const index = Math.floor((i + 0.5) * trees.length / count);
      const tree = trees[index]!;
      const mesh = meshes[foliageVariantAt(tree.x, tree.z, 3)]!;
      const scale = tree.scale * (tree.trailCanopy ? 3 : 1);
      matrix.makeRotationY(foliageVariantAt(tree.z, tree.x, 1000) / 1000 * Math.PI * 2);
      rotation.makeRotationZ(tree.lean);
      const weight = forestR1Weight(tree.x, tree.z);
      const axes = options?.scale(tree) ?? [1 + 0.65 * weight, 1 + 0.55 * weight, 1 + 0.65 * weight];
      matrix.premultiply(rotation).scale(new Vector3(scale * axes[0]!, scale * axes[1]!, scale * axes[2]!));
      matrix.setPosition(tree.x, tree.y, tree.z);
      mesh.setColorAt(mesh.count, pigments[index]!);
      mesh.setMatrixAt(mesh.count++, matrix);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    }
  }
  setQuality("High");
  let disposed = false;
  return { group, meshes, setQuality,
    fade(camera: Vector3, player: Vector3, dt: number) {
      meshes.forEach((mesh, i) => {
        // The spring arm cannot reach a remote tile. Avoid its instance transforms entirely.
        const nearby = mesh.boundingBox?.distanceToPoint(camera) ?? Infinity;
        fades[i]!(new Set(nearby < 24 ? selectFoliageOccludingCrowns(mesh, camera, player) : []), dt);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      library.forEach(binding => binding.dispose());
      group.removeFromParent(); group.clear();
      for (const mesh of meshes) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
}
