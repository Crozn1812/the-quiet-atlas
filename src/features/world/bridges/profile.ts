import { Vector3 } from "three";
import { PATH_BRIDGES, pathLength, pathPointAt, type PathBridge } from "../layout/path";
import { waterLevelAt, worldHeight } from "../terrain/height";

export const BRIDGE_CLEAR_WIDTH = 2.2;
export const BRIDGE_DECK_WIDTH = 2.4;
export const BRIDGE_WATER_CLEARANCE = 0.46;
export const BRIDGE_MAX_SLOPE = 12 * Math.PI / 180;
export const BRIDGE_RAIL_OFFSET = 1.17;
export const BRIDGE_RAIL_HEIGHT = 1.1;
export const BRIDGE_RAIL_THICKNESS = 0.14;

const routeLength = pathLength();

function groundOffset(t: number): number {
  const p = pathPointAt(t);
  return worldHeight(p.x, p.z) - waterLevelAt(p.z);
}

/** Hermite landing: matches the terrain grade at the toe and the water grade at the span. */
function approach(t: number, toe: number, span: number): number {
  const run = (span - toe) * routeLength;
  const u = (t - toe) / (span - toe);
  const h = groundOffset(toe);
  const step = 0.05 / routeLength;
  const grade = (groundOffset(toe + step) - groundOffset(toe - step)) / 0.1;
  return (2 * u ** 3 - 3 * u ** 2 + 1) * h
    + (u ** 3 - 2 * u ** 2 + u) * run * grade
    + (-2 * u ** 3 + 3 * u ** 2) * BRIDGE_WATER_CLEARANCE;
}

export interface BridgeSample {
  readonly t: number;
  readonly centre: Vector3;
  readonly right: Vector3;
}

export interface BridgeRailing {
  readonly side: -1 | 1;
  readonly posts: readonly BridgeSample[];
}

export interface BridgeProfile {
  readonly source: PathBridge;
  readonly tStart: number;
  readonly tEnd: number;
  readonly length: number;
  readonly rows: readonly BridgeSample[];
  readonly railings: readonly BridgeRailing[];
  sample(t: number): BridgeSample;
}

/** Space posts by each offset curve's own length; inside bends need fewer posts. */
function createRailing(
  side: -1 | 1,
  probes: readonly BridgeSample[],
  sample: BridgeProfile["sample"],
): BridgeRailing {
  const points = probes.map(row => row.centre.clone().addScaledVector(row.right, side * BRIDGE_RAIL_OFFSET));
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  }
  const length = distances[distances.length - 1]!;
  const bays = Math.round(length / 1.4);
  const posts = Array.from({ length: bays + 1 }, (_, i) => {
    const distance = length * i / bays;
    let low = 0, high = distances.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (distances[mid]! < distance) low = mid;
      else high = mid;
    }
    const u = (distance - distances[low]!) / (distances[high]! - distances[low]!);
    return sample(probes[low]!.t + (probes[high]!.t - probes[low]!.t) * u);
  });
  return { side, posts };
}

function createProfile(source: PathBridge): BridgeProfile {
  // One metre is the minimum. Extend only if a future layout needs a longer landing.
  for (let extension = 1; extension <= 12; extension += 0.5) {
    const tStart = source.tStart - extension / routeLength;
    const tEnd = source.tEnd + extension / routeLength;
    const length = (tEnd - tStart) * routeLength;
    const sample = (t: number): BridgeSample => {
      const centre = pathPointAt(t);
      const offset = t < source.tStart ? approach(t, tStart, source.tStart)
        : t > source.tEnd ? approach(t, tEnd, source.tEnd) : BRIDGE_WATER_CLEARANCE;
      // Never hide the landing under the existing walking strip.
      centre.y = Math.max(worldHeight(centre.x, centre.z), waterLevelAt(centre.z) + offset);
      const tangent = pathPointAt(t + 0.01 / routeLength).sub(pathPointAt(t - 0.01 / routeLength)).normalize();
      return { t, centre, right: new Vector3(-tangent.z, 0, tangent.x) };
    };
    const probes = Array.from({ length: Math.ceil(length / 0.1) + 1 }, (_, i) =>
      sample(tStart + (tEnd - tStart) * i / Math.ceil(length / 0.1)));
    const valid = probes.every((p, i) => {
      const previous = probes[i - 1];
      if (!previous) return true;
      const run = Math.hypot(p.centre.x - previous.centre.x, p.centre.z - previous.centre.z);
      return Math.abs(p.centre.y - previous.centre.y) / run <= Math.tan(BRIDGE_MAX_SLOPE) - 0.005;
    });
    if (!valid) continue;
    const segments = Math.ceil(length / 0.75);
    return {
      source, tStart, tEnd, length, sample,
      rows: Array.from({ length: segments + 1 }, (_, i) => sample(tStart + (tEnd - tStart) * i / segments)),
      railings: ([-1, 1] as const).map(side => createRailing(side, probes, sample)),
    };
  }
  throw new Error("Bridge cannot meet the 12 degree landing limit within 12 metres");
}

export function createBridgeProfiles(): readonly BridgeProfile[] {
  return PATH_BRIDGES.map(createProfile);
}
