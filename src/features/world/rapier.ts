import { addTerrainColliders } from "./terrain-colliders";
import type { Terrain, Trees } from "./terrain";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import { boxes, HALF_HEIGHT, HEIGHT, RADIUS, rotation, SLOPE_LIMIT, type Controller } from "./scene";
export async function createController(terrain?: Terrain, trees: Trees = []): Promise<Controller> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  if (terrain) addTerrainColliders(world, terrain, trees);
  for (const box of terrain ? [] : boxes) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(box.size[0]! / 2, box.size[1]! / 2, box.size[2]! / 2)
      .setTranslation(box.position[0]!, box.position[1]!, box.position[2]!).setRotation(rotation(box.angle)));
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HEIGHT + 0.02, 4));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), body);
  const kcc = world.createCharacterController(0.01);
  kcc.setMaxSlopeClimbAngle(SLOPE_LIMIT);
  kcc.setMinSlopeSlideAngle(SLOPE_LIMIT);
  kcc.enableAutostep(0.3, 0.2, false);
  kcc.enableSnapToGround(0.25);
  world.step();
  let velocity = 0;
  const position = new Vector3().copy(body.translation());
  return {
    position,
    step(x, z, dt) {
      world.timestep = dt;
      velocity = kcc.computedGrounded() ? -0.1 : velocity - 9.81 * dt;
      kcc.computeColliderMovement(capsule, { x: x * dt, y: velocity * dt, z: z * dt });
      const delta = kcc.computedMovement();
      const current = body.translation();
      body.setNextKinematicTranslation({ x: current.x + delta.x, y: current.y + delta.y, z: current.z + delta.z });
      world.step();
      position.copy(body.translation());
    },
    resetVelocity() { velocity = 0; },
    dispose() { world.removeCharacterController(kcc); world.free(); },
  };
}
