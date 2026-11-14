import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry,
  Float32BufferAttribute, Group, Mesh, Shape, Vector3, MeshStandardMaterial, type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE, type PaletteKey } from "../art/palette";
import { createLastPostcardDressing } from "./last-postcard-dressing";
import { createPropMaterial } from "../props/materials";
import { createRockGeometry } from "../props/rocks";
import { createPlankGeometry, createPostGeometry } from "../props/wood";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneSceneFactory, type ZoneSceneContext } from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "paper" | "ink" | "forestDeep" | "forestLight" | "water" | "flower" | "dusk";
type Footprint = { x: number; z: number; halfX: number; halfZ: number; height: number };
type Site = Footprint & { base: number; bottom: number; sign: number };

// All three props share a level 3 m (along Z) by 2 m dry-stone footing.
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

/** Fit kit assets before placement; retain their fracture faces, grain and vertex pigments. */
function fit(part: BufferGeometry, size: Point, center: Point): BufferGeometry {
  part.computeBoundingBox();
  const bounds = part.boundingBox!, span = bounds.getSize(new Vector3());
  const origin = bounds.getCenter(new Vector3());
  return part.translate(-origin.x, -origin.y, -origin.z)
    .scale(size[0] / span.x, size[1] / span.y, size[2] / span.z).translate(...center);
}

function surfaceColor(surface: Surface): Color {
  switch (surface) {
    case "wood": return new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.62);
    case "paper": return new Color(PALETTE.cloud);
    case "ink": return new Color(PALETTE.rockDark);
    case "forestDeep": return new Color(PALETTE.grass).lerp(new Color(PALETTE.rockDark), 0.35);
    case "forestLight": return new Color(PALETTE.grass);
    case "water": return new Color(PALETTE.seaShallow);
    default: return new Color(PALETTE[surface]);
  }
}

/** A few broad shore clusters, with filled dry footprints and room between their silhouettes. */
function shoreSite(context: ZoneSceneContext, platform: Site, footprint: Footprint, occupied: Site[]): Site | undefined {
  for (const shift of [0, -1.6, 1.6, -3.2, 3.2]) {
    const x = platform.x + platform.sign * footprint.x;
    const z = platform.z + platform.sign * (footprint.z + shift);
    if (occupied.some(site => Math.abs(site.x - x) < site.halfX + footprint.halfX + 0.25
      && Math.abs(site.z - z) < site.halfZ + footprint.halfZ + 0.25)) continue;
    let bottom = Infinity, top = -Infinity, safe = true;
    const nx = Math.ceil(footprint.halfX * 2 / 0.1), nz = Math.ceil(footprint.halfZ * 2 / 0.1);
    for (let ix = 0; safe && ix <= nx; ix++) {
      for (let iz = 0; safe && iz <= nz; iz++) {
        const px = x - footprint.halfX + ix / nx * footprint.halfX * 2;
        const pz = z - footprint.halfZ + iz / nz * footprint.halfZ * 2;
        const ground = context.heightAt(px, pz);
        safe = Math.abs(px) > PATH_CLEARANCE && !context.onPath(px, pz)
          && !context.underWater(px, pz) && Number.isFinite(ground);
        bottom = Math.min(bottom, ground);
        top = Math.max(top, ground);
      }
    }
    if (safe && top - bottom <= 0.4
      && Math.hypot(Math.abs(x) + footprint.halfX, Math.max(Math.abs(bottom), Math.abs(top + footprint.height)),
        Math.abs(z) + footprint.halfZ) <= ZONE_BUDGET.radius) {
      return { ...footprint, x, z, base: top, bottom, sign: platform.sign };
    }
  }
}

