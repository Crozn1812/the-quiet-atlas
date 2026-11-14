import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createBroadleafBush, createFern, createGrassTuft } from "../foliage/ground";
import { createLibraryBatch, fitDressing, type DressingLoader, type DressingSite } from "../props/library-batch";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext } from "./types";

interface OverlookLayout {
  viewer: readonly [number, number];
  bench: readonly [number, number];
  rail: readonly [number, number];
}

/** Wind-pruned islands, rather than an even scatter: stone outcrop behind the
 * seat, sheltered fern pockets at the rail ends, a fallen trunk inland, and
 * taller grass on the sunny shoulder. Keep the sea and the seat approach open.
 */
export function horizonDressingSites(context: ZoneSceneContext, layout: OverlookLayout,
  colliders: readonly ZoneCollider[]): DressingSite[] {
  const [bx, bz] = layout.bench, [rx, rz] = layout.rail;
  const composition: readonly Omit<DressingSite, "tint">[] = [
    { asset: "rock-boulder-1", x: bx + 1.1, z: bz - 2.5, size: [1.65, 0.68, 1.15], yaw: 0.3 },
    { asset: "rock-boulder-3", x: bx + 2.05, z: bz - 2.15, size: [0.85, 0.37, 0.72], yaw: 1.8 },
    { asset: "rock-boulder-1", x: bx + 0.75, z: bz - 3.25, size: [0.55, 0.22, 0.48], yaw: -0.9 },
    { asset: "prop-bush", x: bx + 2.35, z: bz - 3.15, size: [1.2, 0.65, 0.95], yaw: 0.6 },
    { asset: "prop-fern", x: bx + 0.25, z: bz - 2.65, size: [0.85, 0.43, 0.8], yaw: 0.5 },
    { asset: "prop-fern", x: rx + 0.55, z: rz + 2.85, size: [0.95, 0.48, 0.8], yaw: 2.1 },
    { asset: "rock-boulder-3", x: rx + 0.9, z: rz + 3.65, size: [1.2, 0.42, 0.85], yaw: -0.6 },
    { asset: "prop-bush", x: rx + 1.7, z: rz + 4.15, size: [1.35, 0.72, 1.1], yaw: 1.2 },
    { asset: "prop-fallen-log", x: -7.4, z: -5.6, size: [2.5, 0.38, 0.6], yaw: -0.35 },
    { asset: "prop-fern", x: -6.5, z: -4.8, size: [1.1, 0.56, 0.95], yaw: -0.8 },
    { asset: "prop-fern", x: -8.3, z: -5.3, size: [0.8, 0.43, 0.75], yaw: 1.5 },
    { asset: "prop-bush", x: -8.5, z: -6.5, size: [1.35, 0.8, 1.1], yaw: -0.4 },
    ...Array.from({ length: 9 }, (_, i) => ({
      asset: "prop-grass" as const, x: 3.5 + (i % 3) * 0.43,
      z: bz - 2.6 - Math.floor(i / 3) * 0.7 - (i % 2) * 0.2,
      size: [0.36 + (i % 3) * 0.07, 0.54 + (i % 4) * 0.09, 0.4] as const, yaw: i * 2.39996,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      asset: "prop-grass" as const, x: rx - 0.7 + i * 0.48, z: rz + 4.7 + (i % 2) * 0.4,
      size: [0.42, 0.58 + (i % 3) * 0.1, 0.38] as const, yaw: 0.6 + i * 2.39996,
    })),
  ];
  return composition.flatMap((authored, index) => {
    const site = { ...authored, yaw: authored.yaw + ((context.seed >>> 0) % 17) * 0.021,
      tint: 0.88 + ((Math.imul(context.seed ^ index, 1664525) >>> 0) % 11) / 100 };
    const c = Math.abs(Math.cos(site.yaw)), s = Math.abs(Math.sin(site.yaw));
    const hx = (site.size[0] * c + site.size[2] * s) / 2;
    const hz = (site.size[2] * c + site.size[0] * s) / 2;
    // Check the entire rotated envelope on a 15 cm grid, including its interior.
    const nx = Math.ceil(2 * hx / 0.15), nz = Math.ceil(2 * hz / 0.15);
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = site.x - hx + 2 * hx * ix / nx, z = site.z - hz + 2 * hz * iz / nz;
      if (!Number.isFinite(context.heightAt(x, z)) || Math.abs(x) <= PATH_CLEARANCE
        || Math.hypot(x, z) > ZONE_BUDGET.radius || context.onPath(x, z) || context.underWater(x, z)
        || colliders.some(box => Math.abs(x - box.center.x) <= box.size.x / 2 + 0.45
          && Math.abs(z - box.center.z) <= box.size.z / 2 + 0.45)
        || (x > 0 && x < bx + 0.9 && Math.abs(z - bz) < 1.7)
        || (x > 0 && x < layout.viewer[0] + 0.8 && Math.abs(z - layout.viewer[1]) < 1)) return [];
    }
    return [site];
  });
}

/** One distance-culled draw on every tier. The compact CC0 library replaces
 * only the cheap silhouettes, after the first visible playable frame.
 */
export function createHorizonDressing(context: ZoneSceneContext, layout: OverlookLayout,
  colliders: readonly ZoneCollider[], load?: DressingLoader) {
  const sites = horizonDressingSites(context, layout, colliders);
  if (!sites.length) return undefined;
  const parts = sites.map((site, index) => {
    let source: BufferGeometry;
    if (site.asset === "prop-fern") source = createFern();
    else if (site.asset === "prop-grass") source = createGrassTuft(context.seed + index);
    else if (site.asset === "prop-bush") source = createBroadleafBush(context.seed + index);
    else if (site.asset === "prop-fallen-log") source = new CylinderGeometry(0.45, 0.5, 2, 7).rotateZ(Math.PI / 2);
    else source = new IcosahedronGeometry(1, 0);
    const flat = source.index ? source.toNonIndexed() : source;
    if (flat !== source) source.dispose();
    const count = flat.getAttribute("position").count;
    if (!flat.getAttribute("color")) {
      const color = new Color(site.asset.startsWith("rock") ? PALETTE.rock : PALETTE.rockDark);
      flat.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => color.toArray()).flat(), 3));
    }
    for (const name of Object.keys(flat.attributes)) if (!["position", "normal", "color"].includes(name)) flat.deleteAttribute(name);
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
    flat.setAttribute("dressingSurface", new Float32BufferAttribute(new Float32Array(count).fill(-1), 1));
    const fitted = fitDressing(flat, site, context.heightAt);
    flat.dispose();
    return fitted;
  });
  const fallback = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  fallback.computeBoundingBox(); fallback.computeBoundingSphere();
  const batch = createLibraryBatch(fallback, sites, context.heightAt, load);
  batch.mesh.name = "horizon-dressing";
  const after = batch.mesh.onAfterRender;
  batch.mesh.onAfterRender = function (...args) {
    const viewport = args[0]?.domElement?.closest("[data-world-build]");
    if (this.geometry.drawRange.count === 0 || viewport?.getAttribute("data-world-paused") !== "false") return;
    after.apply(this, args);
  };
  return batch;
}
