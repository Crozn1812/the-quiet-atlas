import { Color, CubicBezierCurve3, Vector3 } from "three";
import { riverPointAt } from "../layout/river";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { WORLD_DIRECTION } from "../art/direction";
import type { CinematicPresentation } from "./presentation";

export const INTRO_DURATION = 22;
export const CAMERA_CLEARANCE = 0.8;

export interface CameraPose {
  readonly position: Readonly<Vector3>;
  readonly target: Readonly<Vector3>;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

export interface IntroFrame {
  cinematic?: CinematicPresentation;
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

/** Keep the river below the aerial camera inside clear air, with only low valley mist. */
export function introAtmosphere(position: Readonly<Vector3>, mistBoost: number, skyHorizon?: Readonly<Color>) {
  const altitude = Math.max(0, position.y - worldHeight(position.x, position.z));
  const fog = WORLD_DIRECTION.background.forest?.fog ?? WORLD_DIRECTION.background.fog;
  const near = Math.max(fog.near, altitude * 2.5);
  const far = Math.max(fog.far, altitude * 8);
  return {
    fog: { near, far, ...(skyHorizon ? { color: new Color().copy(skyHorizon) } : {}) },
    mist: {
      bands: [far * 0.28, far * 0.52, far * 0.8] as [number, number, number],
      height: waterLevelAt(position.z) + 1.2,
      strength: Math.min(0.08, WORLD_DIRECTION.background.mist.strength + mistBoost),
    },
  };
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

  // Look upstream across the S bend, with dawn sky above the canopy.
  const overview = overWater(0.3, 115).add(new Vector3(0, 0, -180));
  const overviewTarget = overWater(0.14, 0);
  // Match the glide's horizon from frame zero, above the warm horizon band.
  overviewTarget.y = overview.y - Math.hypot(overviewTarget.x - overview.x, overviewTarget.z - overview.z) * 0.24;
  // Regular pines reach 18 m: leave another 18 m above them before the water detail shot.
  const glideHeight = 36;
  const glide = overWater(0.16, glideHeight);
  const close = overWater(0.025, glideHeight);
  const upstreamTarget = (position: Vector3) => position.clone().add(new Vector3(0, -18, 105));
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
      fov = 70;
      mistBoost = 0;
    } else if (time <= 8) {
      const u = ease((time - 1) / 7);
      // Reuse the layout's centripetal river spline, travelling upstream to spawn.
      position = overWater(0.3 + (0.16 - 0.3) * u, 115 + (glideHeight - 115) * u);
      position.z -= 180 * (1 - u);
      target = overviewTarget.clone().lerp(upstreamTarget(glide), u);
      fov = 70 + (58 - 70) * u;
      mistBoost = 0.04 * u;
    } else if (time <= 15) {
      const u = ease((time - 8) / 7);
      position = overWater(0.16 + (0.025 - 0.16) * u, glideHeight);
      target = upstreamTarget(position);
      fov = 58;
      mistBoost = 0.04;
    } else if (time <= 18) {
      const u = ease((time - 15) / 3);
      position = detailCurve.getPoint(u);
      target = upstreamTarget(close).lerp(leafTarget, u);
      fov = 58 + (48 - 58) * u;
      mistBoost = 0.04;
    } else {
      const u = ease((time - 18) / 4);
      position = revealCurve.getPoint(u);
      target = revealTarget.getPoint(u);
      fov = 48 + (end.fov - 48) * u;
      mistBoost = 0.04 * (1 - u);
      letterbox = 1 - u;
    }
    // Smooth upper envelope avoids the velocity kink of a hard terrain clamp.
    // Its width eases to zero at handoff, preserving the exact validated endpoint.
    const width = 0.2 * (time <= 18 ? 1 : 1 - ease((time - 18) / 4));
    const floor = floorAt(position);
    const gap = position.y - floor;
    if (width > 0) {
      position.y = Math.max(position.y, floor)
        + width * width / (2 * (Math.hypot(gap, width) + Math.abs(gap)));
    } else {
      position.y = Math.max(position.y, floor);
    }
    return {
      position, target, fov, mistBoost, letterbox, paperOpacity: 0,
      cinematic: { kind: "intro", strength: letterbox, focus: position.distanceTo(target) },
    };
  }

  return { duration: INTRO_DURATION, sample, finalFrame };
}

export type Intro = ReturnType<typeof createIntro>;
