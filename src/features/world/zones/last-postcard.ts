import {
  BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry,
  Float32BufferAttribute, Group, Mesh, Shape, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneFactory, type ZoneSceneContext } from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "paper" | "ink" | "forestDeep" | "forestLight" | "water" | "flower" | "dusk";
type Footprint = { x: number; z: number; halfX: number; halfZ: number; height: number };
type Site = Footprint & { base: number; bottom: number; sign: number };

// All three props share a level 3 m (along Z) by 2 m timber platform.
// Bounds include bevels and the lantern's entire sway.
const FOOTPRINTS: readonly Footprint[] = [
  { x: 0, z: 0, halfX: 1, halfZ: 1.5, height: 0 },
  { x: -0.35, z: -0.45, halfX: 0.64, halfZ: 0.7, height: 1.95 * 1.3 },
  { x: 0.3, z: 0.8, halfX: 0.65, halfZ: 0.65, height: 1.94 },
  { x: 0.42, z: -1.1, halfX: 0.58, halfZ: 0.2, height: 3.2 },
];

/** Check filled footprints, not just centres: a dry post must not overhang the sea or a path bend. */
function findSites(context: ZoneSceneContext): Site[] {
  const offsets = [0, 3.5, -3.5, 7, -7, 10.5, -10.5, 14, -14, 17.5, -17.5, 21, -21];
  for (const offset of offsets) {
    for (const sign of [1, -1]) {
      const sites: Site[] = [];
      // Validate the filled platform, including empty space between the furniture.
      const footprint = FOOTPRINTS[0]!;
      const x = sign * 5.1, z = offset;
      const groundAtCentre = context.heightAt(x, z);
      let safe = Number.isFinite(groundAtCentre), bottom = groundAtCentre, top = groundAtCentre;
      const nx = Math.ceil(footprint.halfX * 2 / 0.1), nz = Math.ceil(footprint.halfZ * 2 / 0.1);
      for (let ix = 0; safe && ix <= nx; ix++) {
        for (let iz = 0; safe && iz <= nz; iz++) {
          const px = x - footprint.halfX + ix / nx * footprint.halfX * 2;
          const pz = z - footprint.halfZ + iz / nz * footprint.halfZ * 2;
          const ground = context.heightAt(px, pz);
          safe = Math.abs(px) > PATH_CLEARANCE && !context.onPath(px, pz)
            && !context.underWater(px, pz) && Number.isFinite(ground)
            && Math.abs(ground - groundAtCentre) <= 0.3;
          bottom = Math.min(bottom, ground);
          top = Math.max(top, ground);
        }
      }
      if (!safe) continue;
      const base = top + 0.12;
      for (const prop of FOOTPRINTS) {
        const px = x + sign * prop.x, pz = z + sign * prop.z;
        // Conservative box corners cover even the animated lantern at its highest sway.
        if (Math.hypot(Math.abs(px) + prop.halfX, Math.max(Math.abs(bottom), Math.abs(base + prop.height)),
          Math.abs(pz) + prop.halfZ) > ZONE_BUDGET.radius) break;
        sites.push({ ...prop, x: px, z: pz, base, bottom: prop === footprint ? bottom : base, sign });
      }
      if (sites.length === FOOTPRINTS.length) return sites;
    }
  }
  // No allocation has happened yet; the caller can choose another terrain anchor.
  throw new RangeError("last-postcard needs a dry footprint beside the walking corridor");
}

