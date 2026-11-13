import { PATH_BRIDGES, pathLength, pathPointAt, pathRiverTAt } from "../layout/path";
import { clampProgress, riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import { ZONES } from "../layout/zones";
import { COAST_BEACH_Z, WORLD_LENGTH, WORLD_SCALE, routeZ } from "../layout/scale";
import { nearestPath, nearestRiver } from "./samples";

export const TERRAIN_SEED = 73021;
export const PATH_WIDTH = 3;
const routeLength = pathLength();
const source = riverPointAt(0);
const sourceForward = riverTangentAt(0);
const streamLength = riverLength();
// A fixed coastal frame avoids nearest-segment switches in the broad bay/ridge.
const coastStart = pathPointAt(0.82);
const coastEnd = pathPointAt(1);
const coastForward = coastEnd.clone().sub(coastStart).normalize();
const coastSpan = coastStart.distanceTo(coastEnd);
const coastRoad = Array.from({ length: 33 }, (_, i) => {
  const point = pathPointAt(0.82 + 0.18 * i / 32);
  return coastCoordinates(point.x, point.z);
});
const coastPads = ZONES.filter(zone => zone.biome === "coast-dusk");
// Match the existing Unwritten Page detour without importing story/secrets,
// which itself uses worldHeight to ground the bench.
const quietShore = coastPads.find(zone => zone.id === "quiet-shore")!;
const benchForward = riverTangentAt(pathRiverTAt(quietShore.t));
const coastBench = { x: quietShore.position.x - benchForward.z * 24, z: quietShore.position.z + benchForward.x * 24 };

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
  return 1 - smoothstep(-routeZ(760), WORLD_LENGTH, -z);
}

function riverLevel(z: number): number {
  // Keep dawn/coast elevations while compressing the horizontal journey.
  return Math.max(0, z + WORLD_LENGTH) * 0.008 / WORLD_SCALE;
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
  return beachHeight(z - (COAST_BEACH_Z + 30 * noise(x / 90, 0)));
}

/** Pointed elliptical cones, with a shorter rear face for exposed rocky cliffs. */
function coastalSummit(along: number, left: number, centreAlong: number, centreLeft: number,
  rise: number, length: number, shoulder: number, cliff: number): number {
  const across = left - centreLeft;
  const radius = Math.hypot((along - centreAlong) / length, across / (across < 0 ? shoulder : cliff));
  const road = riverLevel(coastStart.z + coastForward.z * centreAlong * WORLD_SCALE);
  // A narrow, gentle beach keeps the existing shore stones on low ground.
  // Above it, the cone retains its steep faces and exact summit elevation.
  // Both branches meet at 0.75 m; the seaward toe eases into the -2.5 m bed.
  const face = road + rise + 9.25 - (road + rise + 11.75) * radius;
  return face <= 10 ? beachHeight(face * 0.96) : face - 9.25;
}

