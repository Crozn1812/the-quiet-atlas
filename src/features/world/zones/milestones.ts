import {
  Box3, BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh,
  Sphere, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import certificates from "../../../content/certificates.json";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { TRUNK_HEIGHT } from "../foliage/colliders";
import { createPineCrownV2 } from "../foliage/pine";
import { createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { createRockGeometry } from "../props/rocks";
import { createMilestonesStatue } from "./milestones-statue";
import { createMilestonesDressing } from "./milestones-dressing";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

// The server validates this shared JSON through content; keep runtime schemas out of the world chunk.
const content = { profiles: [{ locale: "en", certificates: certificates.en }] };

type Surface = "weathered" | "future" | "ink" | "needles" | "flower";
interface Part {
  geometry: BufferGeometry;
  surface: Surface;
  x: number;
  z: number;
  solid: boolean;
  collisionGeometry?: BufferGeometry;
  yaw?: number;
}

export interface MilestoneCertificatePiece {
  readonly slot: number;
  readonly title: string;
  readonly inscription: string;
  readonly achieved: boolean;
  readonly charHeight: number;
  readonly carveDepth: number;
}

const STATUE_X = 4.7;
const STATUE_Z = 0;
export const STATUE_YAW = 25 * Math.PI / 180;
function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function toEnglishInscription(title: string): string {
  if (/\bccna\b/i.test(title)) return "CCNA";
  if (/\bdevops\b/i.test(title) && /\bvti\b/i.test(title)) return "VTI DEVOPS";
  if (/\baws\b/i.test(title) && /\barchitect\b/i.test(title)) return "AWS SAA";
  if (/\blinux\b/i.test(title) && /\bceh\b/i.test(title)) return "LINUX CEH";
  const cleaned = title
    .replace(/^(?:certificate of completion|planned|dự định|chứng nhận[^:]*)\s*[:\-–]?\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned.slice(0, 12).trim() || "MILESTONE";
}

/**
 * Derive statue certificate pieces from `src/content` only; nothing is added here.
 * Achieved certificates are welded into the body; planned certificates retain empty sockets.
 * The existing inscription mapping is shared by every glass piece and its cached text atlas.
 */
export function milestoneCertificates(
  source: { readonly profiles: readonly { readonly locale: string; readonly certificates: readonly { readonly title: string; readonly description: string }[] }[] } = content,
): MilestoneCertificatePiece[] {
  const profile = source.profiles.find(entry => entry.locale === "en") ?? source.profiles[0];
  const raw = [...(profile?.certificates ?? [])];
  return raw.map((item, slot) => {
    const planned = /^(?:planned|dự định)\b/i.test(item.title.trim())
      || /\b(?:not taken yet|still blank|chưa thi)\b/i.test(item.description);
    const inscription = toEnglishInscription(item.title);
    const multiLine = inscription.trim().split(/\s+/).length >= 2;
    return {
      slot,
      title: item.title,
      inscription,
      achieved: !planned,
      charHeight: multiLine ? 0.27 : 0.30,
      carveDepth: planned ? 0.012 : 0.065,
    };
  });
}

export const WEATHERED_BASE_HEX = 0xb5ada0;
export const FUTURE_BASE_HEX = 0xc5bdad;
export const INK_BASE_HEX = 0x7d776f;

/** Stand the kit's layered slab on edge: its broad cut faces the road (-X).
 * Used for the monumental statue plinth and the orbiting fractured stone shards.
 */
function stone(width: number, depth: number, height: number, lean: number, seed: number, future = false, rough = true) {
  const source = createRockGeometry("slab", seed);
  if (!future && rough) {
    const vertices = source.getAttribute("position");
    source.computeBoundingBox();
    const ringY = source.boundingBox!.max.y * 0.13;
    const corners = [...new Set(Array.from({ length: vertices.count }, (_, i) => i)
      .filter(i => Math.abs(vertices.getY(i) - ringY) < 1e-6)
      .map(i => Math.atan2(vertices.getZ(i), vertices.getX(i))))]
      .sort((a, b) => a - b);
    const scales = [0.72, 1.08, 0.91, 1.03, 0.78, 1.12];
    for (let i = 0; i < vertices.count; i++) {
      const angle = Math.atan2(vertices.getZ(i), vertices.getX(i));
      const corner = corners.findIndex(direction => Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction))) < 1e-5);
      const scale = scales[corner] ?? 1;
      vertices.setXYZ(i, vertices.getX(i) * scale, vertices.getY(i), vertices.getZ(i) * scale);
    }
  }
  if (!future) source.rotateZ(Math.PI / 2);
  source.computeBoundingBox();
  const bounds = source.boundingBox!, size = bounds.getSize(new Vector3());
  source.translate(-bounds.min.x - size.x / 2, -bounds.min.y, -bounds.min.z - size.z / 2);
  source.scale(depth * 0.9 / size.x, (height + 0.05) / size.y, width * 0.86 / size.z);
  const p = source.getAttribute("position"), c = source.getAttribute("color");
  const positions: number[] = [], pigments: number[] = [];
  const append = (a: Vector3, b: Vector3, d: Vector3, color: Color) => {
    for (const point of [a, b, d]) {
      const swell = !future && rough ? depth * 0.09 * Math.sin(Math.PI * point.y / (height + 0.05))
        * Math.cos((point.z / width + 0.13) * Math.PI) * Math.sign(point.x) : 0;
      positions.push(point.x + swell + (point.y - height / 2) * Math.tan(lean) * 0.35,
        point.y - 0.05, point.z + (point.y - height / 2) * Math.tan(lean));
      pigments.push(color.r, color.g, color.b);
    }
  };
  for (let i = 0; i < p.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1);
    const d = new Vector3().fromBufferAttribute(p, i + 2), pigment = new Color().fromBufferAttribute(c, i);
    const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    if (!future && rough && Math.abs(normal.x) > 0.99) {
      const ab = a.clone().lerp(b, 0.5), bd = b.clone().lerp(d, 0.5), da = d.clone().lerp(a, 0.5);
      append(a, ab, da, pigment); append(ab, b, bd, pigment);
      append(da, bd, d, pigment); append(ab, bd, da, pigment);
    } else append(a, b, d, pigment);
  }
  source.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(pigments, 3));
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  geometry.translate(-center.x, 0, -center.z);
  return geometry;
}