/** Shallow bevels and an uneven shoulder, with a polygonal arched lid for the mailbox. */
function bevel(size: Point, center: Point, arched = false): BufferGeometry {
  const [w, h, d] = size;
  const outline = arched
    ? [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h * 0.2], [w * 0.36, h * 0.43],
      [w * 0.12, h / 2], [-w * 0.16, h * 0.49], [-w * 0.4, h * 0.4], [-w / 2, h * 0.18]]
    : [[-w / 2, -h / 2], [w / 2, -h / 2], [w * 0.495, h * 0.48], [-w * 0.49, h / 2]];
  const edge = Math.min(0.018, w / 8, h / 8, d / 5);
  const shape = new Shape();
  outline.forEach(([x, y], i) => {
    const px = x! * (w - edge * 2) / w, py = y! * (h - edge * 2) / h;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  });
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: d - edge * 2, steps: 1, bevelEnabled: true,
    bevelThickness: edge, bevelSize: edge, bevelSegments: 1, curveSegments: 1,
  });
  // Extrusion bevels can overshoot the slanted shoulders; retain the requested dimensions.
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const sx = w / (bounds.max.x - bounds.min.x), sy = h / (bounds.max.y - bounds.min.y);
  const tx = center[0] - (bounds.min.x + bounds.max.x) * sx / 2;
  const ty = center[1] - (bounds.min.y + bounds.max.y) * sy / 2;
  return geometry.scale(sx, sy, 1).translate(tx, ty, center[2] - d / 2 + edge);
}

function box(size: Point, center: Point): BufferGeometry {
  return new BoxGeometry(...size).translate(...center);
}

