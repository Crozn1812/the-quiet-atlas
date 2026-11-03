import { Raycaster, Vector3, type Mesh } from "three";
import { HALF_HEIGHT, HEIGHT, RADIUS, SLOPE_LIMIT, type Controller } from "./scene";
/** Experimental upright capsule: sampled swept sphere rays + five support rays.
 * Finite samples can miss corners; this is deliberately a comparison spike. */
export async function createController(obstacles: Mesh[]): Promise<Controller> {
  const position = new Vector3(0, HEIGHT + 0.02, 4);
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  let velocity = 0;
  let grounded = false;
  return {
    position,
    get grounded() {
      return grounded;
    },
    get verticalVelocity() {
      return velocity;
    },
    teleport(target) {
      position.copy(target);
      velocity = 0;
      grounded = false;
    },
    step(x, z, dt) {
      const delta = new Vector3(x * dt, 0, z * dt);
      const distance = delta.length();
      if (distance > 0) {
        const direction = delta.clone().normalize();
        let travel = distance;
        for (const y of [-HALF_HEIGHT, 0, HALF_HEIGHT]) {
          for (const side of [-RADIUS, 0, RADIUS]) {
            const origin = position.clone().add(new Vector3(-direction.z * side, y, direction.x * side));
            ray.set(origin, direction);
            ray.far = distance + RADIUS;
            const hit = ray.intersectObjects(obstacles, false)[0];
            if (hit && hit.face) {
              const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
              if (normal.y < Math.cos(SLOPE_LIMIT)) travel = Math.min(travel, Math.max(0, hit.distance - RADIUS - 0.01));
            }
          }
        }
        position.addScaledVector(direction, travel);
      }
      grounded = false;
      velocity -= 9.81 * dt;
      position.y += velocity * dt;
      let support = -Infinity;
      for (const [dx, dz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
        ray.set(new Vector3(position.x + dx!, position.y - HEIGHT + 0.3, position.z + dz!), down);
        ray.far = 0.6;
        const hit = ray.intersectObjects(obstacles, false)[0];
        if (hit?.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y >= Math.cos(SLOPE_LIMIT)) support = Math.max(support, hit.point.y);
      }
      if (velocity <= 0 && position.y - HEIGHT <= support + 0.25) {
        position.y = support + HEIGHT + 0.01;
        velocity = 0;
        grounded = true;
      }
    },
    resetVelocity() {
      velocity = 0;
    },
    dispose() {},
  };
}