/** Author warm light-grey stone pigment (luma 0.45..0.60 on lit faces) before terrain draping. */
function weatherStone(geometry: BufferGeometry, height: number, width: number, seed: number, future = false, grounded = true) {
  const p = geometry.getAttribute("position"), c = geometry.getAttribute("color");
  const base = new Color(future ? FUTURE_BASE_HEX : WEATHERED_BASE_HEX);
  const warmStone = new Color(PALETTE.sand).lerp(new Color(PALETTE.paper), future ? 0.22 : 0.08);
  const moss = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.25);
  const lichen = new Color(PALETTE.paper);
  const random = randomFor(seed);
  const islands = Array.from({ length: 5 }, () => ({
    y: height * (0.28 + random() * 0.62), z: width * (random() - 0.5) * 0.7,
    ry: height * (0.08 + random() * 0.1), rz: width * (0.08 + random() * 0.1),
  }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const pigment = new Color().fromBufferAttribute(c, i).lerp(warmStone, 0.72);
    if (grounded) {
      const edge = 0.22 + 0.06 * Math.sin(z * 13 + seed) + 0.03 * Math.cos(x * 17);
      const mossAmount = Math.max(0, Math.min(1, (edge - y) / 0.18)) * (future ? 0.2 : 0.78);
      pigment.lerp(moss, mossAmount);
    }
    if (!future && y > 0.22) {
      const spread = Math.min(...islands.map(patch => ((y - patch.y) / patch.ry) ** 2 + ((z - patch.z) / patch.rz) ** 2));
      const ragged = 0.18 * Math.sin(y * 31 + z * 23 + seed);
      pigment.lerp(lichen, Math.max(0, Math.min(0.85, (1.25 + ragged - spread) * 0.8)));
    }
    c.setXYZ(
      i,
      Math.min(1, pigment.r / base.r),
      Math.min(1, pigment.g / base.g),
      Math.min(1, pigment.b / base.b),
    );
  }
}

