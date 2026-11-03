import RAPIER from "@dimforge/rapier3d-compat";
import { addTerrainColliders } from "../../../src/features/world/terrain-colliders";
import { expect, it } from "vitest";
import { Vector3 } from "three";
import { createTerrain, createTrees, createForest, updateForest } from "../../../src/features/world/terrain";
import { createController } from "../../../src/features/world/rapier";

it("quality updates existing instances without changing the actual controller position or colliders", async () => {
  const terrain = createTerrain();
  const trees = createTrees(terrain);
  const forest = createForest(trees, "Balanced");
  const controller = await createController(terrain, trees);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  addTerrainColliders(world, terrain, trees);
  const colliderCount = world.colliders.len();
  expect(colliderCount).toBe(201);
  const position = controller.position.clone();
  const matrix = forest[0].instanceMatrix;
  try {
    for (const quality of ["Low", "High", "Balanced"] as const) {
      updateForest(forest, trees, quality);
      expect(forest[0].instanceMatrix).toBe(matrix);
      expect(controller.position).toEqual(position);
      expect(world.colliders.len()).toBe(colliderCount);
      // Probe the same physical trunk at every visual density.
      const tree = trees[199]!;
      controller.teleport(new Vector3(tree.x, tree.y + 0.92, tree.z + 1));
      for (let i = 0; i < 60; i++) controller.step(0, -3, 1 / 60);
      expect(controller.position.z).toBeGreaterThan(tree.z + tree.radius);
      controller.teleport(position);
    }
  } finally {
    controller.dispose();
    world.free();
    for (const mesh of forest) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
  }
});


