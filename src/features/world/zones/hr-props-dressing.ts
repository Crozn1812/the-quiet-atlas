import { HR_PROP_FAMILIES, type HrPropSite } from "../props/hr-props";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext } from "./types";

/** High-only outer planting. Validate full crowns, not just their trunk roots.
 * The existing small-prop composition, Low and all physics remain unchanged.
 */
export function hrLandscapeSites(context: ZoneSceneContext, kind: "hill" | "palm", colliders: readonly ZoneCollider[]): HrPropSite[] {
  const assets = HR_PROP_FAMILIES[kind];
  const positions = kind === "hill" ? [[-17, -10], [18, -12], [-19, 9], [17, 12]] : [[-14, -10], [16, -11], [-17, 11]];
  const result: HrPropSite[] = [];
  positions.forEach(([x, z], index) => {
    const source: HrPropSite = { asset: assets[index % assets.length]!, x: x!, z: z!,
      size: kind === "hill" ? [4.5, 8 + index * .5, 4.5] : [4.2, 6.5 + index * .5, 4.2], yaw: index * 2.399963, tint: .96 + index * .01 };
    const c = Math.abs(Math.cos(source.yaw)), s = Math.abs(Math.sin(source.yaw));
    const rx = (source.size[0] * c + source.size[2] * s) / 2, rz = (source.size[2] * c + source.size[0] * s) / 2;
    // Coast banks differ by zone. Try both dry shoulders, retaining whole-crown clearance.
    const candidates = [[source.x, source.z], [-source.x, source.z], [source.x, source.z + 7], [-source.x, source.z + 7],
      [9, -9], [-9, -9], [10, 10], [-10, 10], [8, 17], [-8, 17]];
    const selected = candidates.map(([px, pz]) => ({ ...source, x: px!, z: pz! })).find(site => {
      if (result.some(other => Math.hypot(site.x - other.x, site.z - other.z) < 6)) return false;
      if (colliders.some(box => Math.abs(site.x - box.center.x) < rx + Math.hypot(box.size.x, box.size.z) / 2 + 1
        && Math.abs(site.z - box.center.z) < rz + Math.hypot(box.size.x, box.size.z) / 2 + 1)) return false;
      for (let ix = 0; ix <= 20; ix++) for (let iz = 0; iz <= 20; iz++) {
        const px = site.x - rx + 2 * rx * ix / 20, pz = site.z - rz + 2 * rz * iz / 20;
        if (!Number.isFinite(context.heightAt(px, pz)) || Math.abs(px) <= PATH_CLEARANCE || context.onPath(px, pz)
          || context.underWater(px, pz) || Math.hypot(px, pz) > ZONE_BUDGET.radius) return false;
      }
      return true;
    });
    if (selected) result.push(selected);
  });
  return result;
}
