import { CubicBezierCurve3, Vector3 } from "three";
import { pathPointAt } from "../layout/path";
import { riverPointAt } from "../layout/river";
import { ZONES } from "../layout/zones";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { CAMERA_CLEARANCE, ease, type CameraPose, type IntroFrame } from "./intro";

export const ENDING_DURATION = 36;

export interface EndingFrame extends IntroFrame {
  /** Additional sunset grade intensity, normalized to [0, 1]. */
  sunsetBoost: number;
}

export interface EndingOptions {
  /** World-space bench origin, including its terrain elevation. */
  bench: Readonly<Vector3>;
  /** Actual final gameplay camera, aimed at Last Postcard; preserved exactly. */
  gameplayPose: CameraPose;
}

function vector(value: Readonly<Vector3>): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

function floorAt(position: Readonly<Vector3>): number {
  return Math.max(worldHeight(position.x, position.z) + CAMERA_CLEARANCE, waterLevelAt(position.z));
}

/** Bezier controls stay inside endpoint bounds; quintic timing stops without overshoot. */
function spline(from: Vector3, to: Vector3): CubicBezierCurve3 {
  return new CubicBezierCurve3(
    from,
    new Vector3(from.x, from.y + (to.y - from.y) / 3, from.z),
    new Vector3(to.x, from.y + (to.y - from.y) * 2 / 3, to.z),
    to,
  );
}

/** Pure seconds-based camera route. No renderer, clock, player mutation or persistence. */
export function createEnding({ bench, gameplayPose }: EndingOptions) {
  const origin = vector(bench);
  const end = { position: vector(gameplayPose.position), target: vector(gameplayPose.target), fov: gameplayPose.fov };
  if (![...origin, ...end.position, ...end.target, end.fov].every(Number.isFinite)
    || end.fov <= 0 || end.fov >= 180 || end.position.distanceToSquared(end.target) < 1e-12) {
    throw new RangeError("Ending needs finite coordinates, a distinct camera target and 0 < fov < 180");
  }
  if (end.position.y < floorAt(end.position)) throw new RangeError("Gameplay camera is below the safe terrain/water floor");

  const postcard = ZONES.find(zone => zone.id === "last-postcard")!;
  const postcardTarget = vector(postcard.position);
  postcardTarget.y = worldHeight(postcardTarget.x, postcardTarget.z);
  const towardPostcard = postcardTarget.clone().sub(end.position);
  if (towardPostcard.lengthSq() < 1e-12
    || end.target.clone().sub(end.position).angleTo(towardPostcard) > 25 * Math.PI / 180) {
    throw new RangeError("Ending gameplay camera must look within 25 degrees of Last Postcard");
  }

  // The final few metres of walking strip are a dry terrace beside the postcard.
  const player = pathPointAt(postcard.t - 0.003);
  player.y = worldHeight(player.x, player.z);
  if (player.y <= waterLevelAt(player.z) || player.distanceTo(postcardTarget) > 10) {
    throw new RangeError("Last Postcard needs a dry player landing within 10 metres");
  }

  const close = origin.clone().add(new Vector3(2, 1.8, 3));
  const detail = origin.clone().add(new Vector3(2.5, 2.4, 4));
  const seated = origin.clone().add(new Vector3(0, 0.9, -1));
  const wide = origin.clone().add(new Vector3(16, 12, 20));
  const mouth = riverPointAt(1);
  mouth.y = waterLevelAt(mouth.z) + 0.6;
  const coastTarget = seated.clone().lerp(mouth, 0.65);
  const arrival = postcardTarget.clone().add(new Vector3(16, 10, 18));
  const shots = [
    { start: 0, end: 5, from: close, to: detail, lookFrom: seated, lookTo: seated, fovFrom: 46, fovTo: 46 },
    { start: 5, end: 17, from: detail, to: wide, lookFrom: seated, lookTo: coastTarget, fovFrom: 46, fovTo: 58 },
    { start: 17, end: 29, from: wide, to: arrival, lookFrom: coastTarget, lookTo: postcardTarget, fovFrom: 58, fovTo: 50 },
    { start: 29, end: 32, from: arrival, to: arrival, lookFrom: postcardTarget, lookTo: postcardTarget, fovFrom: 50, fovTo: 50 },
    { start: 32, end: ENDING_DURATION, from: arrival, to: end.position, lookFrom: postcardTarget, lookTo: end.target, fovFrom: 50, fovTo: end.fov },
  ].map(shot => ({ ...shot, position: spline(shot.from, shot.to), target: spline(shot.lookFrom, shot.lookTo) }));

  function finalFrame(): EndingFrame {
    return { position: end.position.clone(), target: end.target.clone(), fov: end.fov, sunsetBoost: 0, mistBoost: 0, letterbox: 0, paperOpacity: 0 };
  }

  function sample(seconds: number): EndingFrame {
    if (!Number.isFinite(seconds)) throw new RangeError("Ending time must be finite");
    const time = Math.max(0, seconds);
    if (time >= ENDING_DURATION) return finalFrame();
    const shot = shots.find(shot => time <= shot.end)!;
    const u = ease((time - shot.start) / (shot.end - shot.start));
    const position = shot.position.getPoint(u);
    const handoff = ease((time - 32) / 4);
    // Match intro's smooth upper envelope; its width vanishes at the exact handoff.
    const width = 0.2 * (1 - handoff);
    const floor = floorAt(position);
    const gap = position.y - floor;
    position.y = width > 0
      ? Math.max(position.y, floor) + width * width / (2 * (Math.hypot(gap, width) + Math.abs(gap)))
      : Math.max(position.y, floor);
    return {
      position,
      target: shot.target.getPoint(u),
      fov: shot.fovFrom + (shot.fovTo - shot.fovFrom) * u,
      sunsetBoost: (0.3 + 0.7 * ease(time / 29)) * (1 - handoff),
      mistBoost: (0.08 + 0.17 * ease(time / 17)) * (1 - handoff),
      letterbox: ease(time) * (1 - handoff),
      paperOpacity: 0,
    };
  }

  return {
    duration: ENDING_DURATION,
    sample,
    finalFrame,
    get finalPlayerPosition(): Vector3 { return player.clone(); },
  };
}

export type Ending = ReturnType<typeof createEnding>;
