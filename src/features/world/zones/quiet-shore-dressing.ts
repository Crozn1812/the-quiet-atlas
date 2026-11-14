import { createHrPropsBatch as createLibraryBatch } from "../props/hr-props";
import { hrLandscapeSites } from "./hr-props-dressing";
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createFern, createGrassTuft } from "../foliage/ground";
import { fitDressing, type DressingLoader, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext } from "./types";

// Porch-relative: a split stone pair and driftwood frame the seaward side;
// fern in the rail's shade, three unequal grass tufts in the open afternoon gap.
const composition: readonly Omit<DressingSite, "tint">[] = [
  { asset: "rock-boulder-1", x: 1.25, z: 2.8, size: [1.35, 0.62, 1.05], yaw: 0.35 },
  { asset: "rock-boulder-3", x: 1.95, z: 3.3, size: [0.7, 0.32, 0.6], yaw: -0.65 },
  { asset: "prop-fern", x: 1.8, z: -2.8, size: [0.85, 0.65, 0.8], yaw: 0.8 },
  { asset: "prop-fallen-log", x: 1.75, z: -4.6, size: [2.6, 0.4, 0.58], yaw: -1.4 },
  { asset: "prop-grass", x: 1.1, z: 4.6, size: [0.7, 0.85, 0.6], yaw: 0.3 },
  { asset: "prop-grass", x: 1.8, z: 4.95, size: [0.56, 0.65, 0.5], yaw: -0.55 },
  { asset: "prop-grass", x: 0.45, z: 4.8, size: [0.6, 0.72, 0.55], yaw: 1.2 },
];

/** Match the porch's rotation, including its opposite-bank fallback. */
export function quietShoreDressingSites(context: ZoneSceneContext, porch: { x: number; z: number; side: number },
  colliders: readonly ZoneCollider[] = []): DressingSite[] {
  return composition.flatMap((source, index) => {
    const site = { ...source, x: porch.x + porch.side * source.x, z: porch.z + porch.side * source.z,
      yaw: source.yaw + (porch.side < 0 ? Math.PI : 0) };
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const rx = (site.size[0] * c + site.size[2] * s) / 2, rz = (site.size[2] * c + site.size[0] * s) / 2;
    // Keep decorative geometry outside every existing solid, including the bike and steps.
    if (colliders.some(box => Math.abs(site.x - box.center.x) < rx + box.size.x / 2 + 0.12
      && Math.abs(site.z - box.center.z) < rz + box.size.z / 2 + 0.12)) return [];
    const nx = Math.ceil(rx * 2 / 0.15), nz = Math.ceil(rz * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - rx + rx * 2 * ix / nx, z = site.z - rz + rz * 2 * iz / nz;
      const y = context.heightAt(x, z);
      if (!Number.isFinite(y) || Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
        || Math.hypot(x, y + site.size[1], z) > ZONE_BUDGET.radius) return [];
    }
    return [{ ...site, tint: 0.91 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 9) / 100 }];
  });
}

function batchAttributes(geometry: BufferGeometry) {
  for (const name of Object.keys(geometry.attributes))
    if (!["position", "normal", "color"].includes(name)) geometry.deleteAttribute(name);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
}

/** Keep porch moss and all dressing in the existing leaf draw, with no simulation update. */
export function createQuietShoreDressing(context: ZoneSceneContext, moss: BufferGeometry,
  porch: { x: number; z: number; side: number }, colliders: readonly ZoneCollider[], load?: DressingLoader) {
  const tint = new Color(PALETTE.grass), colors = moss.getAttribute("color");
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * tint.r, colors.getY(i) * tint.g, colors.getZ(i) * tint.b);
  batchAttributes(moss);
  const sites = quietShoreDressingSites(context, porch, colliders);
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern();
    else if (site.asset === "prop-grass") source = createGrassTuft(context.seed + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.5, 0.42, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.getAttribute("color")) {
      const pigment = new Color(site.asset.startsWith("rock") ? PALETTE.rock : PALETTE.rockDark);
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => pigment.toArray()).flat(), 3));
    }
    batchAttributes(flat);
    const fitted = fitDressing(flat, site, context.heightAt); flat.dispose();
    return fitted;
  });
  const fallback = mergeGeometries([moss, ...parts])!;
  fallback.userData.retainedVertices = moss.getAttribute("position").count;
  parts.forEach(part => part.dispose());
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt, load, moss, hrLandscapeSites(context, "palm", colliders));
  batch.mesh.name = "quiet-shore-leaf";
  batch.mesh.castShadow = true;
  batch.mesh.userData.dressingSites = sites;
  return batch;
}