function createPedestal(seed: number) {
  const lean = (2 + randomFor(seed)() * 3) * Math.PI / 180;
  const mainSeed = (seed + Math.imul(1, 2654435761)) >>> 0;
  const geometry = stone(2.8, 2.2, 1.0, lean, mainSeed);
  weatherStone(geometry, 1, 2.8, mainSeed);
  geometry.rotateY(-STATUE_YAW);
  return geometry;
}

function wash(geometry: BufferGeometry) {
  const vertices = geometry.getAttribute("position"), colors: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const value = 0.95 + 0.035 * Math.sin(vertices.getX(i) * 4 + vertices.getY(i) * 3 + vertices.getZ(i));
    colors.push(value, value, value);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function materials(): Record<Surface, MeshToonMaterial> {
  const ramp = WORLD_DIRECTION.foliage.ramp;
  // The world ramp keeps blue-violet shadows; a paler custom tint washed the statue out to blue-white in the dim forest.
  const stoneRamp = { ...ramp };
  const stone = createRampMaterial(WEATHERED_BASE_HEX, stoneRamp);
  const result = {
    weathered: stone,
    future: stone,
    ink: createRampMaterial(INK_BASE_HEX, stoneRamp),
    needles: createRampMaterial(paletteColor({
      base: "grass", mix: "forestDeep", amount: 0.42, saturation: 1, brightness: 1,
    }), ramp),
    flower: createRampMaterial(paletteColor({
      base: "flower", mix: "flower", amount: 0, saturation: 1, brightness: 1,
    }), ramp),
  };
  for (const material of Object.values(result)) material.vertexColors = true;
  return result;
}

/** Check whole bounding footprints, including their edges, rather than just prop centres. */
function fits(parts: readonly Part[], context: ZoneSceneContext, side: number, offsetZ: number) {
  const footprints = parts.map(part => {
    part.geometry.computeBoundingBox();
    return { bounds: part.geometry.boundingBox!, x: part.x, z: part.z };
  });
  footprints.push({ bounds: new Box3(new Vector3(3.6, 0, -1.2), new Vector3(5.3, 0, 1.2)), x: 0, z: 0 });
  return footprints.every(({ bounds, x: originX, z: originZ }) => {
    const size = bounds.getSize(new Vector3());
    const stepsX = Math.ceil(size.x / 0.2), stepsZ = Math.ceil(size.z / 0.2);
    for (let ix = 0; ix <= stepsX; ix++) {
      for (let iz = 0; iz <= stepsZ; iz++) {
        const x = side * (originX + bounds.min.x + size.x * ix / Math.max(1, stepsX));
        const z = originZ + offsetZ + bounds.min.z + size.z * iz / Math.max(1, stepsZ);
        const y = context.heightAt(x, z);
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
          || !Number.isFinite(y) || Math.hypot(x, y + bounds.max.y, z) > ZONE_BUDGET.radius) return false;
      }
    }
    return true;
  });
}

/** Prefer a level shoulder behind the road's lip, rather than draping rocks down its steep face. */
function slopeAtSite(context: ZoneSceneContext, side: number, offsetZ: number) {
  let steepest = 0;
  for (let x = PATH_CLEARANCE; x <= 16; x += 2) {
    for (let z = -9; z <= 9; z += 3) {
      const y = context.heightAt(side * x, z + offsetZ);
      const across = context.heightAt(side * (x + 1), z + offsetZ) - y;
      const along = context.heightAt(side * x, z + offsetZ + 1) - y;
      const slope = Math.hypot(across, along);
      if (!Number.isFinite(slope)) return Infinity;
      steepest = Math.max(steepest, slope);
    }
  }
  return Math.round(steepest * 1e6) / 1e6;
}

