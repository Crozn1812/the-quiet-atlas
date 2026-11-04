import { Vector3 } from "three";
import { pathRiverTAt } from "../../src/features/world/layout/path";
import { riverPointAt, riverTangentAt } from "../../src/features/world/layout/river";
import { ZONES } from "../../src/features/world/layout/zones";
import { worldHeight } from "../../src/features/world/terrain/height";

export const VIDEO_SECONDS = 18;
export const SHOT_IDS = ["forest-dawn", "coast-dusk"] as const;
export type ShotId = typeof SHOT_IDS[number];

function zone(id: typeof ZONES[number]["id"]) {
  const result = ZONES.find(item => item.id === id);
  if (!result) throw new Error(`Missing layout zone: ${id}`);
  return result;
}

const forestT = (zone("first-light").t + zone("workshop").t) / 2;
const coastT = zone("quiet-shore").t;
export const SHOTS = {
  "forest-dawn": { label: "Rừng bình minh", pathT: forestT, timeOfDay: 0, fov: 48 },
  "coast-dusk": { label: "Biển hoàng hôn", pathT: coastT, timeOfDay: 1, fov: 48 },
} as const;

/** Fixed camera at t=0; the same 18 s dolly for every direction and quality. */
export function cameraAt(shot: ShotId, seconds = 0) {
  const progress = Number.isFinite(seconds) ? Math.max(0, Math.min(VIDEO_SECONDS, seconds)) / VIDEO_SECONDS : 0;
  const u = progress * progress * (3 - 2 * progress);
  const riverT = pathRiverTAt(SHOTS[shot].pathT);
  const river = riverPointAt(riverT);
  const tangent = riverTangentAt(riverT);
  const bank = new Vector3(-tangent.z, 0, tangent.x);
  const position = river.clone().addScaledVector(bank, shot === "forest-dawn" ? 11 - 2 * u : 17 - 3 * u)
    .addScaledVector(tangent, 6 * u);
  position.y = worldHeight(position.x, position.z) + (shot === "forest-dawn" ? 3.4 : 4.2);
  const target = shot === "forest-dawn"
    ? riverPointAt(Math.min(1, riverT + 0.055 + 0.004 * u))
    : riverPointAt(1).add(new Vector3(0, 0, -70));
  target.y = shot === "forest-dawn" ? worldHeight(target.x, target.z) + 2.8 : 2;
  return {
    position, target,
    // The channel is 1.1 m below river level; mist rests 1.2 m above that level.
    mistHeight: worldHeight(river.x, river.z) + 2.3,
  };
}
