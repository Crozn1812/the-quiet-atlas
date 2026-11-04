import { Vector3 } from "three";
import { clampProgress, riverPointAt, riverTangentAt } from "./river";

export const PATH_BANK_OFFSET = 8;

// River-distance windows cover the full bank-to-bank transition, including approaches.
const crossings = [
  { start: 0.348, end: 0.372 },
  { start: 0.678, end: 0.702 },
] as const;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function pointByRiverProgress(t: number): Vector3 {
  let bank = 1;
  for (const crossing of crossings) {
    if (t <= crossing.start) break;
    if (t < crossing.end) {
      bank *= 1 - 2 * smoothstep((t - crossing.start) / (crossing.end - crossing.start));
      break;
    }
    bank *= -1;
  }
  const tangent = riverTangentAt(t);
  const normal = new Vector3(-tangent.z, 0, tangent.x);
  return riverPointAt(t).addScaledVector(normal, PATH_BANK_OFFSET * bank);
}

// Reparameterize the offset path by its OWN length, including bridge crossings.
// A 4096-segment table is deterministic and keeps queries to a binary search.
const SAMPLE_COUNT = 4096;
const distances = [0];
let previous = pointByRiverProgress(0);
for (let i = 1; i <= SAMPLE_COUNT; i++) {
  const point = pointByRiverProgress(i / SAMPLE_COUNT);
  distances.push(distances[i - 1]! + previous.distanceTo(point));
  previous = point;
}
const length = distances[SAMPLE_COUNT]!;

/** Maps normalized walking distance to normalized river distance for scenery placement. */
export function pathRiverTAt(t: number): number {
  const distance = clampProgress(t) * length;
  let low = 0;
  let high = SAMPLE_COUNT;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (distances[mid]! < distance) low = mid;
    else high = mid;
  }
  const fraction = (distance - distances[low]!) / (distances[high]! - distances[low]!);
  return (low + fraction) / SAMPLE_COUNT;
}

function pathTByRiverProgress(t: number): number {
  const index = t * SAMPLE_COUNT;
  const low = Math.floor(index);
  const high = Math.min(low + 1, SAMPLE_COUNT);
  return (distances[low]! + (distances[high]! - distances[low]!) * (index - low)) / length;
}

/** t is normalized walking distance. All geometry is flat; terrain elevation is separate. */
export function pathPointAt(t: number): Vector3 {
  return pointByRiverProgress(pathRiverTAt(t));
}

export function pathLength(): number {
  return length;
}

export interface PathBridge {
  readonly tStart: number;
  readonly t: number;
  readonly tEnd: number;
  readonly position: Readonly<Vector3>;
}

/** Path-distance intervals where the usual river-clearance rule is suspended. */
export const PATH_BRIDGES: readonly PathBridge[] = Object.freeze(crossings.map(({ start, end }) => {
  const middle = (start + end) / 2;
  return Object.freeze({
    tStart: pathTByRiverProgress(start),
    t: pathTByRiverProgress(middle),
    tEnd: pathTByRiverProgress(end),
    position: Object.freeze(pointByRiverProgress(middle)),
  });
}));
