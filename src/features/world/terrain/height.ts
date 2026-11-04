import { PATH_BRIDGES, pathLength } from "../layout/path";
import { nearestPath, nearestRiver } from "./samples";

export const TERRAIN_SEED = 73021;
export const PATH_WIDTH = 3;
const routeLength = pathLength();

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function randomAt(x: number, z: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ TERRAIN_SEED;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const tx = smoothstep(0, 1, x - ix);
  const tz = smoothstep(0, 1, z - iz);
  const a = randomAt(ix, iz) * (1 - tx) + randomAt(ix + 1, iz) * tx;
  const b = randomAt(ix, iz + 1) * (1 - tx) + randomAt(ix + 1, iz + 1) * tx;
  return (a * (1 - tz) + b * tz) * 2 - 1;
}

function coastWeight(z: number): number {
  return 1 - smoothstep(760, 900, -z);
}

function riverLevel(z: number): number {
  return Math.max(0, z + 900) * 0.008;
}

/** Pure metres above sea level. No quality setting, random state, or tile-local coordinates. */
export function worldHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Terrain coordinates must be finite");
  const river = nearestRiver(x, z);
  const path = nearestPath(x, z);
  const coastal = coastWeight(z);
  // A 1.2 m channel with a gently rounded bank; hills grow only beyond the bank.
  const channel = -1.1 + 1.2 * smoothstep(0, 6, river.distance);
  // B2-031: a readable valley (taste §5.2) — hills rise to ~7–12 m beyond the bank instead of 3–4 m.
  const hills = smoothstep(14, 75, river.distance) * (7 + 5 * noise(x / 38, z / 38));
  const land = riverLevel(z) + coastal * (channel + hills);

  // The heightfield follows a shallow ford under each future bridge. These
  // 36 m approaches keep the analytic path grade below 13%, including descent.
  let pathOffset = 0.1;
  for (const bridge of PATH_BRIDGES) {
    pathOffset -= 1.2 * (1 - smoothstep(0, 18, Math.abs(path.t - bridge.t) * routeLength));
  }
  const pathHeight = riverLevel(path.z) + coastWeight(path.z) * pathOffset;
  // The inner 3 m is flat across the route; another 2.5 m blends into the banks.
  const pathBlend = 1 - smoothstep(PATH_WIDTH / 2, 4, path.distance);
  return land + (pathHeight - land) * pathBlend;
}

/** Water surface above the river centre: 0.35 m below the bank, easing to sea level (0) at the coast. */
export function waterLevelAt(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError("Water level coordinate must be finite");
  return riverLevel(z) - 0.35 * coastWeight(z);
}