function coastalRelief(x: number, z: number, land: number, river: ReturnType<typeof nearestRiver>,
  bankRadius: number, pathDistance: number): number {
  const { along: station, right } = coastCoordinates(x, z);
  // Compress longitudinal scenery with the road; keep lateral setbacks and prop sizes.
  const along = station / WORLD_SCALE;
  const valley = land;
  // The ellipse opens into the existing sea. Its near rim recedes inland at
  // mid-bay and returns to a low cape, rather than adding noise to a straight line.
  // Reserve the channel in distance space, so its fade is finished before the
  // waterline: blending tall valley ground directly into water steepens the beach.
  // Move the ellipse upstream and toward the road to leave the estuary open.
  const inland = Math.max(Math.hypot((along - 65) * 160 / 145, right - 184) - 160,
    bankRadius + 12 - river.distance);
  const bay = (1 - smoothstep(0, 32, inland)) * smoothstep(bankRadius, bankRadius + 12, river.distance);
  land += Math.min(0, beachHeight(inland) - land) * bay;

  // Bring the upstream shore out to 35–70 m from the road and remove the
  // inland blending hump. The low sand shelf descends smoothly to sea level.
  const upstreamSetback = 9 * (1 - smoothstep(50, 120, along));
  const openInland = Math.max(Math.hypot((along - 65) * 160 / 145, right - 184 - upstreamSetback) - 160,
    bankRadius + 12 - river.distance);
  const sand = openInland > 0 ? 1.2 * smoothstep(0, 32, openInland) : beachHeight(openInland);
  const openBay = (1 - smoothstep(32, 64, openInland)) * smoothstep(bankRadius, bankRadius + 12, river.distance);
  const lowered = valley + Math.min(0, sand - valley) * openBay;
  let opening = smoothstep(PATH_WIDTH / 2, 18, right - coastRoadRight(station))
    * smoothstep(-10, 22, along) * (1 - smoothstep(163, 194, along));
  // Keep the authored foundations, plus a full triangle of surrounding ground,
  // bit-identical. Round off their outer shoulders instead of moving the props.
  for (const zone of coastPads) {
    opening *= smoothstep(zone.radius + 3, zone.radius + 11, Math.hypot(x - zone.position.x, z - zone.position.z));
  }
  land += (lowered - land) * opening;
  // Keep the bench's 2.5 m activation disc dry, with a gentle sand shoulder.
  const bench = 1 - smoothstep(3, 12, Math.hypot(x - coastBench.x, z - coastBench.z));
  land += Math.max(0, waterLevelAt(z) + 0.401 - land) * bench;

  // Start 25 m beyond the 3 m strip; ease to a rounded 45 m ridge at 110 m.
  // End caps extend beyond the route so the final station has a full shoulder.
  // Use the gentler of the road/river ramps, avoiding a steep product at the bank.
  const left = coastRoadRight(station) - right;
  const ridge = Math.min(smoothstep(26.5, 100, left), smoothstep(32, 102, river.distance))
    * (1 - smoothstep(130, 240, left))
    * smoothstep(-100, -40, station) * (1 - smoothstep(coastSpan + 80, coastSpan + 160, station));
  land += Math.max(0, riverLevel(coastStart.z + coastForward.z * station) + 45 - land) * ridge;

  // B2-173: keep the complete old foreground, path, zone pads and estuary.
  // The main peak starts beyond 150 m left; stagger two lower crests behind it
  // so they form separate silhouettes instead of another flat, raised shelf.
  if (pathDistance <= 150 || river.distance <= bankRadius + 12) return land;
  const main = coastalSummit(along, -right, 155, 325, 130, 190, 175, 125);
  const middle = coastalSummit(along, -right, 20, 580, 92, 140, 130, 110);
  const distant = coastalSummit(along, -right, 155, 790, 80, 120, 120, 90);
  // A long, narrow cape joins the outer bay rim to a steep, seaward nose.
  // It stays far right of the open water views and beyond the river mouth.
  const cape = coastalSummit(along, right, 210, 330, 32, 230, 38, 38);
  const relief = Math.max(main, middle, distant, cape);
  return land + Math.max(0, relief - land) * smoothstep(150, 180, pathDistance);
}

