import type { Position } from "../../state/session";
import type { SecretId } from "../journal/model";
import { pathPointAt, pathRiverTAt } from "../world/layout/path";
import { riverTangentAt } from "../world/layout/river";
import { worldHeight } from "../world/terrain/height";

export interface Secret {
  readonly id: SecretId;
  readonly position: Readonly<Position>;
  readonly radius: 2.5;
  readonly landmark: "vine-arch-mirror" | "wind-chime" | "faint-trail" | "bench";
}

/** Signed lateral metres from the route; Y always follows the shared terrain. */
function offPath(t: number, offset: number): Readonly<Position> {
  const path = pathPointAt(t);
  const tangent = riverTangentAt(pathRiverTAt(t));
  const x = path.x - tangent.z * offset;
  const z = path.z + tangent.x * offset;
  return Object.freeze({ x, y: worldHeight(x, z), z });
}

// Scenery only: no signposts or teleport destinations for these detours.
export const SECRETS: readonly Secret[] = Object.freeze([
  // Across the stream from Roots: a round mirror, vines and orange flowers.
  Object.freeze({ id: "reflection", position: offPath(0.19, -24), radius: 2.5, landmark: "vine-arch-mirror" }),
  // A forest pocket between Workshop and Milestones, away from the main route.
  Object.freeze({ id: "forgotten-sound", position: offPath(0.165, 28), radius: 2.5, landmark: "wind-chime" }),
  // A faint spur leading out from Old Trail's hill.
  Object.freeze({ id: "unmarked-road", position: offPath(0.5, -26), radius: 2.5, landmark: "faint-trail" }),
  // The wooden bench sits just outside Quiet Shore's content area.
  Object.freeze({ id: "unwritten-page", position: offPath(0.89, 24), radius: 2.5, landmark: "bench" }),
]);

/** Inclusive 3D radius, in world metres. Invalid positions cannot activate secrets. */
export function nearestSecret(position: Readonly<Position>): Secret | null {
  if (![position.x, position.y, position.z].every(Number.isFinite)) return null;
  // Preserve inclusive boundaries despite subtraction roundoff in world coordinates.
  const tolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(position.x), Math.abs(position.y), Math.abs(position.z));
  let nearest: Secret | null = null;
  let distance = Infinity;
  for (const secret of SECRETS) {
    const candidate = Math.hypot(
      position.x - secret.position.x,
      position.y - secret.position.y,
      position.z - secret.position.z,
    );
    if (candidate <= secret.radius + tolerance && candidate < distance) {
      nearest = secret;
      distance = candidate;
    }
  }
  return nearest;
}
