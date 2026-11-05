import { PATH_BRIDGES, pathLength, pathPointAt } from "../layout/path";
import { clampProgress, riverLength, riverPointAt } from "../layout/river";
import { ZONES } from "../layout/zones";
import { nearestPath, nearestRiver } from "./samples";

export const TERRAIN_SEED = 73021;
export const PATH_WIDTH = 3;
const routeLength = pathLength();
const source = riverPointAt(0);
const streamLength = riverLength();
// A fixed coastal frame avoids nearest-segment switches in the broad bay/ridge.
const coastStart = pathPointAt(0.82);
const coastEnd = pathPointAt(1);
const coastForward = coastEnd.clone().sub(coastStart).normalize();
const coastRoad = Array.from({ length: 33 }, (_, i) => {
  const point = pathPointAt(0.82 + 0.18 * i / 32);
  return coastCoordinates(point.x, point.z);
});

function coastCoordinates(x: number, z: number) {
  const dx = x - coastStart.x;
  const dz = z - coastStart.z;
  return {
    along: dx * coastForward.x + dz * coastForward.z,
    // With Y up, walking toward -Z puts +X on the right.
    right: -dx * coastForward.z + dz * coastForward.x,
  };
}

function coastRoadRight(along: number): number {
  let low = 0, high = coastRoad.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (coastRoad[middle]!.along < along) low = middle;
    else high = middle;
  }
  const a = coastRoad[low]!, b = coastRoad[high]!;
  const t = Math.max(0, Math.min(1, (along - a.along) / (b.along - a.along)));
  return a.right + (b.right - a.right) * t;
}

/** Shared water/channel profile, including the narrow spring and the full sea flare. */
export function riverWidthAt(t: number): number {
  const progress = clampProgress(t);
  const mouth = Math.max(0, (progress - 0.96) / 0.04);
  const width = 4 + 6 * progress + 50 * mouth * mouth * (3 - 2 * mouth);
  const source = Math.min(1, progress / 0.03);
  const blend = source * source * (3 - 2 * source);
  return width + (0.6 - width) * (1 - blend);
}

// Anchor relief to the layout, with the crest on the dry side of the route.
function landmark(id: "milestones" | "horizon" | "workshop", offset: number, seaward = 0) {
  const zone = ZONES.find(zone => zone.id === id)!;
  const river = nearestRiver(zone.position.x, zone.position.z);
  const nx = (zone.position.x - river.x) / river.distance;
  const nz = (zone.position.z - river.z) / river.distance;
  return { x: zone.position.x + nx * offset, z: zone.position.z + nz * offset - seaward, nx, nz, t: zone.t };
}

// Move the crests inland: the old Horizon crest was only 18.6 m from water,
// leaving no room for a gentle slope starting at the 18 m bank setback.
const milestones = landmark("milestones", 42);
const horizon = landmark("horizon", 58, 40);
const workshop = landmark("workshop", 8);
const milestoneRise = crestRise("milestones", milestones, 7.5);
const horizonRise = crestRise("horizon", horizon, 12, 18);

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

function valleyHills(x: number, z: number, distance: number): number {
  return smoothstep(14, 75, distance) * (7 + 5 * noise(x / 38, z / 38));
}

function crestRise(id: "milestones" | "horizon", crest: { x: number; z: number }, rise: number, seaward = 0): number {
  const old = landmark(id, 20, seaward);
  const ground = (point: { x: number; z: number }) => riverLevel(point.z)
    + coastWeight(point.z) * (0.1 + valleyHills(point.x, point.z, nearestRiver(point.x, point.z).distance));
  // Preserve B2-109's absolute crest elevations while giving the bank more run.
  return ground(old) + rise - ground(crest);
}

function landmarkLift(x: number, z: number, riverDistance: number): number {
  const hill = milestoneRise * (1 - smoothstep(0, 75, Math.hypot(x - milestones.x, z - milestones.z)));
  // Negative Z faces the sea: the 45 m nose is steeper than the 100 m inland shoulder.
  const dz = z - horizon.z;
  const headland = horizonRise * (1 - smoothstep(0, 1, Math.hypot((x - horizon.x) / 65, dz / (dz < 0 ? 45 : 100))));
  // Leave the channel, spring, estuary and the spawn's downstream water view open.
  return (hill + headland) * smoothstep(18, 42, riverDistance);
}

function beachHeight(inland: number): number {
  // Match slopes at the waterline; flatten smoothly at -2.5 m, 32 m offshore.
  const sea = Math.min(1, Math.max(0, -inland / 32));
  return inland >= 0 ? inland * 2.5 / 32 : -2.5 * (sea + sea * sea - sea ** 3);
}

/** Seeded beach plus a broad, concave inlet on the walking route's right. */
function shoreHeight(x: number, z: number): number {
  return beachHeight(z - (-880 + 30 * noise(x / 90, 0)));
}

function coastalRelief(x: number, z: number, land: number, river: ReturnType<typeof nearestRiver>, bankRadius: number): number {
  const { along, right } = coastCoordinates(x, z);
  // The ellipse opens into the existing sea. Its near rim recedes inland at
  // mid-bay and returns to a low cape, rather than adding noise to a straight line.
  // Reserve the channel in distance space, so its fade is finished before the
  // waterline: blending tall valley ground directly into water steepens the beach.
  // Move the ellipse upstream and toward the road to leave the estuary open.
  const inland = Math.max(Math.hypot((along - 65) * 160 / 145, right - 180) - 160,
    bankRadius + 12 - river.distance);
  const bay = (1 - smoothstep(0, 32, inland)) * smoothstep(bankRadius, bankRadius + 12, river.distance);
  land += Math.min(0, beachHeight(inland) - land) * bay;

  // Start 25 m beyond the 3 m strip; ease to a rounded 45 m ridge at 110 m.
  // End caps extend beyond the route so the final station has a full shoulder.
  // Use the gentler of the road/river ramps, avoiding a steep product at the bank.
  const left = coastRoadRight(along) - right;
  const ridge = Math.min(smoothstep(26.5, 110, left), smoothstep(32, 102, river.distance))
    * (1 - smoothstep(130, 240, left))
    * smoothstep(-20, 0, along) * (1 - smoothstep(220, 300, along));
  return land + Math.max(0, riverLevel(coastStart.z + coastForward.z * along) + 45 - land) * ridge;
}

