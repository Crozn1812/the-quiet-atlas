import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "./types";

// Two uneven stones seat the welcome log; damp fern pockets stop at the path
// shoulder. Taller grass occupies the open dawn gap, leaving the central route bare.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: 6.9, z: -5.35, size: [1.45, 0.72, 1.05], yaw: 0.35 },
  { asset: "rock-boulder-3", x: 7.6, z: -4.9, size: [0.78, 0.39, 0.62], yaw: -0.65 },
  { asset: "prop-fern", x: 6.3, z: -5.9, size: [1.05, 0.65, 0.9], yaw: 0.7 },
  { asset: "prop-fern", x: -9.6, z: 1.85, size: [1.2, 0.74, 1.05], yaw: -0.4 },
  { asset: "prop-bush", x: -9.55, z: 5.4, size: [1.35, 0.85, 1.1], yaw: 0.45 },
  { asset: "prop-grass", x: 3.6, z: -6.6, size: [0.6, 0.72, 0.55], yaw: 0.3 },
  { asset: "prop-grass", x: 4.2, z: -7.1, size: [0.72, 0.85, 0.6], yaw: -0.5 },
  { asset: "prop-grass", x: 4.85, z: -7.35, size: [0.55, 0.62, 0.5], yaw: 1.1 },
  { asset: "prop-grass", x: -5.1, z: 6.6, size: [0.62, 0.75, 0.52], yaw: -0.9 },
  { asset: "prop-fallen-log", x: -9.45, z: 6.9, size: [2.3, 0.42, 0.58], yaw: -0.4 },
];

/** Validate complete rotated footprints before either fallback or library loading. */
export function firstLightDressingSites(context: ZoneSceneContext): DressingSite[] {
  return composition.flatMap((site, index) => {
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2;
    const rz = (site.size[2] * c + site.size[0] * s) / 2;
    const nx = Math.ceil(rx * 2 / 0.15), nz = Math.ceil(rz * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE || Math.hypot(x, z) <= 3
        || Math.hypot(x, y + site.size[1], z) > ZONE_BUDGET.radius || context.onPath(x, z) || context.underWater(x, z)) return [];
    }
    return [{ ...site, tint: 0.91 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 9) / 100 }];
  });
}

export function createFirstLightDressing(context: ZoneSceneContext) {
  const sites = firstLightDressingSites(context);
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern();
    else if (site.asset === "prop-grass") source = createGrassTuft(901 + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.5, 0.45, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.getAttribute("color")) {
      const pigment = site.asset.startsWith("rock") ? [0.22, 0.26, 0.22] : site.asset === "prop-bush" ? [0.09, 0.2, 0.1] : [0.15, 0.11, 0.075];
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment).flat(), 3));
    }
    for (const key of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(key)) flat.deleteAttribute(key);
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    flat.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
    const fitted = fitDressing(flat, site, context.heightAt); flat.dispose();
    return fitted;
  });
  const fallback = parts.length ? mergeGeometries(parts)! : new BufferGeometry();
  parts.forEach(part => part.dispose());
  if (!parts.length) {
    for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3], ["uv", 2], ["dressingSurface", 1]] as const)
      fallback.setAttribute(name, new Float32BufferAttribute([], size));
  }
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  fallback.userData.parts = [];
  return createLibraryBatch(fallback, sites, context.heightAt);
}
