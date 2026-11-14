import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingLoader, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext } from "./types";

// Windward grass in the open light, sheltered ferns below the fence, and a
// washed-up branch behind it. The front of the mailbox and sea view stay open.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: 1.65, z: -4.05, size: [0.72, 0.24, 0.48], yaw: 0.35 },
  { asset: "rock-boulder-3", x: 2.85, z: -3.7, size: [0.46, 0.18, 0.38], yaw: -0.7 },
  { asset: "rock-boulder-3", x: 3.6, z: 4.05, size: [0.68, 0.28, 0.5], yaw: 0.8 },
  { asset: "prop-fern", x: 3.4, z: -1.55, size: [0.85, 0.46, 0.7], yaw: 0.45 },
  { asset: "prop-fern", x: 3.3, z: 1.55, size: [0.72, 0.4, 0.64], yaw: -0.4 },
  { asset: "prop-bush", x: 3.8, z: 0.2, size: [1.18, 0.64, 0.94], yaw: 0.3 },
  { asset: "prop-grass", x: -0.95, z: -3.35, size: [0.52, 0.63, 0.45], yaw: 0.25 },
  { asset: "prop-grass", x: -0.25, z: -3.9, size: [0.64, 0.76, 0.5], yaw: -0.55 },
  { asset: "prop-grass", x: 0.65, z: -4.15, size: [0.48, 0.58, 0.42], yaw: 1.1 },
  { asset: "prop-grass", x: 0.1, z: 4.4, size: [0.6, 0.68, 0.52], yaw: -0.8 },
  { asset: "prop-fallen-log", x: 4.1, z: -2.45, size: [1.9, 0.28, 0.42], yaw: -0.3 },
];

/** Sample the filled rotated envelope, including gaps between mesh vertices. */
export function lastPostcardDressingSites(context: ZoneSceneContext, anchor: { x: number; z: number; sign: number },
  colliders: readonly ZoneCollider[]): DressingSite[] {
  return composition.flatMap((part, index) => {
    const site = { ...part, x: anchor.x + anchor.sign * part.x, z: anchor.z + anchor.sign * part.z,
      yaw: part.yaw + (anchor.sign < 0 ? Math.PI : 0),
      tint: 0.92 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 7) / 100 };
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2 + 0.02;
    const rz = (site.size[2] * c + site.size[0] * s) / 2 + 0.02;
    // No new collision box: all decoration occupies the unwalked outer shoulder.
    if (colliders.some(box => Math.abs(site.x - box.center.x) < rx + box.size.x / 2 + 0.08
      && Math.abs(site.z - box.center.z) < rz + box.size.z / 2 + 0.08)) return [];
    const nx = Math.ceil(rx * 2 / 0.1), nz = Math.ceil(rz * 2 / 0.1);
    let low = Infinity, high = -Infinity;
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
        || Math.hypot(x, Math.abs(y) + site.size[1], z) > ZONE_BUDGET.radius) return [];
      low = Math.min(low, y); high = Math.max(high, y);
    }
    return high - low <= 0.4 ? [site] : [];
  });
}

export function createLastPostcardDressing(context: ZoneSceneContext, anchor: { x: number; z: number; sign: number },
  colliders: readonly ZoneCollider[], load?: DressingLoader) {
  const sites = lastPostcardDressingSites(context, anchor, colliders);
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern();
    else if (site.asset === "prop-grass") source = createGrassTuft(context.seed + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.5, 0.4, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.getAttribute("color")) {
      const pigment = new Color(PALETTE[site.asset.startsWith("rock") ? "rock" : site.asset === "prop-bush" ? "forestDeep" : "rockDark"]);
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment.toArray()).flat(), 3));
    }
    for (const key of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(key)) flat.deleteAttribute(key);
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    flat.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
    const fitted = fitDressing(flat, site, context.heightAt); flat.dispose();
    return fitted;
  });
  const fallback = parts.length ? mergeGeometries(parts)! : new BufferGeometry();
  parts.forEach(part => part.dispose());
  if (!parts.length) for (const [key, size] of [["position", 3], ["normal", 3], ["color", 3], ["uv", 2], ["dressingSurface", 1]] as const)
    fallback.setAttribute(key, new Float32BufferAttribute([], size));
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt, load);
  batch.mesh.name = "last-postcard-dressing";
  batch.mesh.userData.sites = sites;
  return batch;
}