/** Pure metres above sea level. No quality setting, random state, or tile-local coordinates. */
export function worldHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Terrain coordinates must be finite");
  const river = nearestRiver(x, z);
  const path = nearestPath(x, z);
  const coastal = coastWeight(z);
  // The left shoulder crosses the stream: add 1 m of bank/approach run here,
  // fading out before the estuary so its bed and shoreline remain unchanged.
  const coastalBankEase = smoothstep(650, 710, -z) * (1 - smoothstep(810, 850, -z));
  // Keep the compact spring hollow, then extend the flat bed 1 m past BOTH
  // ribbon edges along the entire reach, including the 60 m mouth flare.
  const widened = smoothstep(4, 12, river.t * streamLength);
  const bedRadius = widened * (riverWidthAt(river.t) / 2 + 1);
  const bankRadius = Math.max(6 + 2 * widened + coastalBankEase, bedRadius + 2);
  const channel = -1.1 + 1.2 * smoothstep(bedRadius, bankRadius, river.distance);
  // B2-031: a readable valley (taste §5.2) — hills rise to ~7–12 m beyond the bank instead of 3–4 m.
  const hills = valleyHills(x, z, river.distance);
  const valley = riverLevel(z) + coastal * (channel + hills);
  const shore = shoreHeight(x, z);
  // Continue the channel through the beach instead of damming it with the shelf.
  const estuary = shore - Math.max(0, shore - (waterLevelAt(z) - 0.65))
    * (1 - smoothstep(0, 24, river.distance));
  // A compact spring hollow; the zero-slope rim leaves the bank/path beyond 4 m untouched.
  const sourcePool = 0.45 * (1 - smoothstep(0, 4, Math.hypot(x - source.x, z - source.z)));
  let land = valley + (estuary - valley) * smoothstep(760, 840, -z) - sourcePool
    + landmarkLift(x, z, river.distance);
  land = coastalRelief(x, z, land, river, bankRadius);
  // The coastal shelf must respect the same flat bed as the inland valley.
  // Only lower intruding ground; retain the existing beach outside the channel.
  land -= Math.max(0, land - Math.max(0.05, waterLevelAt(z) - 0.65))
    * widened * (1 - smoothstep(bedRadius, bankRadius, river.distance));
  // A 10 x 8 m pad aligned with the bank, with a 6 m rounded transition.
  const dx = x - workshop.x;
  const dz = z - workshop.z;
  const across = dx * workshop.nx + dz * workshop.nz;
  const along = -dx * workshop.nz + dz * workshop.nx;
  const pad = 1 - smoothstep(0, 6, Math.hypot(Math.max(0, Math.abs(along) - 5), Math.max(0, Math.abs(across) - 4)));
  const padHeight = riverLevel(workshop.z) + 0.13;
  land += (padHeight - land) * pad * smoothstep(6, 10, river.distance);

  // The heightfield follows a shallow ford under each future bridge. These
  // 36 m approaches keep the analytic path grade below 13%, including descent.
  let pathOffset = 0.1;
  for (const bridge of PATH_BRIDGES) {
    pathOffset -= 1.2 * (1 - smoothstep(0, 18, Math.abs(path.t - bridge.t) * routeLength));
  }
  // Coastal walking ground needs clearance above local water as well as sea
  // level. Fade this addition out at the channel axis to preserve the estuary.
  const coastalClearance = 0.43 * (1 - coastWeight(path.z)) * smoothstep(0, 6, river.distance);
  // The route stays on the low bank; a raised strip only 8 m from the river
  // would force a cliff even if landmark relief itself started farther away.
  const pathHeight = Math.max(0.4, riverLevel(path.z) + coastWeight(path.z) * pathOffset);
  // Keep the 3 m walking strip flat, with broader, gentle beach approaches.
  const pathBlend = 1 - smoothstep(PATH_WIDTH / 2, 4 + 12 * (1 - coastal) + coastalBankEase, path.distance);
  let height = pathBlend === 1 ? pathHeight : land + (pathHeight - land) * pathBlend;
  // Extra dry clearance has zero influence at/below the old waterline, so
  // raising the walking surface cannot move any shoreline zero crossing.
  height += coastalClearance * pathBlend * smoothstep(0, 0.4, height);
  for (const zone of ZONES) {
    const distance = Math.hypot(x - zone.position.x, z - zone.position.z);
    // Lead (B2-037 review): the dry terrace never dams the river channel; the estuary stays open to the sea.
    const protection = (1 - smoothstep(zone.radius, zone.radius + 16, distance)) * smoothstep(6, 14, river.distance);
    height = protection === 1 ? Math.max(0.4, height)
      : height + Math.max(0, 0.4 - height) * protection;
    const dryHeight = Math.max(0.4, waterLevelAt(z) + 0.4);
    height += Math.max(0, dryHeight - height) * protection * smoothstep(0, 0.4, height);
  }
  return height;
}

/** Water surface above the river centre: 0.35 m below the bank, easing to sea level (0) at the coast. */
export function waterLevelAt(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError("Water level coordinate must be finite");
  return riverLevel(z) - 0.35 * coastWeight(z);
}