/** Folded, tapered blades read as coastal grass rather than a scatter of tiny cones. */
function grassBlade(height: number, width: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -width, 0, 0, width, 0, 0, -width * 0.45, height * 0.55, 0.13,
    width * 0.45, height * 0.55, 0.13, 0.025, height, 0.3,
  ], 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 1, 2, 0, 3, 2, 1, 3, 4, 2]);
  return geometry;
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
  // Bevel faces and folded blades repeat X/Z coordinates; sample the composed terrain once per point.
  const shoreHeights = new Map<string, number>();
  const shoreContext: ZoneSceneContext = {
    ...context,
    heightAt(x, z) {
      const key = `${x},${z}`;
      let height = shoreHeights.get(key);
      if (height === undefined) {
        height = context.heightAt(x, z);
        shoreHeights.set(key, height);
      }
      return height;
    },
  };

  function add(part: BufferGeometry, surface: Surface, site?: Site, facing = 0, groundBottom = false,
    followTerrain = false, tint?: PaletteKey | Color) {
    const originalSurface = surface;
    // Share the leaf draw while preserving the blue pigment in vertex colours;
    // this leaves one draw slot for the deferred library dressing.
    if (surface === "water") surface = "forestDeep";
    if (site) {
      part.rotateY(facing + (site.sign < 0 ? Math.PI : 0)).translate(site.x, site.base, site.z);
      // Shore details follow the bank; platform furniture keeps its level deck height.
      const vertices = part.getAttribute("position");
      part.computeBoundingBox();
      const { min, max } = part.boundingBox!;
      for (let i = 0; i < vertices.count; i++) {
        if (followTerrain) {
          vertices.setY(i, vertices.getY(i) - site.base
            + shoreContext.heightAt(vertices.getX(i), vertices.getZ(i)) - 0.04);
        } else if (groundBottom) {
          // Stretch only the buried course down to the bank; keep its bevel rings distinct.
          const ground = shoreContext.heightAt(vertices.getX(i), vertices.getZ(i)) - 0.05;
          const t = (vertices.getY(i) - min.y) / (max.y - min.y);
          vertices.setY(i, ground + t * (max.y - ground));
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
    // Normalize kit pigments by the batch material, so wood/stone never receive a second dark tint.
    const base = surfaceColor(surface);
    const pigment = tint instanceof Color ? tint : tint ? new Color(PALETTE[tint]) : surfaceColor(originalSurface);
    const kitColors = flat.getAttribute("color");
    for (let i = 0; i < positions.count; i++) {
      const wash = 0.96 + 0.025 * Math.sin(positions.getX(i) * 31 + positions.getZ(i) * 43 + phase)
        + 0.015 * Math.sin(positions.getY(i) * 19 + phase);
      colors.push(wash * (kitColors?.getX(i) ?? pigment.r) / base.r,
        wash * (kitColors?.getY(i) ?? pigment.g) / base.g,
        wash * (kitColors?.getZ(i) ?? pigment.b) / base.b);
    }
    flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
    let surfaces = batches.get(parent);
    if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
    const parts = surfaces.get(surface) ?? [];
    parts.push(flat);
    surfaces.set(surface, parts);
  }

  const seed = (offset: number) => (context.seed + Math.imul(offset, 2654435761)) >>> 0;
  const timber = (size: Point, center: Point, offset: number) =>
    fit(createPlankGeometry(size[0], seed(offset)), size, center);
  const post = (size: Point, center: Point, offset: number) =>
    fit(createPostGeometry(size[1], seed(offset)), size, center);
  // Two staggered courses, not a single square slab. The lower course is buried 5 cm.
  for (let course = 0; course < 2; course++) {
    for (let row = 0; row < 2; row++) {
      const split = (row + course) % 2 ? 0.12 : -0.12;
      for (const side of [-1, 1]) {
        // Keep the outer footprint, but expose a 4 cm joint between individual stones.
        const width = 1 + side * -split - 0.02;
        const x = side < 0 ? -1 + width / 2 : 1 - width / 2;
        const depth = 1.475;
        const height = course === 0 ? 0.145 : 0.11;
        const rock = fit(createRockGeometry("stone", seed(10 + course * 6 + row * 2 + (side + 1) / 2)),
          [width, height, depth], [x, course === 0 ? -0.1475 : -0.055, (row ? 1 : -1) * (1.5 - depth / 2)]);
        add(rock, "paper", platform, 0, course === 0);
      }
    }
  }
  const mail = (part: BufferGeometry, surface: Surface, tint?: PaletteKey | Color) =>
    add(part.scale(1.3, 1.3, 1.3), surface, mailbox, -Math.PI / 2, false, false, tint);
  const metal = new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.58);
  const wornEdge = new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.78);
  // Faded painted metal, a recessed door and folded lip; front still faces the walking path.
  mail(post([0.19, 1.2, 0.18], [0.025, 0.57, 0], 30), "wood");
  mail(timber([0.76, 0.11, 0.55], [0, 1.15, 0], 31), "wood");
  mail(bevel([0.96, 0.68, 0.74], [0, 1.55, 0], true), "paper", metal);
  mail(bevel([0.7, 0.37, 0.025], [0, 1.43, 0.382]), "ink");
  mail(bevel([0.65, 0.32, 0.025], [0, 1.43, 0.399]), "paper", metal);
  mail(box([0.53, 0.045, 0.018], [0, 1.69, 0.386]), "ink");
  mail(bevel([0.57, 0.025, 0.065], [0, 1.727, 0.397]), "paper", wornEdge);
  mail(bevel([0.09, 0.045, 0.06], [0, 1.48, 0.437]), "paper", wornEdge);
  mail(box([0.027, 0.19, 0.025], [0.494, 1.56, -0.05]), "paper", wornEdge);
  mail(bevel([0.03, 0.08, 0.11], [0.497, 1.64, -0.008]), "flower");

  // Six thick, blank postcards on a three-sided spindle; broad pigments recall visited zones.
  add(post([0.12, 1.87, 0.12], [0, 0.905, 0], 40), "wood", rack);
  for (const yaw of [0, Math.PI / 2]) {
    add(timber([1.24, 0.085, 0.16], [0, 0.0425, 0], 41 + Math.round(yaw)).rotateY(yaw), "wood", rack);
  }
  const pigments = ["forestDeep", "forestLight", "water"] as const;
  for (let face = 0; face < 3; face++) {
    const yaw = face * Math.PI * 2 / 3 + 0.12;
    add(post([0.045, 1.02, 0.055], [0, 1.305, 0.28], 60 + face).rotateY(yaw), "wood", rack);
    for (let row = 0; row < 2; row++) {
      const y = 1.06 + row * 0.49;
      add(bevel([0.51, 0.35, 0.025], [0, y, 0.35]).rotateY(yaw), "paper", rack, 0, false, false, "paper");
      add(box([0.425, 0.255, 0.008], [0, y + 0.009, 0.37]).rotateY(yaw), pigments[face]!, rack);
      add(box([0.425, 0.06, 0.009], [0, y - 0.088, 0.376]).rotateY(yaw),
        face === 2 ? "forestDeep" : "forestLight", rack);
      add(timber([0.56, 0.045, 0.095], [0, y - 0.186, 0.35], 50 + face * 2 + row).rotateY(yaw), "wood", rack);
      // Two small orange suns on the postcards facing the walking path.
      if (face === 2) add(bevel([0.11, 0.11, 0.012], [0.12, y + 0.065, 0.383]).rotateY(yaw), "flower", rack);
    }
  }

  // A blank reply card left sideways on the rack's lower foot.
  add(bevel([0.28, 0.018, 0.19], [0.18, 0.096, 0.12]).rotateY(-0.24), "paper", rack, 0, false, false, "paper");
  add(post([0.16, 3.23, 0.16], [0, 1.585, 0], 70), "wood", lamp);
  add(timber([0.64, 0.1, 0.12], [-0.23, 3.13, 0], 71), "wood", lamp);
  add(box([0.027, 0.17, 0.027], [-0.42, 3.04, 0]), "ink", lamp);
  // Painted dusk pigment, never a light or emissive material.
  add(new CylinderGeometry(0.12, 0.1, 0.32, 6).translate(0, -0.19, 0), "dusk");
  add(new CylinderGeometry(0.045, 0.175, 0.085, 6).translate(0, -0.025, 0), "dusk");
  add(new CylinderGeometry(0.12, 0.065, 0.06, 6).translate(0, -0.38, 0), "dusk");

  const solidSites = [platform, mailbox, rack, lamp];
  const occupied = [platform];
  for (const [x, z, yaw] of [[0.78, -1, -Math.PI / 2], [0.78, 1, -Math.PI / 2], [-0.78, 0.9, Math.PI / 2]] as const) {
    add(grassBlade(0.22, 0.035).rotateY(yaw).translate(x, 0, z),
      "forestLight", platform, 0, false, true, "grassDry");
  }
  // A short two-rail fence behind the deck leaves the mailbox's path-facing side open.
  const fence = shoreSite(shoreContext, platform, { x: 2.4, z: 0.25, halfX: 0.14, halfZ: 1.7, height: 0.9 }, occupied);
  if (fence) {
    solidSites.push(fence);
    occupied.push(fence);
    for (const z of [-1.55, 0, 1.55]) {
      add(post([0.18, 0.94, 0.19], [0, 0.47, z], 80 + Math.round(z * 10)), "wood", fence, 0, false, true);
    }
    for (const y of [0.36, 0.69]) {
      add(timber([3.4, 0.12, 0.11], [0, 0, 0], 90 + Math.round(y * 10))
        .rotateY(Math.PI / 2).translate(-0.025, y, 0), "wood", fence, 0, false, true);
    }
  }
  for (const [x, z, halfX, halfZ, height] of [
    [1.65, -2.7, 0.72, 0.55, 0.65], [-0.45, 2.9, 0.55, 0.45, 0.48], [3, 2.75, 0.6, 0.48, 0.55],
  ] as const) {
    const site = shoreSite(shoreContext, platform, { x, z, halfX, halfZ, height }, occupied);
    if (!site) continue;
    solidSites.push(site);
    occupied.push(site);
    // Tip the fracture planes before fitting: sloping shoulders and a broken crown
    // replace the horizontal cap / upright ring silhouette of a flattened boulder.
    const rock = fit(createRockGeometry("boulder", seed(100 + Math.round(z * 10)))
      .rotateX(0.28 + x * 0.08).rotateZ(x < 0 ? -0.42 : 0.48),
      [halfX * 2, height, halfZ * 2], [0, height / 2, 0]);
    add(rock, "paper", site, 0, false, true);
    for (let tuft = 0; tuft < 3; tuft++) {
      const yaw = tuft * Math.PI * 2 / 3 + z;
      const part = grassBlade(0.2 + tuft * 0.025, 0.035).rotateY(yaw)
        .translate(Math.cos(yaw) * halfX * 0.75, 0, Math.sin(yaw) * halfZ * 0.65);
      add(part, "forestLight", site, 0, false, true, "grassDry");
    }
  }
  for (const [x, z] of [[0.2, -2.5], [1.1, 2.6], [3.2, -1.7]] as const) {
    const site = shoreSite(shoreContext, platform, { x, z, halfX: 0.58, halfZ: 0.58, height: 0.8 }, occupied);
    if (!site) continue;
    occupied.push(site);
    for (let blade = 0; blade < 7; blade++) {
      const yaw = blade * 2.39996 + z;
      const height = 0.48 + (blade % 4) * 0.1;
      const part = grassBlade(height, 0.065 + (blade % 3) * 0.012)
        .translate(0, 0, 0.14).rotateY(yaw);
      add(part, blade % 3 === 0 ? "forestDeep" : "forestLight", site, 0, false, true, "grassDry");
    }
  }

  shoreHeights.clear();
  const geometries: BufferGeometry[] = [], materials: Material[] = [];
  for (const [parent, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach(part => part.dispose());
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = surface === "wood" || surface === "paper"
        ? new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
        : createPropMaterial("paper");
      material.color.copy(surfaceColor(surface));
      const mesh = new Mesh(geometry, material);
      mesh.name = `last-postcard-${surface}`;
      if (surface === "wood") mesh.userData.photoSurface = "bark";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      geometries.push(geometry);
      materials.push(material);
    }
  }
  const colliders = solidSites.map(site => ({
    center: new Vector3(site.x, (site.bottom + site.base + site.height) / 2, site.z),
    size: new Vector3(site.halfX * 2, site.base + site.height - site.bottom, site.halfZ * 2),
  }));
  const dressing = createLastPostcardDressing(context, platform, colliders);
  group.add(dressing.mesh);
  let elapsed = 0, disposed = false;
  return {
    zoneId: "last-postcard",
    group,
    interactable: {
      position: new Vector3(mailbox.x, mailbox.base + 1.55 * 1.3, mailbox.z),
      label: { en: "The last mailbox", vi: "Hộp thư cuối đường" },
    },
    colliders,
    update(dt, reducedMotion) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      lantern.rotation.z = Math.sin(elapsed * 0.45) * 0.018;
      lantern.rotation.x = Math.sin(elapsed * 0.31) * 0.012;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      dressing.dispose();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    },
  };
};