/** Ground before the road foundation cut; keeps the asphalt's original grade. */
export function roadBaseHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError("Terrain coordinates must be finite");
  const river = nearestRiver(x, z);
  const path = nearestPath(x, z);
  const coastal = coastWeight(z);
  // The left shoulder crosses the stream: add 1 m of bank/approach run here,
  // fading out before the estuary so its bed and shoreline remain unchanged.
  const coastalBankEase = smoothstep(-routeZ(650), -routeZ(710), -z)
    * (1 - smoothstep(-routeZ(810), -routeZ(850), -z));
  // Keep the compact spring hollow, then extend the flat bed 1 m past BOTH
  // ribbon edges along the entire reach, including the 60 m mouth flare.
  const widened = smoothstep(4, 12, river.t * streamLength);
  const bedRadius = widened * (riverWidthAt(river.t) / 2 + 1);
  const bankRadius = Math.max(6 + 2 * widened + coastalBankEase, bedRadius + 2);
  let channel = -1.1 + 1.2 * smoothstep(bedRadius, bankRadius, river.distance);
  // Only the hill reach gets a shallow bank. Keep the forest/spring and coast
  // profiles, and the existing path/ford foundations applied below, unchanged.
  const hillBank = smoothstep(0.37, 0.4, river.t) * (1 - smoothstep(0.75, 0.79, river.t));
  const waterEdge = riverWidthAt(river.t) / 2;
  // Meet the water at its actual ribbon edge instead of extending the deep
  // bed beyond it. Grass is 0.45 m above water after a 3 m eased shoulder.
  const shallowChannel = river.distance < waterEdge
    ? -1.1 + 0.75 * smoothstep(waterEdge - 2, waterEdge, river.distance)
    : -0.35 + 0.45 * smoothstep(waterEdge, waterEdge + 3, river.distance);
  if (river.distance < bankRadius) channel += (shallowChannel - channel) * hillBank;
  // B2-031: a readable valley (taste §5.2) — hills rise to ~7–12 m beyond the bank instead of 3–4 m.
  const hills = valleyHills(x, z, river.distance);
  const valley = riverLevel(z) + coastal * (channel + hills);
  const shore = shoreHeight(x, z);
  // Continue the channel through the beach instead of damming it with the shelf.
  const estuary = shore - Math.max(0, shore - (waterLevelAt(z) - 0.65))
    * (1 - smoothstep(0, 24, river.distance));
  // A compact spring hollow; the zero-slope rim leaves the bank/path beyond 4 m untouched.
  const sourcePool = 0.45 * (1 - smoothstep(0, 4, Math.hypot(x - source.x, z - source.z)));
  let land = valley + (estuary - valley) * smoothstep(-routeZ(760), -routeZ(840), -z) - sourcePool
    + landmarkLift(x, z, river.distance);
  land = coastalRelief(x, z, land, river, bankRadius, path.distance);
  // The coastal shelf must respect the same flat bed as the inland valley.
  // Only lower intruding ground; retain the existing beach outside the channel.
  land -= Math.max(0, land - Math.max(0.05, waterLevelAt(z) - 0.65))
    * widened * (1 - hillBank) * (1 - smoothstep(bedRadius, bankRadius, river.distance));
  // A 10 x 8 m pad aligned with the bank, with a 6 m rounded transition.
  const dx = x - workshop.x;
  const dz = z - workshop.z;
  const across = dx * workshop.nx + dz * workshop.nz;
  const along = -dx * workshop.nz + dz * workshop.nx;
  const pad = 1 - smoothstep(0, 6, Math.hypot(Math.max(0, Math.abs(along) - 5), Math.max(0, Math.abs(across) - 4)));
  const padHeight = Math.max(riverLevel(workshop.z) + 0.13, waterLevelAt(z) + 0.4);
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
  // Seat the spring pool below the outlet. The compact rim ends before the
  // walking strip; downstream terrain and all other zones remain unchanged.
  const springBasin = 1 - smoothstep(1.8, 3.5, Math.hypot(x - source.x, z - source.z));
  height -= Math.max(0, height - (waterLevelAt(z) - 0.3)) * springBasin
    * smoothstep(PATH_WIDTH / 2, 3, path.distance);
  const sx = x - source.x, sz = z - source.z;
  const alongSource = sx * sourceForward.x + sz * sourceForward.z;
  const acrossSource = -sx * sourceForward.z + sz * sourceForward.x;
  const shoulder = (1 - smoothstep(2, 7, Math.abs(acrossSource)))
    * (1 - smoothstep(1.5, 6, Math.abs(alongSource + 4)))
    * smoothstep(0.9, 2, Math.abs(acrossSource)) * smoothstep(2, 5, path.distance);
  height += 0.7 * shoulder;
  // FL-03: the opening reach is wadeable. The streamed heightfield collider
  // consumes this same surface; there is no separate invisible floor.
  const wading = (1 - smoothstep(0.065, 0.09, river.t))
    * (1 - smoothstep(waterEdge - 0.5, waterEdge + 3, river.distance))
    * smoothstep(PATH_WIDTH / 2, 4, path.distance)
    * smoothstep(7 * WORLD_SCALE, 12 * WORLD_SCALE, alongSource);
  height += (waterLevelAt(z) - 0.42 - height) * wading;
  return height;
}

