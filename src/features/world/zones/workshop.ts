import {
  BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  OctahedronGeometry, Shape, TorusGeometry, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory } from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "roof" | "moss" | "paper" | "ink" | "stone" | "flower";
type Footprint = readonly [number, number, number, number];

/** Include overhangs and the easel, not just the four shed posts. */
const SITE: Footprint = [-8.05, -3.15, -5.25, 4.6];
const SAMPLE_SPACING = 0.2;

function dryFootprint(context: ZoneSceneContext, bounds: Footprint): boolean {
  const [left, right, back, front] = bounds;
  const nx = Math.ceil((right - left) / SAMPLE_SPACING);
  const nz = Math.ceil((front - back) / SAMPLE_SPACING);
  for (let ix = 0; ix <= nx; ix++) {
    for (let iz = 0; iz <= nz; iz++) {
      const x = left + (right - left) * ix / nx;
      const z = back + (front - back) * iz / nz;
      if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
        || Math.hypot(x, z) > ZONE_BUDGET.radius) return false;
    }
  }
  return true;
}

/** One bevel ring at each cap; 28 triangles, with broad flat faces. */
function timber(size: Point, center: Point): BufferGeometry {
  const [w, h, d] = size;
  const bevel = Math.min(0.035, w * 0.14, h * 0.14, d * 0.14);
  const x = w / 2 - bevel, y = h / 2 - bevel;
  const shape = new Shape();
  shape.moveTo(-x, -y); shape.lineTo(x, -y); shape.lineTo(x, y); shape.lineTo(-x, y); shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: d - bevel * 2, steps: 1, bevelEnabled: true,
    bevelSegments: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1,
  }).translate(center[0], center[1], center[2] - d / 2 + bevel);
}

function materialFor(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "roof": material.color.set(PALETTE.ink).lerp(new Color(PALETTE.paper), 0.55); break;
    case "moss": material.color.set(PALETTE.forestDeep); break;
    case "ink": material.color.set(PALETTE.ink); break;
    case "stone": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.22); break;
    case "flower": material.color.set(PALETTE.flower); break;
  }
  material.name = `workshop-${surface}`;
  return material;
}

