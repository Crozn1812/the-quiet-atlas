import { Vector3 } from "three";
import { dismount, vehiclePosition, type VehicleCorridor, type VehicleState } from "../../vehicle/model";
import { HEIGHT } from "../scene";

export const DISMOUNT_COPY = {
  vi: { moving: "Dừng xe rồi bấm E", "unsafe-ground": "Chưa có chỗ đứng an toàn", "not-riding": "Bạn chưa lên xe" },
  en: { moving: "Stop, then press E", "unsafe-ground": "No safe place to stand", "not-riding": "You are not riding" },
} as const;

export const DISMOUNT_PENDING_COPY = {
  vi: "Đang dừng xe để xuống…",
  en: "Stopping to step off…",
} as const;

export interface DismountGround {
  surfaceHeight(x: number, z: number): number;
  waterLevelAt(z: number): number;
  contains(point: Vector3): boolean;
  /** Sweep the walking capsule from ground point to ground point, including endpoints. */
  clear(from: Vector3, to: Vector3): boolean;
}

/** E transition; searches both sides, near first, then slightly fore/aft.
 * All samples cover the standing capsule's footprint, including the world edge.
 * Callers teleport only on success and display message on failure.
 */
export function requestDismount(
  state: VehicleState, corridor: VehicleCorridor, ground: DismountGround, locale: "vi" | "en",
) {
  const eligibility = dismount(state, true);
  if (!eligibility.ok) return { ...eligibility, message: DISMOUNT_COPY[locale][eligibility.reason] };
  const centre = vehiclePosition(state, corridor), tangent = corridor.tangentAt(state.s);
  const length = Math.hypot(tangent.x, tangent.z);
  const tx = tangent.x / length, tz = tangent.z / length;
  const from = new Vector3(centre.x, ground.surfaceHeight(centre.x, centre.z), centre.z);
  for (const offset of [0, -.6, .6]) {
    for (const distance of [.9, 1.2, 1.5]) {
      for (const side of [1, -1]) {
        const x = centre.x + tz * side * distance + tx * offset;
        const z = centre.z - tx * side * distance + tz * offset;
        const candidate = new Vector3(x, ground.surfaceHeight(x, z), z);
        const dry = [[0, 0], [.35, 0], [-.35, 0], [0, .35], [0, -.35],
          [.25, .25], [-.25, .25], [.25, -.25], [-.25, -.25]].every(([dx, dz]) => {
          const sx = x + dx!, sz = z + dz!, y = ground.surfaceHeight(sx, sz);
          return Number.isFinite(y) && y > ground.waterLevelAt(sz) + .08
            && Math.abs(y - candidate.y) < .3 && ground.contains(new Vector3(sx, y, sz));
        });
        if (dry && ground.clear(from, candidate)) {
          return { ...eligibility, position: candidate.add(new Vector3(0, HEIGHT + .02, 0)), message: undefined };
        }
      }
    }
  }
  return { ok: false as const, state, reason: "unsafe-ground" as const, message: DISMOUNT_COPY[locale]["unsafe-ground"] };
}
