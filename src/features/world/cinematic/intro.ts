import { CubicBezierCurve3, Vector3 } from "three";
import { riverPointAt } from "../layout/river";
import { waterLevelAt, worldHeight } from "../terrain/height";

export const INTRO_DURATION = 22;
export const CAMERA_CLEARANCE = 0.8;

export interface CameraPose {
  readonly position: Readonly<Vector3>;
  readonly target: Readonly<Vector3>;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

export interface IntroFrame {
  position: Vector3;
  target: Vector3;
  fov: number;
  /** Additional mist intensity, normalized to [0, 1]. */
  mistBoost: number;
  /** Normalized bar strength; the renderer chooses the actual bar height. */
  letterbox: number;
  /** Paper overlay opacity: 1 is paper, 0 is the unobscured scene. */
  paperOpacity: number;
}

/** Quintic easing has zero velocity and acceleration at both ends, without overshoot. */
export function ease(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

function floorAt(position: Readonly<Vector3>): number {
  return Math.max(worldHeight(position.x, position.z) + CAMERA_CLEARANCE, waterLevelAt(position.z));
}

function overWater(t: number, height: number): Vector3 {
  const point = riverPointAt(t);
  point.y = Math.max(worldHeight(point.x, point.z), waterLevelAt(point.z)) + height;
  return point;
}

function vector(value: Readonly<Vector3>): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

/** Control points stay within the endpoint bounds; easing cannot overshoot them. */
function spline(from: Vector3, to: Vector3): CubicBezierCurve3 {
  return new CubicBezierCurve3(
    from,
    new Vector3(from.x, from.y + (to.y - from.y) / 3, from.z),
    new Vector3(to.x, from.y + (to.y - from.y) * 2 / 3, to.z),
    to,
  );
}

/**
 * Pure, seconds-based sampling; no renderer, clock, audio or persistence.
 * The caller supplies the first gameplay camera's actual look-at target (not a direction).
 * Unsafe endpoints are rejected rather than silently changing the handoff pose.
 */
export function createIntro(gameplayPose: CameraPose) {
  const end = { position: vector(gameplayPose.position), target: vector(gameplayPose.target), fov: gameplayPose.fov };
  if (![...end.position, ...end.target, end.fov].every(Number.isFinite)
    || end.fov <= 0 || end.fov >= 180 || end.position.distanceToSquared(end.target) < 1e-12) {
    throw new RangeError("Gameplay camera must have finite coordinates, a distinct target and 0 < fov < 180");
  }
  if (end.position.y < floorAt(end.position)) throw new RangeError("Gameplay camera is below the safe terrain/water floor");

  // At 460 m / 72 degrees, the opening covers the first four alternating bends
  // (z = -115, -250, -390, -535), with a slight 20 m tilt from vertical.
  const overview = overWater(0.3, 460).add(new Vector3(0, 0, 20));
  const overviewTarget = overWater(0.3, 0);
  const close = overWater(0.002, 1.5);
  const leaf = overWater(0, 1.5).add(new Vector3(-1, 0, 1));
  // Lead (B2-043b review): look downstream; the ribbon's cut source at t=0 must stay behind the camera.
  const closeTarget = overWater(0.025, 0);
  const leafTarget = closeTarget.clone().add(new Vector3(-0.5, 0.1, 0));
  const detailCurve = spline(close, leaf);
  const revealCurve = spline(leaf, end.position);
  const revealTarget = spline(leafTarget, end.target);

  function finalFrame(): IntroFrame {
    return { position: end.position.clone(), target: end.target.clone(), fov: end.fov, mistBoost: 0, letterbox: 0, paperOpacity: 0 };
  }

  function sample(seconds: number): IntroFrame {
    if (!Number.isFinite(seconds)) throw new RangeError("Intro time must be finite");
    const time = Math.max(0, seconds);
    if (time >= INTRO_DURATION) return finalFrame();
    let position: Vector3;
    let target: Vector3;
    let fov: number;
    let mistBoost: number;
    let letterbox = 1;
    if (time <= 1) {
      position = overview.clone();
      target = overviewTarget.clone();
      fov = 72;
      mistBoost = 0;
    } else if (time <= 15) {
      const u = ease((time - 1) / 14);
      // Reuse the layout's centripetal river spline, travelling upstream to spawn.
      position = overWater(0.3 + (0.002 - 0.3) * u, 460 + (1.5 - 460) * u);
      position.z += 20 * (1 - u);
      target = overviewTarget.clone().lerp(closeTarget, u);
      fov = 72 + (50 - 72) * u;
      mistBoost = u;
    } else if (time <= 17) {
      const u = ease((time - 15) / 2);
      position = detailCurve.getPoint(u);
      target = closeTarget.clone().lerp(leafTarget, u);
      fov = 50;
      mistBoost = 1;
    } else {
      const u = ease((time - 17) / 5);
      position = revealCurve.getPoint(u);
      target = revealTarget.getPoint(u);
      fov = 50 + (end.fov - 50) * u;
      mistBoost = 1 - u;
      letterbox = 1 - u;
    }
    // Smooth upper envelope avoids the velocity kink of a hard terrain clamp.
    // Its width eases to zero at handoff, preserving the exact validated endpoint.
    const width = 0.2 * (time <= 17 ? 1 : 1 - ease((time - 17) / 5));
    const floor = floorAt(position);
    const gap = position.y - floor;
    if (width > 0) {
      position.y = Math.max(position.y, floor)
        + width * width / (2 * (Math.hypot(gap, width) + Math.abs(gap)));
    } else {
      position.y = Math.max(position.y, floor);
    }
    return { position, target, fov, mistBoost, letterbox, paperOpacity: 0 };
  }

  return { duration: INTRO_DURATION, sample, finalFrame };
}

export type Intro = ReturnType<typeof createIntro>;