/** Landward first: the stream is normally on local +X at this point on the route. */
export const createWorkshopScene: ZoneSceneFactory = context => {
  let site: { side: number; z: number } | undefined;
  for (const side of [1, -1]) {
    for (const z of [0, 7, -7, 14, -14]) {
      const bounds: Footprint = side === 1 ? [SITE[0], SITE[1], SITE[2] + z, SITE[3] + z]
        : [-SITE[1], -SITE[0], -SITE[3] + z, -SITE[2] + z];
      if (dryFootprint(context, bounds)) { site = { side, z }; break; }
    }
    if (site) break;
  }
  // Fail before allocating resources if the supplied masks leave no usable bank.
  if (!site) throw new RangeError("Workshop needs a dry bank outside the walking corridor.");
  const { side, z: offsetZ } = site;
  const point = (x: number, y: number, z: number) => new Vector3(x * side, y, z * side + offsetZ);
  const ground = (x: number, z: number) => context.heightAt(x * side, z * side + offsetZ);
  const group = new Group();
  group.name = "workshop";
  const colliders: ZoneCollider[] = [];
  const batches = new Map<Group, Map<Surface, BufferGeometry[]>>();
  const geometries: BufferGeometry[] = [];
  const materials = new Map<Surface, MeshToonMaterial>();
  const seedPhase = (context.seed >>> 0) / 4294967296 * Math.PI * 2;

  function add(part: BufferGeometry, surface: Surface, parent = group) {
    if (part.index) {
      const indexed = part;
      part = indexed.toNonIndexed();
      indexed.dispose();
    }
    part.clearGroups();
    part.deleteAttribute("uv");
    const positions = part.getAttribute("position");
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const wash = 0.955 + Math.sin(positions.getX(i) * 13 + positions.getZ(i) * 7 + seedPhase) * 0.025
        + Math.sin(positions.getY(i) * 31 + seedPhase) * 0.015;
      colors.push(wash, wash, wash);
    }
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (parent === group) part.rotateY(side === 1 ? 0 : Math.PI).translate(0, 0, offsetZ);
    let surfaces = batches.get(parent);
    if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
    const parts = surfaces.get(surface) ?? [];
    parts.push(part);
    surfaces.set(surface, parts);
  }
  function box(surface: Surface, size: Point, center: Point) { add(timber(size, center), surface); }
  function collider(size: Point, center: Point) {
    colliders.push({ center: point(...center), size: new Vector3(...size) });
  }
  function upright(x: number, z: number, top: number, width: number, depth = width) {
    const foot = ground(x, z);
    box("wood", [width, top - foot, depth], [x, (top + foot) / 2, z]);
  }
  function highest(bounds: Footprint) {
    let height = -Infinity;
    for (const x of [bounds[0], (bounds[0] + bounds[1]) / 2, bounds[1]]) {
      for (const z of [bounds[2], (bounds[2] + bounds[3]) / 2, bounds[3]]) height = Math.max(height, ground(x, z));
    }
    return height;
  }

  // Straight mono-pitch roof: the raised front faces the walking path (+X).
  const base = highest([-7.7, -3.6, -3.05, 3.05]);
  const pitch = 17 * Math.PI / 180;
  const roofY = (x: number) => base + 2.95 + (x + 5.65) * Math.tan(pitch);
  for (let i = 0; i < 7; i++) {
    const z = (i - 3) * 0.96;
    add(timber([4.65, 0.14, 0.945], [0, 0, 0]).rotateZ(pitch).translate(-5.65, roofY(-5.65), z), "roof");
  }
  // An ink soffit along the open eave keeps the silhouette legible in mist.
  add(timber([1.25, 0.045, 6.65], [0, 0, 0]).rotateZ(pitch)
    .translate(-4.2, roofY(-4.2) - 0.1, 0), "ink");
  for (const x of [-7.65, -3.65]) {
    for (const z of [-2.95, 2.95]) {
      upright(x, z, roofY(x) - 0.07, 0.17);
      const foot = ground(x, z), top = roofY(x);
      collider([0.2, top - foot, 0.2], [x, (top + foot) / 2, z]);
    }
  }
  for (const z of [-2.95, 2.95]) {
    add(timber([4.2, 0.17, 0.16], [0, 0, 0]).rotateZ(pitch).translate(-5.65, roofY(-5.65) - 0.17, z), "wood");
  }
  // Three walls of wide, slightly uneven weatherboards; the front has no wall.
  for (let i = 0; i < 10; i++) {
    const z = -2.7 + i * 0.6;
    const foot = ground(-7.65, z), top = roofY(-7.65) - 0.18 - (i % 3) * 0.012;
    box("wood", [0.12, top - foot, 0.584], [-7.65, (top + foot) / 2, z]);
  }
  collider([0.16, roofY(-7.65) - base, 6.05], [-7.65, (base + roofY(-7.65)) / 2, 0]);
  for (const z of [-2.95, 2.95]) {
    for (let i = 0; i < 7; i++) {
      const x = -7.35 + i * 0.53;
      const foot = ground(x, z), top = roofY(x) - 0.19;
      box("wood", [0.517, top - foot, 0.12], [x, (top + foot) / 2, z]);
    }
    collider([4, 2.7, 0.16], [-5.65, base + 1.35, z]);
  }
  const roofHeight = 4.65 * Math.sin(pitch) + 0.14 * Math.cos(pitch);
  collider([4.65, roofHeight, 6.71], [-5.65, roofY(-5.65), 0]);

  // A level working surface; each leg independently reaches the sampled ground.
  const benchX = -4.75;
  const benchY = highest([-5.2, -4.3, -1.8, 1.8]) + 0.94;
  for (let i = 0; i < 3; i++) box("wood", [0.29, 0.13, 3.6 - (i % 2) * 0.035], [benchX + (i - 1) * 0.3, benchY, 0]);
  for (const x of [-5.08, -4.42]) for (const z of [-1.5, 1.5]) upright(x, z, benchY - 0.06, 0.115);
  for (const x of [-5.08, -4.42]) box("wood", [0.07, 0.13, 3.12], [x, benchY - 0.25, 0]);
  collider([0.92, benchY + 0.07 - ground(benchX, 0), 3.6], [benchX, (benchY + 0.07 + ground(benchX, 0)) / 2, 0]);
  box("paper", [0.5, 0.014, 0.72], [-4.75, benchY + 0.075, -0.4]);
  box("ink", [0.035, 0.025, 0.44], [-4.55, benchY + 0.095, 0.6]);
  box("wood", [0.23, 0.09, 0.12], [-4.55, benchY + 0.12, 0.8]);
  // A lidded tool box and a small wound roll leave the middle of the bench open.
  box("wood", [0.38, 0.24, 0.44], [benchX, benchY + 0.19, 1.25]);
  box("ink", [0.4, 0.025, 0.46], [benchX, benchY + 0.3225, 1.25]);
  box("wood", [0.05, 0.06, 0.16], [benchX, benchY + 0.365, 1.25]);
  for (const dx of [-0.07, 0, 0.07]) {
    add(new TorusGeometry(0.1, 0.025, 4, 12).rotateY(Math.PI / 2)
      .translate(benchX + dx, benchY + 0.195, -1.1), "paper");
  }
  add(new OctahedronGeometry(0.06, 0).translate(-4.54, benchY + 0.2, 1.25), "flower");

  // Tool shelf, two storage boxes and a recognisable wound cable spool.
  const shelfY = highest([-7.55, -6.75, -2.2, 2.2]);
  for (const z of [-2, 2]) upright(-7.04, z, shelfY + 1.95, 0.1);
  for (const y of [0.55, 1.3, 1.95]) box("wood", [0.7, 0.08, 4.25], [-7.1, shelfY + y, 0]);
  collider([0.8, 2, 4.3], [-7.1, shelfY + 1, 0]);
  for (const z of [-1.45, 1.2]) {
    box("wood", [0.47, 0.38, 0.65], [-7.1, shelfY + 0.78, z]);
    box("ink", [0.012, 0.06, 0.18], [-6.859, shelfY + 0.83, z]);
  }
  add(new TorusGeometry(0.21, 0.055, 4, 12).rotateY(Math.PI / 2).translate(-7.03, shelfY + 1.58, -0.35), "ink");
  box("wood", [0.4, 0.055, 0.08], [-7.03, shelfY + 1.58, -0.35]);
  for (const [x, z, size] of [[-6.15, 2.1, 0.75], [-6.25, -2.05, 0.65]] as const) {
    const y = highest([x - size / 2, x + size / 2, z - size / 2, z + size / 2]);
    box("wood", [size, size, size], [x, y + size / 2, z]);
    for (const fraction of [0.33, 0.66]) box("ink", [0.01, 0.014, size * 0.87], [x + size / 2, y + size * fraction, z]);
    for (const dz of [-0.22, 0.22]) box("ink", [size + 0.006, 0.028, 0.028], [x, y + size - 0.075, z + dz]);
    collider([size, size, size], [x, y + size / 2, z]);
  }

  // Outside the side wall: two crates and a low rope coil, clear of the open front.
  for (const [x, size] of [[-6.6, 0.72], [-5.65, 0.58]] as const) {
    const z = 4.05;
    const y = highest([x - size / 2, x + size / 2, z - size / 2, z + size / 2]);
    box("wood", [size, size, size], [x, y + size / 2, z]);
    for (const fraction of [0.33, 0.66]) {
      box("ink", [0.012, 0.018, size * 0.9], [x + size / 2, y + size * fraction, z]);
    }
    for (const dz of [-size * 0.32, size * 0.32]) {
      box("wood", [size + 0.025, 0.045, 0.08], [x, y + size + 0.0225, z + dz]);
    }
    collider([size + 0.025, size + 0.045, size], [x, y + (size + 0.045) / 2, z]);
  }
  const ropeX = -4.55, ropeZ = 4.05;
  const ropeY = highest([ropeX - 0.325, ropeX + 0.325, ropeZ - 0.325, ropeZ + 0.325]);
  for (let i = 0; i < 3; i++) {
    add(new TorusGeometry(0.28, 0.045, 4, 12).rotateX(Math.PI / 2)
      .translate(ropeX, ropeY + 0.045 + i * 0.07, ropeZ), "wood");
  }
  collider([0.65, 0.23, 0.65], [ropeX, ropeY + 0.115, ropeZ]);
  add(new OctahedronGeometry(0.06, 0).translate(ropeX + 0.28, ropeY + 0.17, ropeZ), "flower");

  // Making-of corner: paper faces the path. The ink marks are an abstract frame,
  // diagonal roof study and ground line, never glyphs, branding or a texture.
  const easelX = -4.85, easelZ = -4.25;
  const easelY = highest([-5.3, -4.4, -4.9, -3.6]);
  for (const z of [-4.72, -3.78]) upright(-4.85, z, easelY + 1.93, 0.065);
  upright(-5.22, -4.25, easelY + 1.55, 0.07);
  box("wood", [0.2, 0.08, 1.16], [easelX, easelY + 0.83, easelZ]);
  box("wood", [0.07, 1.12, 1.08], [easelX, easelY + 1.43, easelZ]);
  box("paper", [0.014, 0.94, 0.93], [-4.804, easelY + 1.43, easelZ]);
  for (const z of [-4.55, -3.99]) box("ink", [0.01, 0.35, 0.014], [-4.791, easelY + 1.36, z]);
  box("ink", [0.01, 0.015, 0.72], [-4.791, easelY + 1.13, -4.25]);
  add(timber([0.01, 0.016, 0.67], [0, 0, 0]).rotateX(0.16).translate(-4.791, easelY + 1.6, -4.25), "ink");
  collider([0.65, 2, 1.2], [-4.98, easelY + 1, easelZ]);

  // Two broad patches rather than scattered confetti. Moss follows the roof pitch.
  for (const [x, z, width, depth] of [[-6.9, 1.65, 1.6, 2.5], [-6.3, -2.1, 1.25, 1.15]] as const) {
    add(new OctahedronGeometry(1, 0).scale(width / 2, 0.055, depth / 2)
      .rotateZ(pitch).translate(x, roofY(x) + 0.095, z), "moss");
  }
  for (let i = 0; i < 6; i++) {
    add(new OctahedronGeometry(1, 0).scale(0.05, 0.23, 0.16).rotateX(i * 0.8)
      .translate(-7.56, base + 0.4 + i * 0.31, 2.91 - i * 0.12), "moss");
  }

  // Small hanging sprig: the only animated part, batched separately by its pivot.
  const sprig = new Group();
  sprig.name = "workshop-hanging-sprig";
  sprig.position.copy(point(-3.8, roofY(-3.8) - 0.25, 2.65));
  group.add(sprig);
  add(timber([0.015, 0.4, 0.015], [0, -0.2, 0]), "moss", sprig);
  for (let i = 0; i < 3; i++) add(new OctahedronGeometry(1, 0).scale(0.025, 0.13, 0.065)
    .rotateX(i % 2 === 0 ? 0.6 : -0.6).translate(0, -0.16 - i * 0.1, (i % 2 === 0 ? 1 : -1) * 0.045), "moss", sprig);

  // Riverward steps stop at the dry bank. Never use an underwater final tread.
  for (let i = 0; i < 3; i++) {
    const x = 3.15 + i * 0.67, z = 4.7;
    const bounds: Footprint = [x * side - 0.31, x * side + 0.31, z * side + offsetZ - 0.8, z * side + offsetZ + 0.8];
    if (!dryFootprint(context, bounds)) break;
    const height = 0.36 - i * 0.1;
    const y = highest([x - 0.31, x + 0.31, z - 0.8, z + 0.8]);
    box("stone", [0.62, height, 1.6], [x, y + height / 2, z]);
    collider([0.62, height, 1.6], [x, y + height / 2, z]);
  }

  for (const [parent, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach(part => part.dispose());
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      let material = materials.get(surface);
      if (!material) { material = materialFor(surface); materials.set(surface, material); }
      const mesh = new Mesh(geometry, material);
      mesh.name = `workshop-${surface}${parent === sprig ? "-sprig" : ""}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  let elapsed = 0, disposed = false;
  return {
    zoneId: "workshop", group, colliders,
    interactable: {
      position: point(benchX, benchY, 0),
      label: { vi: "Bàn thợ cạnh suối", en: "Workbench by the stream" },
    },
    update(dt, reducedMotion) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      sprig.rotation.z = Math.sin(elapsed * 0.35) * 0.025;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
};
