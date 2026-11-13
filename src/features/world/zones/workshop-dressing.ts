import { Box3, BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { createBroadleafBush, createFern, createGrassTuft } from "../foliage/ground";
import { createRockGeometry } from "../props/rocks";
import { createLogGeometry } from "../props/wood";
import type { WorkshopAsset } from "../props/workshop-library";
import { PATH_CLEARANCE, type ZoneSceneContext } from "./types";

type DressingSurface = "wood" | "stone" | "moss";
export interface WorkshopDressingPart {
  geometry: BufferGeometry;
  surface: DressingSurface;
  asset: WorkshopAsset;
  bounds: Box3;
  yaw: number;
  colorScale: Vector3;
}

/** Deliberate, asymmetric islands outside the three gate bays and bench approach.
 * Coordinates follow the selected dry site, including reflection/relocation.
 */
export function createWorkshopDressing(context: ZoneSceneContext, side: number, offsetZ: number) {
  const placements: readonly [WorkshopAsset, number, number, number, number, number, number][] = [
    ["rock-boulder-1", -7.25, -3.85, 0.96, 0.56, 0.78, 0.3],
    ["rock-boulder-2", -6.55, -4.15, 0.56, 0.29, 0.5, 1.8],
    ["rock-boulder-4", -7.56, -3.15, 0.45, 0.25, 0.48, 2.6],
    ["prop-fallen-log", -7.15, 3.18, 1.25, 0.23, 0.37, 0.25],
    ["prop-bush", -7.5, -4.65, 0.68, 0.67, 0.68, 0.4],
    ["prop-bush", -7.65, 4.05, 0.58, 0.52, 0.62, 2.1],
    ["prop-fern", -7.45, -2.42, 0.64, 0.4, 0.62, 0.7],
    ["prop-fern", -6.62, -3.3, 0.62, 0.38, 0.58, 2.4],
    ["prop-fern", -7.48, 2.55, 0.68, 0.43, 0.64, 1.7],
    ["prop-fern", -6.18, 3.18, 0.5, 0.32, 0.5, 3.8],
    ...Array.from({ length: 8 }, (_, i): [WorkshopAsset, number, number, number, number, number, number] => [
      "prop-grass", -3.53 - (i % 3) * 0.19, -4.62 + Math.floor(i / 3) * 0.38,
      0.22 + (i % 2) * 0.06, 0.35 + (i % 3) * 0.075, 0.24, i * 2.39996,
    ]),
  ];
  const result: WorkshopDressingPart[] = [];
  for (const [asset, x, z, width, height, depth, rotation] of placements) {
    const yaw = rotation + (context.seed >>> 0) % 17 * 0.037;
    const wx = x * side, wz = z * side + offsetZ;
    // Validate the full envelope, not just its centre. Never touch water/path.
    const footprint = new Box3(new Vector3(wx - width / 2, 0, wz - depth / 2), new Vector3(wx + width / 2, height, wz + depth / 2));
    let valid = true;
    for (let ix = 0; ix <= 8; ix++) for (let iz = 0; iz <= 8; iz++) {
      const px = footprint.min.x + width * ix / 8, pz = footprint.min.z + depth * iz / 8;
      if (Math.abs(px) <= PATH_CLEARANCE || context.onPath(px, pz) || context.underWater(px, pz)) valid = false;
    }
    if (!valid) continue;
    const surface: DressingSurface = asset.startsWith("rock") ? "stone" : asset === "prop-fallen-log" ? "wood" : "moss";
    let geometry = surface === "stone" ? createRockGeometry("stone", context.seed + Math.round(x * 101))
      : surface === "wood" ? createLogGeometry(context.seed)
        : asset === "prop-fern" ? createFern(context.seed) : asset === "prop-bush" ? createBroadleafBush(context.seed) : createGrassTuft(context.seed);
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
    geometry.rotateY(yaw);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!, size = bounds.getSize(new Vector3());
    geometry.translate(-bounds.min.x, -bounds.min.y, -bounds.min.z).scale(width / size.x, height / size.y, depth / size.z)
      .translate(footprint.min.x, surface === "stone" || surface === "wood" ? -0.055 : -0.012, footprint.min.z);
    geometry.computeBoundingBox();
    const envelope = geometry.boundingBox!.clone();
    const pigment = new Color(surface === "stone" ? PALETTE.rock : surface === "wood" ? PALETTE.rockDark : PALETTE.forestLight);
    // Moss and foliage share one draw: compensate for its deep-green base tint.
    const colorScale = surface === "moss" ? new Vector3(...new Color(PALETTE.forestDeep).toArray().map(v => 0.78 / v)) : new Vector3(1, 1, 1);
    const colors: number[] = [];
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const shade = 0.86 + Math.sin(i * 0.9 + yaw) * 0.08;
      colors.push(pigment.r * colorScale.x * shade, pigment.g * colorScale.y * shade, pigment.b * colorScale.z * shade);
      position.setY(i, position.getY(i) + context.heightAt(position.getX(i), position.getZ(i)));
    }
    for (const name of Object.keys(geometry.attributes)) if (name !== "position") geometry.deleteAttribute(name);
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    result.push({ geometry, surface, asset, bounds: envelope, yaw, colorScale });
  }
  return result;
}