/** All static parts merge by pigment; the single moving lantern has its own batch. */
export const createLastPostcardScene: ZoneSceneFactory = context => {
  const [platform, mailbox, rack, lamp] = findSites(context) as [Site, Site, Site, Site];
  const group = new Group();
  group.name = "last-postcard";
  const lantern = new Group();
  lantern.name = "shore-lantern";
  lantern.position.set(lamp.x - lamp.sign * 0.42, lamp.base + 3, lamp.z);
  group.add(lantern);
  const batches = new Map<Group, Map<Surface, BufferGeometry[]>>();

  function add(part: BufferGeometry, surface: Surface, site?: Site, facing = 0, groundBottom = false) {
    if (site) {
      part.rotateY(facing + (site.sign < 0 ? Math.PI : 0)).translate(site.x, site.base, site.z);
      // Only the platform underside follows terrain; every prop sits on its level top.
      const vertices = part.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        if (groundBottom && vertices.getY(i) < site.base - 0.06) {
          vertices.setY(i, context.heightAt(vertices.getX(i), vertices.getZ(i)));
        }
      }
    }
    const parent = site ? group : lantern;
    const flat = part.index ? part.toNonIndexed() : part;
    if (flat !== part) part.dispose();
    flat.clearGroups();
    flat.deleteAttribute("uv");
    flat.computeVertexNormals();
    const positions = flat.getAttribute("position"), colors: number[] = [];
    const phase = (Math.imul(context.seed, 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
    for (let i = 0; i < positions.count; i++) {
      const wash = 0.96 + 0.025 * Math.sin(positions.getX(i) * 31 + positions.getZ(i) * 43 + phase)
        + 0.015 * Math.sin(positions.getY(i) * 19 + phase);
      colors.push(wash, wash, wash);
    }
    flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
    let surfaces = batches.get(parent);
    if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
    const parts = surfaces.get(surface) ?? [];
    parts.push(flat);
    surfaces.set(surface, parts);
  }

  // Four broad boards retain a quiet silhouette instead of scattered individual props.
  for (let board = 0; board < 4; board++) {
    add(box([2, 0.12, 0.75], [0, -0.06, (board - 1.5) * 0.75]), "wood", platform, 0, true);
  }
  const mail = (part: BufferGeometry, surface: Surface) => add(part.scale(1.3, 1.3, 1.3), surface, mailbox, -Math.PI / 2);
  // Front faces the path: a 1.3x cream barrel, recessed blank door and dark slot.
  mail(bevel([0.19, 1.17, 0.18], [0.025, 0.585, 0]), "ink");
  mail(bevel([0.76, 0.11, 0.55], [0, 1.15, 0]), "wood");
  mail(bevel([0.96, 0.68, 0.74], [0, 1.55, 0], true), "paper");
  mail(bevel([0.7, 0.37, 0.025], [0, 1.43, 0.382]), "ink");
  mail(bevel([0.65, 0.32, 0.025], [0, 1.43, 0.399]), "paper");
  mail(box([0.53, 0.045, 0.018], [0, 1.69, 0.386]), "ink");
  mail(box([0.57, 0.025, 0.065], [0, 1.727, 0.397]), "paper");
  mail(bevel([0.09, 0.045, 0.06], [0, 1.48, 0.437]), "wood");
  mail(box([0.027, 0.19, 0.025], [0.494, 1.56, -0.05]), "wood");
  mail(bevel([0.03, 0.08, 0.11], [0.497, 1.64, -0.008]), "flower");

  // Six thick, blank postcards on a three-sided spindle; broad pigments recall visited zones.
  add(bevel([0.12, 0.4, 0.12], [0, 0.2, 0]), "ink", rack);
  add(bevel([0.12, 1.48, 0.12], [0, 1.14, 0]), "wood", rack);
  for (const yaw of [0, Math.PI / 2]) {
    add(bevel([1.24, 0.085, 0.16], [0, 0.0425, 0]).rotateY(yaw), "wood", rack);
  }
  add(new CylinderGeometry(0.13, 0.13, 0.08, 6).translate(0, 1.84, 0), "wood", rack);
  const pigments = ["forestDeep", "forestLight", "water"] as const;
  for (let face = 0; face < 3; face++) {
    const yaw = face * Math.PI * 2 / 3 + 0.12;
    for (let row = 0; row < 2; row++) {
      const y = 1.06 + row * 0.49;
      add(bevel([0.51, 0.35, 0.025], [0, y, 0.35]).rotateY(yaw), "paper", rack);
      add(box([0.425, 0.255, 0.008], [0, y + 0.009, 0.37]).rotateY(yaw), pigments[face]!, rack);
      add(box([0.425, 0.06, 0.009], [0, y - 0.088, 0.376]).rotateY(yaw),
        face === 2 ? "forestDeep" : "forestLight", rack);
      add(bevel([0.56, 0.045, 0.095], [0, y - 0.186, 0.35]).rotateY(yaw), "wood", rack);
      add(box([0.045, 0.41, 0.055], [0, y, 0.28]).rotateY(yaw), "wood", rack);
      // Two small orange suns on the postcards facing the walking path.
      if (face === 2) add(bevel([0.11, 0.11, 0.012], [0.12, y + 0.065, 0.383]).rotateY(yaw), "flower", rack);
    }
  }

  add(bevel([0.16, 1.4, 0.16], [0, 0.7, 0]), "ink", lamp);
  add(bevel([0.16, 1.8, 0.16], [0, 2.3, 0]), "wood", lamp);
  add(bevel([0.64, 0.1, 0.12], [-0.23, 3.13, 0]), "wood", lamp);
  add(box([0.027, 0.17, 0.027], [-0.42, 3.04, 0]), "wood", lamp);
  // Painted dusk pigment, never a light or emissive material.
  add(new CylinderGeometry(0.12, 0.1, 0.32, 6).translate(0, -0.19, 0), "dusk");
  add(new CylinderGeometry(0.045, 0.175, 0.085, 6).translate(0, -0.025, 0), "dusk");
  add(new CylinderGeometry(0.12, 0.065, 0.06, 6).translate(0, -0.38, 0), "dusk");

  const geometries: BufferGeometry[] = [], materials: MeshToonMaterial[] = [];
  for (const [parent, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach(part => part.dispose());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
      if (surface !== "wood" && surface !== "paper") {
        material.color.set(PALETTE[surface]);
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = `last-postcard-${surface}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      geometries.push(geometry);
      materials.push(material);
    }
  }
  let elapsed = 0, disposed = false;
  return {
    zoneId: "last-postcard",
    group,
    interactable: {
      position: new Vector3(mailbox.x, mailbox.base + 1.55 * 1.3, mailbox.z),
      label: { en: "The last mailbox", vi: "Hộp thư cuối đường" },
    },
    colliders: [platform, mailbox, rack, lamp].map(site => ({
      center: new Vector3(site.x, (site.bottom + site.base + site.height) / 2, site.z),
      size: new Vector3(site.halfX * 2, site.base + site.height - site.bottom, site.halfZ * 2),
    })),
    update(dt, reducedMotion) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      lantern.rotation.z = Math.sin(elapsed * 0.45) * 0.018;
      lantern.rotation.x = Math.sin(elapsed * 0.31) * 0.012;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    },
  };
};