export const createMilestonesScene: ZoneSceneFactory = context => {
  const parts: Part[] = [];
  const certificates = milestoneCertificates();
  const pedestal = createPedestal(context.seed);

  // Collider 0: The plinth supporting the monumental portrait bust of Duy.
  const plinthCollider = new BufferGeometry();
  plinthCollider.setAttribute("position", new Float32BufferAttribute([
    -1.1, 0, -1.4, 1.1, 0, -1.4, 1.1, 1.0, -1.4,
    -1.1, 0,  1.4, 1.1, 1.0,  1.4, -1.1, 1.0, -1.4,
  ], 3));
  parts.push({
    geometry: pedestal,
    surface: "weathered",
    collisionGeometry: plinthCollider,
    x: STATUE_X,
    z: STATUE_Z,
    solid: true,
    yaw: STATUE_YAW,
  });

  // Four loose stone chips settle into the pedestal's foot beside the two small wildflowers.
  for (const [index, [x, z]] of ([[4.45, -1.35], [4.52, 1.28], [5.15, -1.85], [5.22, 1.78]] as const).entries()) {
    const seed = (context.seed + index * 97) >>> 0;
    const geometry = createRockGeometry("pebble", seed, true).translate(0, -0.04, 0);
    weatherStone(geometry, 0.15, 0.25, seed);
    parts.push({ geometry, surface: "weathered", x, z, solid: false });
  }

  const crown = createPineCrownV2(context.seed).translate(0, TRUNK_HEIGHT, 0);
  const crownColors = crown.getAttribute("color");
  const crownBase = new Color(RAMP_PRESETS.crown);
  const needleBase = new Color(paletteColor({ base: "grass", mix: "forestDeep", amount: 0.42, saturation: 1, brightness: 1 }));
  for (let i = 0; i < crownColors.count; i++) {
    crownColors.setXYZ(i, crownColors.getX(i) * crownBase.r / needleBase.r,
      crownColors.getY(i) * crownBase.g / needleBase.g, crownColors.getZ(i) * crownBase.b / needleBase.b);
  }
  crown.deleteAttribute("surface");
  parts.push({
    geometry: createTreeTrunk().scale(1, 4.2, 1).translate(0, 2.1, 0),
    surface: "ink", x: 15, z: 2.7, solid: true,
  }, {
    geometry: crown,
    surface: "needles", x: 15, z: 2.7, solid: false,
  });
  for (const [x, z] of [[4.35, -1.6], [4.45, 1.65]] as const) parts.push({
    geometry: new IcosahedronGeometry(0.065, 0).translate(0, 0.065, 0),
    surface: "flower", x, z, solid: false,
  });

  const placement = [0, -4, 4, -8, 8, -12, 12, -16, 16]
    .flatMap(offsetZ => [1, -1].map(side => ({ side, offsetZ, slope: slopeAtSite(context, side, offsetZ) })))
    .sort((a, b) => Number(a.slope > 0.5) - Number(b.slope > 0.5)
      || Number(a.offsetZ < 0) - Number(b.offsetZ < 0) || a.slope - b.slope)
    .find(({ side, offsetZ }) => fits(parts, context, side, offsetZ));
  if (!placement) {
    parts.forEach(part => { part.geometry.dispose(); part.collisionGeometry?.dispose(); });
    throw new RangeError("Milestones needs a dry, clear hillside within the zone radius.");
  }
  const { side, offsetZ } = placement;
  const group = new Group();
  group.name = "milestones-hillside";
  const colliders: ZoneCollider[] = [];
  const batches: Record<Surface, BufferGeometry[]> = { weathered: [], future: [], ink: [], needles: [], flower: [] };
  const surfaces = materials();
  const groundSamples = new Map<number, Map<number, number>>();
  const groundAt = (x: number, z: number) => {
    let row = groundSamples.get(x);
    if (!row) { row = new Map(); groundSamples.set(x, row); }
    let y = row.get(z);
    if (y === undefined) { y = context.heightAt(x, z); row.set(z, y); }
    return y;
  };
  for (const part of parts) {
    const geometry = part.geometry;
    const vertices = geometry.getAttribute("position");
    const collisionBounds = new Box3();
    if (part.collisionGeometry) {
      const reference = part.collisionGeometry.getAttribute("position");
      for (let i = 0; i < reference.count; i++) {
        const localX = part.x + reference.getX(i), localZ = part.z + reference.getZ(i);
        const x = side * localX, z = localZ + offsetZ;
        collisionBounds.expandByPoint(new Vector3(x, reference.getY(i) + groundAt(x, z), z));
      }
      part.collisionGeometry.dispose();
    }
    for (let i = 0; i < vertices.count; i++) {
      const localX = part.x + vertices.getX(i), localZ = part.z + vertices.getZ(i);
      const x = side * localX, z = localZ + offsetZ;
      const ground = groundAt(x, z);
      vertices.setXYZ(i, x, vertices.getY(i) + ground, z);
    }
    if (!geometry.hasAttribute("color")) wash(geometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (part.solid) {
      const center = (collisionBounds.isEmpty() ? bounds : collisionBounds).getCenter(new Vector3());
      const size = (collisionBounds.isEmpty() ? bounds : collisionBounds).getSize(new Vector3());
      colliders.push({ center, size, yaw: part.yaw });
    }
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute("uv");
    if (side < 0) {
      for (const attribute of Object.values(flat.attributes)) {
        for (let i = 0; i < attribute.count; i += 3) {
          for (let component = 0; component < attribute.itemSize; component++) {
            const a = (i + 1) * attribute.itemSize + component, b = (i + 2) * attribute.itemSize + component;
            [attribute.array[a], attribute.array[b]] = [attribute.array[b]!, attribute.array[a]!];
          }
        }
      }
      flat.computeVertexNormals();
    }
    batches[part.surface].push(flat);
    if (flat !== geometry) geometry.dispose();
  }
  for (const surface of Object.keys(batches) as Surface[]) {
    if (batches[surface].length === 0) continue;
    const geometry = mergeGeometries(batches[surface], false)!;
    batches[surface].forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    if (surface === "future") {
      // Keep the lighter planned stone in vertex pigment so both stone draws
      // share one P2 material and avoid a second physical-uniform upload.
      const tint = new Color(FUTURE_BASE_HEX), base = surfaces.weathered.color;
      const colors = geometry.getAttribute("color");
      for (let i = 0; i < colors.count; i++) colors.setXYZ(i,
        colors.getX(i) * tint.r / base.r, colors.getY(i) * tint.g / base.g, colors.getZ(i) * tint.b / base.b);
    }
    const mesh = new Mesh(geometry, surfaces[surface]);
    // P2 recognises this stone-batch name; retain the zone surface identity for
    // review tools without adding another atlas loader or material controller.
    mesh.name = surface === "weathered" || surface === "future" ? "rock-stack-stones" : `milestones-${surface}`;
    mesh.userData.milestonesSurface = surface;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  const middle = colliders[0]!.center.clone();
  // Interaction point on the front of the plinth at comfortable eye height (~1.38 m)
  const interactPosition = new Vector3(middle.x, groundAt(middle.x, middle.z) + 1.38, middle.z);
  // The walking pose leaves air between its ankles at the retained E target.
  // Keep that small click target available before/after the deferred body loads;
  // finite camera/physics/visibility rays still use only the real stone geometry.
  const plinth = group.children.find(node => node.userData.milestonesSurface === "weathered") as Mesh;
  const stoneRaycast = plinth.raycast.bind(plinth), clickSphere = new Sphere(), clickPoint = new Vector3();
  plinth.raycast = (raycaster, hits) => {
    stoneRaycast(raycaster, hits);
    if (raycaster.far !== Infinity) return;
    clickSphere.center.copy(interactPosition).applyMatrix4(plinth.matrixWorld); clickSphere.radius = .55;
    if (raycaster.ray.intersectSphere(clickSphere, clickPoint)) hits.push({
      distance: raycaster.ray.origin.distanceTo(clickPoint), point: clickPoint.clone(), object: plinth,
    });
  };
  const dressing = createMilestonesDressing(context, side, offsetZ);
  group.add(dressing.mesh);

  const statue = createMilestonesStatue(certificates);
  statue.group.position.set(side * STATUE_X, groundAt(side * STATUE_X, offsetZ) + 1, offsetZ);
  statue.group.rotation.y = -side * (Math.PI / 2 + STATUE_YAW);
  group.add(statue.group);
  group.userData.statue = statue.group.userData;
  let disposed = false;
  return {
    zoneId: "milestones", group, colliders,
    interactable: { position: interactPosition, label: { vi: "Cụm đá dấu mốc", en: "Milestone rocks" } },
    update(dt, reducedMotion) { statue.update(dt, reducedMotion); },
    dispose() {
      if (disposed) return;
      disposed = true;
      statue.dispose();
      group.remove(statue.group);
      dressing.dispose();
      group.remove(dressing.mesh);
      group.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      new Set(Object.values(surfaces)).forEach(material => material.dispose());
      group.clear();
    },
  };
};
