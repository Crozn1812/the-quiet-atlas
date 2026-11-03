import { Raycaster, Vector3 } from "three";
import { expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { createTerrain, createTerrainMesh, createTrees, createForest, PRESETS, type Quality } from "../../../src/features/world/terrain";
import { addTerrainColliders } from "../../../src/features/world/terrain-colliders";
import { createController } from "../../../src/features/world/rapier";
import { HEIGHT } from "../../../src/features/world/scene";
it("deterministic mesh heights match actual Rapier heightfield and vertical ray hits within 1e-5 m", async () => {
  await RAPIER.init();
  const terrain = createTerrain(), mesh = createTerrainMesh(terrain);
  expect(terrain.heights).toEqual(createTerrain().heights);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    const collider = addTerrainColliders(world, terrain, []);
    world.step();
    expect(collider.heightfieldHeights()).toEqual(terrain.heights);
    for (const [x, z] of [[-17, -19], [5, -8], [11, 13], [0, 4]]) {
      const index = z! + 30 + (x! + 30) * 61;
      const y = mesh.geometry.getAttribute("position").getY(index);
      expect(Math.abs(y - collider.heightfieldHeights()[index]!)).toBeLessThan(1e-5);
      const origin = { x: x! + 0.23, y: 20, z: z! + 0.31 };
      const meshHit = new Raycaster(new Vector3(origin.x, 20, origin.z), new Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
      const hit = world.castRay(new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }), 40, true);
      expect(hit).not.toBeNull();
      expect(Math.abs(20 - hit!.timeOfImpact - meshHit.point.y)).toBeLessThan(1e-5);
    }
  } finally { world.free(); mesh.geometry.dispose(); mesh.material.dispose(); }
});
it("quality uses 40/70/100 percent instances while actual tree colliders remain identical", async () => {
  await RAPIER.init();
  const terrain = createTerrain(), trees = createTrees(terrain);
  expect(trees).toEqual(createTrees(createTerrain()));
  const snapshots = [];
  for (const quality of Object.keys(PRESETS) as Quality[]) {
    const forest = createForest(trees, quality);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      expect(forest.map(mesh => mesh.count)).toEqual([200 * PRESETS[quality].density, 200 * PRESETS[quality].density]);
      addTerrainColliders(world, terrain, trees);
      const snapshot: unknown[] = [];
      world.forEachCollider(collider => snapshot.push({ type: collider.shapeType(), position: collider.translation(), radius: collider.radius(), halfHeight: collider.halfHeight() }));
      expect(snapshot).toHaveLength(201); snapshots.push(snapshot);
    } finally { world.free(); for (const mesh of forest) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } }
  }
  expect(snapshots[0]).toEqual(snapshots[1]); expect(snapshots[1]).toEqual(snapshots[2]);
});
it("Rapier KCC stands on terrain and climbs its continuous ramp", async () => {
  const terrain = createTerrain();
  const controller = await createController(terrain, createTrees(terrain));
  try {
    for (let i = 0; i < 60; i++) controller.step(0, 0, 1 / 60);
    expect(controller.position.y).toBeCloseTo(HEIGHT + 0.01, 1);
    for (let i = 0; i < 240; i++) controller.step(0, -3, 1 / 60);
    expect(controller.position.z).toBeLessThan(-7);
    expect(controller.position.y).toBeGreaterThan(HEIGHT + 0.9);
  } finally { controller.dispose(); }
});
