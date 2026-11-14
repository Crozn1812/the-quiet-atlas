import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createBroadleafBush, createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingLoader, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneContext } from "./types";

// A broken stone apron behind the portrait, damp pockets at its feet and the
// pine, then taller grass in the open trail shoulder. Leave the E approach bare.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: 7.1, z: -2.7, size: [1.35, 0.64, 1.0], yaw: 0.35 },
  { asset: "rock-boulder-3", x: 7.9, z: -2.4, size: [0.8, 0.37, 0.72], yaw: -0.8 },
  { asset: "rock-boulder-1", x: 6.9, z: -3.5, size: [0.52, 0.26, 0.65], yaw: 1.8 },
  { asset: "prop-fern", x: 5.8, z: -2.6, size: [0.85, 0.48, 0.8], yaw: 0.6 },
  { asset: "prop-fern", x: 5.1, z: 2.7, size: [0.72, 0.4, 0.68], yaw: -0.7 },
  { asset: "prop-fern", x: 14.15, z: 2.7, size: [1.05, 0.62, 0.88], yaw: 1.4 },
  { asset: "prop-fern", x: 14.6, z: 3.5, size: [0.78, 0.46, 0.7], yaw: -1.2 },
  { asset: "prop-bush", x: 8.9, z: -2.85, size: [1.15, 0.8, 1.0], yaw: 0.4 },
  { asset: "prop-bush", x: 15.7, z: 3.8, size: [1.25, 0.86, 1.1], yaw: -0.9 },
  { asset: "prop-fallen-log", x: 11.4, z: 3.35, size: [2.2, 0.34, 0.48], yaw: 0.35 },
  { asset: "prop-grass", x: 3.65, z: -4.6, size: [0.5, 0.62, 0.48], yaw: 0.3 },
  { asset: "prop-grass", x: 4.2, z: -5.1, size: [0.62, 0.78, 0.52], yaw: -0.8 },
  { asset: "prop-grass", x: 4.8, z: -5.25, size: [0.45, 0.56, 0.42], yaw: 1.2 },
  { asset: "prop-grass", x: 3.7, z: 4.4, size: [0.48, 0.59, 0.45], yaw: -1.1 },
  { asset: "prop-grass", x: 4.25, z: 4.8, size: [0.56, 0.7, 0.5], yaw: 0.8 },
  { asset: "prop-grass", x: 5.0, z: 5.1, size: [0.42, 0.52, 0.4], yaw: 2.0 },
];

/** Follow the existing statue's dry-bank reflection and retreat, without
 * influencing its placement, interaction point, colliders or inscriptions.
 */
export function milestonesDressingSites(context: ZoneSceneContext, side: number, offsetZ: number): DressingSite[] {
  return composition.flatMap((source, index) => {
    const variation = (Math.imul(context.seed ^ (index + 1), 1664525) >>> 0) % 11;
    const site: DressingSite = { ...source, x: source.x * side, z: source.z + offsetZ,
      yaw: source.yaw * side, tint: 0.91 + variation * 0.008 };
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2;
    const rz = (site.size[2] * c + site.size[0] * s) / 2;
    const nx = Math.ceil(rx * 2 / 0.15), nz = Math.ceil(rz * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
        || Math.hypot(x, y + site.size[1], z) > ZONE_BUDGET.radius) return [];
    }
    return [site];
  });
}

/** One static draw on every tier. The existing batch owns quality, distance
 * culling and deferred LOD1/CC0 decoding after the first playable paint.
 */
export function createMilestonesDressing(context: ZoneSceneContext, side: number, offsetZ: number, load?: DressingLoader) {
  const sites = milestonesDressingSites(context, side, offsetZ);
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern(context.seed + index);
    else if (site.asset === "prop-grass") source = createGrassTuft(901 + index);
    else if (site.asset === "prop-bush") source = createBroadleafBush(context.seed + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.5, 0.42, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.hasAttribute("color")) {
      const pigment = new Color(site.asset.startsWith("rock") ? PALETTE.rock : PALETTE.rockDark);
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment.toArray()).flat(), 3));
    }
    for (const name of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(name)) flat.deleteAttribute(name);
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    flat.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
    const fitted = fitDressing(flat, site, context.heightAt);
    flat.dispose();
    return fitted;
  });
  const fallback = parts.length ? mergeGeometries(parts)! : new BufferGeometry();
  parts.forEach(part => part.dispose());
  if (!parts.length) {
    for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3], ["uv", 2], ["dressingSurface", 1]] as const)
      fallback.setAttribute(name, new Float32BufferAttribute([], size));
  }
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt, load);
  batch.mesh.name = "milestones-dressing";
  return batch;
}
