import { Vector3 } from "three";

export interface BirdAgent {
  readonly home: Vector3;
  readonly phase: number;
  readonly perched: boolean;
  readonly gull: boolean;
  readonly position: Vector3;
  readonly previous: Vector3;
  flight: number;
  returning: boolean;
  yaw: number;
}

export function createBirdAgent(home: Vector3, phase: number, perched = false, gull = false): BirdAgent {
  return { home, phase, perched, gull, position: home.clone(), previous: home.clone(), flight: perched ? 0 : 1, returning: false, yaw: phase };
}

/** Proximity flush, climbing departure, circling and eased landing. No wall clock. */
export function stepBird(bird: BirdAgent, seconds: number, dt: number, player: Readonly<Vector3>) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const distance = Math.hypot(player.x - bird.home.x, player.z - bird.home.z);
  if (bird.perched) {
    if (distance < 4.2) bird.returning = false;
    else if (bird.flight >= 1 && distance > 13) bird.returning = true;
    if (distance < 4.2 || bird.flight > 0) bird.flight = Math.max(0, Math.min(1, bird.flight + (bird.returning ? -1 : 1) * dt / (bird.returning ? 5 : 2.4)));
  }
  const p = seconds * (bird.gull ? 0.14 : 0.28) + bird.phase;
  const spread = bird.gull ? 14 : 7;
  const blend = bird.flight * bird.flight * (3 - 2 * bird.flight);
  bird.previous.copy(bird.position);
  bird.position.set(
    bird.home.x + (Math.sin(p) * spread + Math.sin(p * 2.3) * 1.8) * blend,
    bird.home.y + (bird.perched ? 5 * blend : 0) + Math.sin(p * 1.7) * 1.4 * blend,
    bird.home.z + Math.cos(p) * spread * 0.65 * blend,
  );
  if (bird.position.distanceToSquared(bird.previous) > 0.000001) bird.yaw = Math.atan2(bird.position.x - bird.previous.x, bird.position.z - bird.previous.z);
}
