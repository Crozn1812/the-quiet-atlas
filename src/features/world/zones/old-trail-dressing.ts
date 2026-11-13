import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBroadleafBush, createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "./types";

// A broken fence settling into its verge, a damp tree foot, and a lighter grass
// pocket. The marker's path-facing approach and the gate opening stay empty.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: -7.25, z: -0.85, size: [1.3, 0.55, 0.95], yaw: 0.4 },
  { asset: "rock-boulder-3", x: -7.7, z: -0.25, size: [0.7, 0.3, 0.6], yaw: -0.75 },
  { asset: "prop-fern", x: -7.15, z: 4.3, size: [1.05, 0.64, 0.9], yaw: 0.6 },
  { asset: "prop-fern", x: 5.35, z: 0.45, size: [0.8, 0.48, 0.7], yaw: -0.4 },
  { asset: "prop-fern", x: -10, z: 6.25, size: [1.15, 0.7, 0.95], yaw: 1.1 },
  { asset: "prop-bush", x: -8.35, z: 4.85, size: [1.35, 0.85, 1.1], yaw: -0.3 },
  { asset: "prop-fallen-log", x: -9.5, z: 8.45, size: [2.5, 0.4, 0.62], yaw: -0.45 },
  { asset: "prop-grass", x: 3.6, z: -5.45, size: [0.65, 0.8, 0.52], yaw: 0.3 },
  { asset: "prop-grass", x: 4.25, z: -5.85, size: [0.75, 0.95, 0.6], yaw: -0.6 },
  { asset: "prop-grass", x: 4.95, z: -5.65, size: [0.55, 0.67, 0.48], yaw: 1.2 },
  { asset: "prop-grass", x: 5.45, z: -6.15, size: [0.65, 0.76, 0.55], yaw: -1 },
  { asset: "prop-grass", x: -4.25, z: 7.35, size: [0.6, 0.65, 0.5], yaw: 0.8 },
];

/** Reject the whole rotated footprint, including bent paths and small wet gaps. */
export function oldTrailDressingSites(context: ZoneSceneContext): DressingSite[] {
  const safe = (site: Omit<DressingSite, "tint">) => {
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2;
    const rz = (site.size[2] * c + site.size[0] * s) / 2;
    const nx = Math.ceil(rx * 2 / 0.15), nz = Math.ceil(rz * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE
        || Math.hypot(x, y + site.size[1], z) > ZONE_BUDGET.radius
        || context.onPath(x, z) || context.underWater(x, z)) return false;
    }
    return true;
  };
  return composition.flatMap((source, index) => {
    // The river changes bank along the route. Match the existing gate/tree's
    // dry-bank fallback rather than silently losing the large dressing groups.
    const site = [source, { ...source, x: -source.x, yaw: -source.yaw }].find(safe);
    if (!site) return [];
    return [{ ...site, tint: 0.91 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 9) / 100 }];
  });
}

export function createOldTrailDressing(context: ZoneSceneContext) {
  const sites = oldTrailDressingSites(context);
  const parts = sites.map((site, index) => {
    const source = site.asset === "prop-fern" ? createFern()
      : site.asset === "prop-grass" ? createGrassTuft(context.seed + index)
      : site.asset === "prop-bush" ? createBroadleafBush(context.seed + index)
      : site.asset === "prop-fallen-log" ? new CylinderGeometry(0.5, 0.45, 2, 7).rotateZ(Math.PI / 2)
      : new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.hasAttribute("color")) {
      const pigment = site.asset.startsWith("rock") ? [0.22, 0.26, 0.22] : [0.15, 0.11, 0.075];
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment).flat(), 3));
    }
    for (const key of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(key)) flat.deleteAttribute(key);
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    flat.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
    const fitted = fitDressing(flat, site, context.heightAt);
    flat.dispose();
    return fitted;
  });
  const fallback = parts.length ? mergeGeometries(parts)! : new BufferGeometry();
  parts.forEach(part => part.dispose());
  if (!parts.length) for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3], ["uv", 2], ["dressingSurface", 1]] as const)
    fallback.setAttribute(name, new Float32BufferAttribute([], size));
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt);
  batch.mesh.name = "old-trail-dressing";
  return batch;
}