/** Pure metres above sea level. No quality setting, random state, or tile-local coordinates. */
export function worldHeight(x: number, z: number): number {
  const height = roadBaseHeight(x, z);
  const path = nearestPath(x, z);
  if (path.t <= 0.79 || path.distance >= 9.3) return height;
  // Maximum asphalt + wandering shoulder radius: 2.5 + 0.92 m. Include
  // a full 2 m cell diagonal (sqrt(8)) so triangles touching the road share
  // the cut, then ease out over a 3 m talus. Round off the end cap too.
  let depth = 0.05 + 0.015 * smoothstep(PATH_WIDTH / 2 + 0.01, 2.5, path.distance);
  for (const zone of coastPads) {
    depth = Math.min(depth, 0.05 + 0.015 * smoothstep(zone.radius, zone.radius + 3,
      Math.hypot(x - zone.position.x, z - zone.position.z)));
  }
  const roadCut = depth * smoothstep(0.79, 0.8, path.t)
    * (1 - smoothstep(6.3, 9.3, path.distance))
    * smoothstep(0.01, 0.25, nearestRiver(x, z).distance)
    * smoothstep(0, 0.2, Math.abs(height));
  let ground = height - roadCut;
  // Retain existing dry walking/zone ground, restoring only the required
  // clearance. Blend that protection out over 3 m without raising old ground.
  const dryFloor = Math.min(height, Math.max(0.4, waterLevelAt(z) + 0.4 + 1e-12));
  const walking = 1 - smoothstep(PATH_WIDTH / 2 + 0.01, 2, path.distance);
  ground = walking === 1 ? Math.max(ground, dryFloor)
    : ground + Math.max(0, dryFloor - ground) * walking;
  for (const zone of coastPads) {
    const protection = 1 - smoothstep(zone.radius, zone.radius + 3, Math.hypot(x - zone.position.x, z - zone.position.z));
    ground = protection === 1 ? Math.max(ground, dryFloor)
      : ground + Math.max(0, dryFloor - ground) * protection;
  }
  return ground;
}

/** Water surface above the river centre: 0.35 m below the bank, easing to sea level (0) at the coast. */
export function waterLevelAt(z: number): number {
  if (!Number.isFinite(z)) throw new RangeError("Water level coordinate must be finite");
  return riverLevel(z) - 0.35 * coastWeight(z);
}

/** Height on the rendered/Rapier triangles, including their diagonal and Float32 rounding. */
export function surfaceHeight(x: number, z: number, sample = worldHeight): number {
  const step = 2;
  const x0 = Math.floor(x / step) * step;
  const z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step;
  const v = (z - z0) / step;
  const a = Math.fround(sample(x0, z0));
  const b = Math.fround(sample(x0 + step, z0));
  const c = Math.fround(sample(x0, z0 + step));
  const d = Math.fround(sample(x0 + step, z0 + step));
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Reuse lattice samples while constructing a static mesh. */
export function createSurfaceSampler() {
  const heights = new Map<string, number>();
  return (x: number, z: number) => surfaceHeight(x, z, (gridX, gridZ) => {
    const key = `${gridX},${gridZ}`;
    const existing = heights.get(key);
    if (existing !== undefined) return existing;
    const height = worldHeight(gridX, gridZ);
    heights.set(key, height);
    return height;
  });
}
