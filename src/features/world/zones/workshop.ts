import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, Mesh, OctahedronGeometry, PointLight, Shape, TorusGeometry, Vector3, type MeshStandardMaterial, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createFern } from "../foliage/ground";
import { createPropMaterial } from "../props/materials";
import { createRockGeometry } from "../props/rocks";
import { createPlankGeometry, createPostGeometry } from "../props/wood";
import { bindWorkshopBatch } from "../props/workshop-library";
import { bindHrProps, selectHrProp, type HrPropSite } from "../props/hr-props";
import { bindHrStructure } from "../props/hr-structures";
import { createWorkshopDressing } from "./workshop-dressing";
import { bindSetpieces } from "./setpiece-hr";
import { createHrFire, type FireSource } from "./workshop-fire";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory } from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "roof" | "moss" | "paper" | "ink" | "stone" | "flower";
type Footprint = readonly [number, number, number, number];

/** Include curved roof eaves, braziers and workbench within the validated dry bank footprint. */
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

/** Fit the shared board without discarding its grain or bevelled edges. */
function timber(size: Point, center: Point): BufferGeometry {
  const axis = size.indexOf(Math.max(...size));
  const seed = Math.round(center[0] * 101 + center[1] * 307 + center[2] * 503 + size[0] * 701);
  const geometry = createPlankGeometry(size[axis]!, seed);
  if (axis === 1) geometry.rotateZ(Math.PI / 2);
  if (axis === 2) geometry.rotateY(Math.PI / 2);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, extent = bounds.getSize(new Vector3());
  const middle = bounds.getCenter(new Vector3());
  return geometry.translate(-middle.x, -middle.y, -middle.z)
    .scale(size[0] / extent.x, size[1] / extent.y, size[2] / extent.z).translate(...center);
}

/** Bevelled architectural prism (28 triangles), used for bench paper, tool iron and small props. */
function detail(size: Point, center: Point): BufferGeometry {
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

/** Clean 12-triangle architectural block for secondary joinery, panels, ridge trim and crate slats. */
function prism(size: Point, center: Point): BufferGeometry {
  return new BoxGeometry(...size).translate(...center);
}

function materialFor(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "wood": material.color.set(0xffffff); break;
    case "roof":
      material.color.set(PALETTE.rockDark).lerp(new Color(PALETTE.vermilion), 0.34).lerp(new Color(PALETTE.dusk), 0.1);
      break;
    case "moss": material.color.set(PALETTE.forestDeep); break;
    case "paper": material.color.set(PALETTE.cloud); break;
    case "ink": material.color.set(PALETTE.rockDark).lerp(new Color(PALETTE.indigo), 0.3); break;
    case "stone": material.color.set(0xffffff); break;
    case "flower":
      material.color.set(PALETTE.flower);
      material.emissive.set(PALETTE.flower).lerp(new Color(PALETTE.sunGold), 0.42);
      material.emissiveIntensity = 0.55;
      break;
  }
  material.name = `workshop-${surface}`;
  return material;
}

/**
 * Build a curved Vietnamese communal gate roof tier (mái đình cong mũi hài)
 * with concave slope, upturned corner blades (đầu đao cong vút) and raised ridge (bờ nóc).
 * In local gate space: u = transverse along the 3 bays; v = depth perpendicular to ridge.
 */
function buildCurvedRoofTier(options: {
  cu: number;
  cv: number;
  hu: number;
  hv: number;
  nu?: number;
  nv?: number;
  eaveY: number;
  ridgeY: number;
  daoLift: number;
  daoLeft: boolean;
  daoRight: boolean;
  crestHeight?: number;
  mossRange?: readonly [number, number, number, number];
  transformPoint: (u: number, y: number, v: number) => Vector3;
  transformPrism: (size: Point, centerLocal: Point) => BufferGeometry;
}): { roof: BufferGeometry[]; moss?: BufferGeometry } {
  const {
    cu, cv, hu, hv, nu = 6, nv = 6, eaveY, ridgeY, daoLift, daoLeft, daoRight,
    crestHeight = 0, mossRange, transformPoint, transformPrism,
  } = options;
  const roof: BufferGeometry[] = [];
  const thickness = 0.12;

  const endLift = (uNorm: number) => {
    if (uNorm < 0 && daoLeft) return Math.max(0, (-uNorm - 0.25) / 0.75);
    if (uNorm > 0 && daoRight) return Math.max(0, (uNorm - 0.25) / 0.75);
    return 0;
  };

  const gridPoint = (iu: number, iv: number, yOffset = 0): Vector3 => {
    const un = (iu / (nu / 2)) - 1;
    const vn = (iv / (nv / 2)) - 1;
    const absV = Math.abs(vn);
    const eu = endLift(un);
    const u = cu + un * hu;
    const v = cv + vn * hv;
    const slope = (1 - absV) ** 1.38;
    const dao = (eu ** 2) * (0.3 + 0.7 * absV) * daoLift;
    const rib = (iv % 2 === 1 ? 0.022 : 0) * (1 - absV * 0.3);
    return transformPoint(u, eaveY + (ridgeY - eaveY) * slope + dao + rib + yOffset, v);
  };

  const roofPositions: number[] = [];
  const pushTri = (target: number[], a: Vector3, b: Vector3, c: Vector3) => {
    target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const pushQuad = (target: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3) => {
    pushTri(target, a, b, c);
    pushTri(target, a, c, d);
  };

  for (let iu = 0; iu < nu; iu++) {
    for (let iv = 0; iv < nv; iv++) {
      const t00 = gridPoint(iu, iv, thickness);
      const t10 = gridPoint(iu + 1, iv, thickness);
      const t11 = gridPoint(iu + 1, iv + 1, thickness);
      const t01 = gridPoint(iu, iv + 1, thickness);
      pushQuad(roofPositions, t00, t01, t11, t10);

      const b00 = gridPoint(iu, iv, 0);
      const b10 = gridPoint(iu, iv + 1, 0);
      const b11 = gridPoint(iu + 1, iv + 1, 0);
      const b01 = gridPoint(iu + 1, iv, 0);
      pushQuad(roofPositions, b00, b01, b11, b10);

      if (iu === 0) pushQuad(roofPositions, b00, b10, t01, t00);
      if (iu === nu - 1) pushQuad(roofPositions, b11, b01, t10, t11);
      if (iv === 0) pushQuad(roofPositions, b01, b00, t00, t10);
      if (iv === nv - 1) pushQuad(roofPositions, b10, b11, t11, t01);
    }
  }

  // Sculpted upturned corner blades (đầu đao cong vút) rising from the roof corners.
  for (const iv of [0, nv]) {
    const signV = iv === 0 ? -1 : 1;
    for (const [iu, enabled] of [[0, daoLeft], [nu, daoRight]] as const) {
      if (!enabled) continue;
      const signU = iu === 0 ? -1 : 1;
      const corner = gridPoint(iu, iv, thickness * 0.5);
      const cBase = corner.clone().add(new Vector3(-signU * 0.12, -0.06, -signV * 0.14));
      const mid = corner.clone().add(new Vector3(-signU * 0.04, 0.28 + daoLift * 0.22, -signV * 0.05));
      const tip = corner.clone().add(new Vector3(0, 0.64 + daoLift * 0.45, 0));
      const r0 = 0.09, r1 = 0.05;
      const bL = cBase.clone().add(new Vector3(-signU * r0, 0, 0));
      const bR = cBase.clone().add(new Vector3(0, 0, -signV * r0));
      const bU = cBase.clone().add(new Vector3(0, r0 * 1.2, 0));
      const mL = mid.clone().add(new Vector3(-signU * r1, 0, 0));
      const mR = mid.clone().add(new Vector3(0, 0, -signV * r1));
      const mU = mid.clone().add(new Vector3(0, r1 * 1.25, 0));
      pushQuad(roofPositions, bL, bR, mR, mL);
      pushQuad(roofPositions, bR, bU, mU, mR);
      pushQuad(roofPositions, bU, bL, mL, mU);
      pushTri(roofPositions, bL, bU, bR);
      pushTri(roofPositions, mL, mR, tip);
      pushTri(roofPositions, mR, mU, tip);
      pushTri(roofPositions, mU, mL, tip);
    }
  }

  const roofGeo = new BufferGeometry();
  roofGeo.setAttribute("position", new Float32BufferAttribute(roofPositions, 3));
  roof.push(roofGeo);

  // Raised roof ridge beam (bờ nóc) and architectural stepped finials (đấu nóc).
  roof.push(transformPrism([hu * 1.96, 0.2, 0.24], [cu, ridgeY + thickness + 0.08, cv]));
  for (const [signU, enabled] of [[-1, daoLeft], [1, daoRight]] as const) {
    if (!enabled) continue;
    roof.push(transformPrism([0.28, 0.28, 0.24], [cu + signU * (hu * 0.86), ridgeY + thickness + 0.22, cv]));
  }
  if (crestHeight > 0) {
    roof.push(transformPrism([1.3, crestHeight * 0.55, 0.28], [cu, ridgeY + thickness + 0.16 + crestHeight * 0.275, cv]));
    roof.push(transformPrism([0.65, crestHeight * 0.45, 0.22], [cu, ridgeY + thickness + 0.16 + crestHeight * 0.775, cv]));
  }

  let moss: BufferGeometry | undefined;
  if (mossRange) {
    const [iu0, iu1, iv0, iv1] = mossRange;
    const mossPositions: number[] = [];
    const mTop = thickness + 0.052, mBot = thickness + 0.018;
    for (let iu = iu0; iu < iu1; iu++) {
      for (let iv = iv0; iv < iv1; iv++) {
        const t00 = gridPoint(iu, iv, mTop);
        const t10 = gridPoint(iu + 1, iv, mTop);
        const t11 = gridPoint(iu + 1, iv + 1, mTop);
        const t01 = gridPoint(iu, iv + 1, mTop);
        pushQuad(mossPositions, t00, t01, t11, t10);

        const b00 = gridPoint(iu, iv, mBot);
        const b10 = gridPoint(iu, iv + 1, mBot);
        const b11 = gridPoint(iu + 1, iv + 1, mBot);
        const b01 = gridPoint(iu + 1, iv, mBot);
        pushQuad(mossPositions, b00, b01, b11, b10);

        if (iu === iu0) pushQuad(mossPositions, b00, b10, t01, t00);
        if (iu === iu1 - 1) pushQuad(mossPositions, b11, b01, t10, t11);
        if (iv === iv0) pushQuad(mossPositions, b01, b00, t00, t10);
        if (iv === iv1 - 1) pushQuad(mossPositions, b10, b11, t11, t01);
      }
    }
    moss = new BufferGeometry();
    moss.setAttribute("position", new Float32BufferAttribute(mossPositions, 3));
  }

  return { roof, moss };
}

/** Build a deterministic twisting 3D flame tongue (24 triangles). */
function buildFlameTongue(
  center: Point,
  radius: number,
  height: number,
  leanX: number,
  leanZ: number,
  twist: number,
): BufferGeometry {
  const [cx, cy, cz] = center;
  const sides = 4;
  const levels = [
    { t: 0, r: radius * 0.82 },
    { t: 0.42, r: radius },
  ];
  const rings = levels.map(({ t, r }) => Array.from({ length: sides }, (_, i) => {
    const angle = twist + t * 0.85 + i * Math.PI * 2 / sides;
    const ox = leanX * (t ** 1.3);
    const oz = leanZ * (t ** 1.3);
    return new Vector3(cx + ox + Math.cos(angle) * r, cy + t * height, cz + oz + Math.sin(angle) * r);
  }));
  const tip = new Vector3(cx + leanX * 1.15, cy + height, cz + leanZ * 1.15);
  const baseCenter = new Vector3(cx, cy, cz);
  const positions: number[] = [];
  const pushTri = (a: Vector3, b: Vector3, c: Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    pushTri(baseCenter, rings[0]![i]!, rings[0]![next]!);
    pushTri(rings[0]![i]!, rings[1]![i]!, rings[1]![next]!);
    pushTri(rings[0]![i]!, rings[1]![next]!, rings[0]![next]!);
    pushTri(rings[1]![i]!, tip, rings[1]![next]!);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
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
  const lights: PointLight[] = [];
  const seedPhase = (context.seed >>> 0) / 4294967296 * Math.PI * 2;
  const trianglesByCluster: Record<string, number> = {};
  group.userData.trianglesByCluster = trianglesByCluster;
  let cluster = "gate-pillars-beams";

  function highest(bounds: Footprint) {
    let height = -Infinity;
    for (const x of [bounds[0], (bounds[0] + bounds[1]) / 2, bounds[1]]) {
      for (const z of [bounds[2], (bounds[2] + bounds[3]) / 2, bounds[3]]) height = Math.max(height, ground(x, z));
    }
    return height;
  }

  const base = highest([-7.7, -3.6, -3.05, 3.05]);

  // Gate orientation: facade normal angled 31.5° (facing road on +X and approaching traveler on -Z).
  // u = transverse axis across 3 bays; v = depth axis from rear to front.
  const yaw = 0.55;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const dirU = { x: sinY, z: cosY };
  const dirV = { x: cosY, z: -sinY };
  const gateCx = -5.55, gateCz = 0.8;

  const toWorld = (u: number, v: number) => ({
    x: gateCx + u * dirU.x + v * dirV.x,
    z: gateCz + u * dirU.z + v * dirV.z,
  });
  const gatePoint = (u: number, y: number, v: number): Point => {
    const p = toWorld(u, v);
    return [p.x, y, p.z];
  };

  // Standing braziers & column torches cast warm golden light onto nearby columns and crossbeams.
  const brazierLeftPos = gatePoint(-1.35, base + 1.55, 0.95);
  const brazierRightPos = gatePoint(1.35, base + 1.55, 0.95);
  const torchLeftPos = gatePoint(-1.15, base + 3.45, 0.6);
  const torchRightPos = gatePoint(1.15, base + 3.45, 0.6);
  const fireSources: readonly Point[] = [
    brazierLeftPos,
    brazierRightPos,
    torchLeftPos,
    torchRightPos,
  ];
  const warmGlowColor = new Color(PALETTE.sunGold).lerp(new Color(PALETTE.flower), 0.36);
  const woodFallback = new Color(PALETTE.rock).lerp(new Color(PALETTE.dusk), 0.12);
  const firePivot: Point = [gateCx, base + 1.65, gateCz];

  function fireWarmthAt(x: number, y: number, z: number): number {
    let warmth = 0;
    for (const [fx, fy, fz] of fireSources) {
      const dx = x - fx, dy = (y - fy) * 0.72, dz = z - fz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 4.5) warmth = Math.max(warmth, Math.max(0, 1 - d2 / 4.5) / (1 + d2 * 0.55));
    }
    return Math.min(0.65, warmth);
  }

  function add(part: BufferGeometry, surface: Surface, parent = group) {
    if (part.index) {
      const indexed = part;
      part = indexed.toNonIndexed();
      indexed.dispose();
    }
    part.clearGroups();
    part.deleteAttribute("uv");
    if (!part.hasAttribute("normal")) part.computeVertexNormals();
    const positions = part.getAttribute("position");
    trianglesByCluster[cluster] = (trianglesByCluster[cluster] ?? 0) + positions.count / 3;
    const sourceColors = part.getAttribute("color");
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const vx = positions.getX(i), vy = positions.getY(i), vz = positions.getZ(i);
      const wash = 0.955 + Math.sin(vx * 13 + vz * 7 + seedPhase) * 0.025
        + Math.sin(vy * 31 + seedPhase) * 0.015;
      if ((surface === "wood" || surface === "stone") && sourceColors) {
        const c = new Color(sourceColors.getX(i), sourceColors.getY(i), sourceColors.getZ(i));
        if (surface === "wood") {
          const warmth = fireWarmthAt(vx, vy, vz);
          if (warmth > 0.01) c.lerp(warmGlowColor, warmth * 0.58).multiplyScalar(1 + warmth * 0.22);
        }
        colors.push(c.r, c.g, c.b);
      } else if (surface === "wood") {
        const c = woodFallback.clone().multiplyScalar(wash);
        const warmth = fireWarmthAt(vx, vy, vz);
        if (warmth > 0.01) c.lerp(warmGlowColor, warmth * 0.58).multiplyScalar(1 + warmth * 0.22);
        colors.push(c.r, c.g, c.b);
      } else {
        colors.push(wash, wash, wash);
      }
    }
    part.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (parent === group) {
      part.rotateY(side === 1 ? 0 : Math.PI).translate(0, 0, offsetZ);
    } else {
      part.translate(-firePivot[0], -firePivot[1], -firePivot[2]);
      if (side === -1) part.rotateY(Math.PI);
    }
    let surfaces = batches.get(parent);
    if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
    const parts = surfaces.get(surface) ?? [];
    parts.push(part);
    surfaces.set(surface, parts);
  }

  function box(surface: Surface, size: Point, center: Point) {
    add(surface === "wood" ? timber(size, center) : detail(size, center), surface);
  }
  function beamBox(size: Point, center: Point) {
    add(prism(size, center), "wood");
  }
  function collider(size: Point, center: Point) {
    colliders.push({ center: point(...center), size: new Vector3(...size) });
  }
  function upright(x: number, z: number, top: number, width: number, depth = width) {
    const foot = ground(x, z) - 0.04;
    const part = createPostGeometry(top - foot, context.seed + Math.round(x * 101 + z * 503));
    const size = part.boundingBox!.getSize(new Vector3());
    add(part.scale(width / size.x, 1, depth / size.z).translate(x, foot, z), "wood");
  }
  function crate(x: number, y: number, z: number, size: number) {
    const bottom = y - 0.04, height = size + 0.04;
    for (let i = 0; i < 2; i++) {
      beamBox([0.055, height / 2 - 0.025, size],
        [x + size / 2 - 0.0275, bottom + height * (i + 0.5) / 2, z]);
    }
    beamBox([0.055, height, size], [x - size / 2 + 0.0275, bottom + height / 2, z]);
    for (const sign of [-1, 1]) beamBox([size - 0.11, height, 0.055],
      [x, bottom + height / 2, z + sign * (size / 2 - 0.0275)]);
    box("wood", [size, 0.055, size], [x, y + size - 0.0275, z]);
  }

  // Rotated beam and prism builders for the gate structure.
  function gatePrism(size: Point, centerLocal: Point): BufferGeometry {
    const [u, y, v] = centerLocal;
    const center = gatePoint(u, y, v);
    return prism(size, [0, 0, 0]).rotateY(-yaw).translate(...center);
  }

  // 1. CỔNG TAM QUAN / ĐÌNH LÀNG: 8 Pillars (cột cái & cột quân), crossbeams (xà) and neck panels (cổ diêm).
  // COMPLETELY OPEN, see-through structure: ONLY columns, crossbeams, tie beams, brackets and roofs.
  // NO WALLS, NO REAR LINING, NO TOOL SHELF. All three bays are completely clear walkways!
  cluster = "gate-pillars-beams";
  const centralColumnTop = base + 6.45;
  const sideColumnTop = base + 4.05;
  const colV = 0.6; // half-depth
  const centralU = 1.15; // half-width of central bay (2.3m wide opening)
  const sideU = 2.25; // outer columns (total width 4.5m)

  // Erect 8 grounded wooden columns and ink collar plinths with foot colliders.
  for (const v of [-colV, colV]) {
    for (const u of [-centralU, centralU]) {
      const p = toWorld(u, v);
      const foot = ground(p.x, p.z);
      upright(p.x, p.z, centralColumnTop, 0.34);
      add(prism([0.5, 0.22, 0.5], [0, 0, 0]).rotateY(-yaw).translate(p.x, foot + 0.12, p.z), "ink");
      collider([0.38, centralColumnTop - foot, 0.38], [p.x, (centralColumnTop + foot) / 2, p.z]);
    }
    for (const u of [-sideU, sideU]) {
      const p = toWorld(u, v);
      const foot = ground(p.x, p.z);
      upright(p.x, p.z, sideColumnTop, 0.26);
      add(prism([0.42, 0.18, 0.42], [0, 0, 0]).rotateY(-yaw).translate(p.x, foot + 0.1, p.z), "ink");
      collider([0.32, sideColumnTop - foot, 0.32], [p.x, (sideColumnTop + foot) / 2, p.z]);
    }

    // Central bay horizontal lintels (xà ngang Trung môn) and open decorative spindle struts (con tiện).
    add(gatePrism([2.55, 0.22, 0.22], [0, base + 3.82, v]), "wood");
    add(gatePrism([2.6, 0.24, 0.24], [0, base + 4.5, v]), "wood");
    add(gatePrism([2.55, 0.22, 0.22], [0, base + 5.22, v]), "wood");
    for (const u of [-0.6, 0, 0.6]) {
      add(gatePrism([0.12, 0.46, 0.12], [u, base + 4.16, v]), "wood");
    }
    // Diagonal wooden brackets (kẻ bẩy) under the central archway.
    for (const signU of [-1, 1]) {
      add(prism([0.16, 0.78, 0.16], [0, 0, 0]).rotateZ(signU * 0.55).rotateY(-yaw)
        .translate(...gatePoint(signU * 0.95, base + 3.48, v)), "wood");
    }

    // Side bay lintels (xà ngang Tả / Hữu môn).
    for (const signU of [-1, 1]) {
      const bayU = signU * ((centralU + sideU) / 2);
      add(gatePrism([1.35, 0.18, 0.2], [bayU, base + 2.98, v]), "wood");
      add(gatePrism([1.4, 0.2, 0.22], [bayU, base + 3.56, v]), "wood");
      add(gatePrism([0.11, 0.4, 0.11], [bayU, base + 3.27, v]), "wood");
    }
  }

  // Longitudinal tie beams (câu đầu / xà dọc) linking front and rear columns across depth.
  for (const u of [-centralU, centralU]) {
    add(gatePrism([0.22, 0.22, 1.48], [u, base + 4.5, 0]), "wood");
    add(gatePrism([0.24, 0.24, 1.52], [u, base + 5.22, 0]), "wood");
    add(gatePrism([0.22, 0.22, 1.45], [u, base + 6.32, 0]), "wood");
  }
  for (const u of [-sideU, sideU]) {
    add(gatePrism([0.2, 0.2, 1.45], [u, base + 3.56, 0]), "wood");
    add(gatePrism([0.2, 0.2, 1.48], [u, base + 3.98, 0]), "wood");
  }

  // Upper central pavilion neck (cổ diêm) between lower and upper roofs (y = base + 6.18..7.18 m).
  const neckU = 1.05, neckV = 0.52;
  for (const v of [-neckV, neckV]) {
    for (const u of [-neckU, neckU]) {
      add(gatePrism([0.22, 2.04, 0.22], [u, base + 6.2, v]), "wood");
    }
    add(gatePrism([2.32, 0.2, 0.2], [0, base + 7.12, v]), "wood");
    add(gatePrism([2.0, 0.62, 0.06], [0, base + 6.68, v]), "ink");
  }
  for (const u of [-neckU, neckU]) {
    add(gatePrism([0.2, 0.2, 1.25], [u, base + 7.12, 0]), "wood");
    add(gatePrism([0.06, 0.62, 0.98], [u, base + 6.68, 0]), "ink");
  }

  // 2. CURVED TILED ROOFS (Mái cong ngói đình làng — 2-tiered central gate + 2 side bay roofs, height ~9.30 m).
  cluster = "gate-roofs";
  const transformPoint = (u: number, y: number, v: number): Vector3 => {
    const pt = gatePoint(u, y, v);
    return new Vector3(pt[0], pt[1], pt[2]);
  };
  const upperRoof = buildCurvedRoofTier({
    cu: 0, cv: 0, hu: 1.45, hv: 1.15, nu: 6, nv: 6,
    eaveY: base + 7.08, ridgeY: base + 8.62, daoLift: 0.68,
    daoLeft: true, daoRight: true, crestHeight: 0.48,
    mossRange: [1, 5, 1, 6],
    transformPoint, transformPrism: gatePrism,
  });
  const lowerRoof = buildCurvedRoofTier({
    cu: 0, cv: 0, hu: 1.55, hv: 1.25, nu: 6, nv: 6,
    eaveY: base + 5.22, ridgeY: base + 6.38, daoLift: 0.62,
    daoLeft: true, daoRight: true,
    mossRange: [2, 4, 1, 5],
    transformPoint, transformPrism: gatePrism,
  });
  const southSideRoof = buildCurvedRoofTier({
    cu: -1.78, cv: 0, hu: 0.85, hv: 1.05, nu: 4, nv: 4,
    eaveY: base + 3.92, ridgeY: base + 4.98, daoLift: 0.56,
    daoLeft: true, daoRight: false,
    mossRange: [1, 3, 1, 4],
    transformPoint, transformPrism: gatePrism,
  });
  const northSideRoof = buildCurvedRoofTier({
    cu: 1.78, cv: 0, hu: 0.85, hv: 1.05, nu: 4, nv: 4,
    eaveY: base + 3.92, ridgeY: base + 4.98, daoLift: 0.56,
    daoLeft: false, daoRight: true,
    mossRange: [1, 3, 0, 3],
    transformPoint, transformPrism: gatePrism,
  });

  const roofTiers = [upperRoof, lowerRoof, southSideRoof, northSideRoof];
  for (const tier of roofTiers) {
    for (const part of tier.roof) add(part, "roof");
  }

  // 3. FIRE BRAZIERS & COLUMN TORCHES (Lư lửa & đuốc hai bên cổng đình, có ánh sáng ấm hắt lên cột).
  cluster = "fire-braziers";
  const fireGroup = new Group();
  fireGroup.name = "workshop-fire";
  fireGroup.position.copy(point(...firePivot));
  // HR-FIX-SETPIECE A06: authored braziers/cressets and shader flames stand exactly on these solids.
  const hrBraziers: Vector3[] = [], hrTorches: Vector3[] = [], hrFires: FireSource[] = [];

  for (const signU of [-1, 1]) {
    const brazierPos = gatePoint(signU * 1.35, 0, 0.95);
    const [bx, , bz] = brazierPos;
    const foot = ground(bx, bz);
    const pedTop = base + 0.84;
    // Stepped brazier pedestal (đế lư lửa) + cast-iron fire bowl (lòng chảo gang) + crossed fire logs.
    beamBox([0.5, Math.max(0.28, (pedTop - foot) * 0.55), 0.5], [bx, foot + (pedTop - foot) * 0.25, bz]);
    add(prism([0.38, Math.max(0.26, (pedTop - foot) * 0.52), 0.38], [bx, foot + (pedTop - foot) * 0.72, bz]), "ink");
    add(new CylinderGeometry(0.29, 0.19, 0.32, 6).translate(bx, pedTop + 0.16, bz), "ink");
    for (const angle of [0.35, -0.45]) {
      add(prism([0.38, 0.07, 0.08], [0, 0, 0]).rotateY(angle).rotateZ(0.18)
        .translate(bx, pedTop + 0.32, bz), "wood");
    }
    collider([0.56, pedTop + 1.15 - foot, 0.56], [bx, (pedTop + 1.15 + foot) / 2, bz]);
    hrBraziers.push(point(bx, pedTop, bz));
    hrFires.push({ position: point(bx, pedTop + 0.4, bz), width: 0.56, height: 1.25 });

    // Animated blazing brazier flames & rising spark particles inside fireGroup.
    const flameY = pedTop + 0.3;
    add(buildFlameTongue([bx, flameY, bz], 0.21, 1.25, 0.03, signU * 0.02, signU * 0.7), "flower", fireGroup);
    add(buildFlameTongue([bx - 0.08, flameY + 0.02, bz + 0.06], 0.13, 0.86, -0.04, 0.03, 1.1), "flower", fireGroup);
    add(buildFlameTongue([bx + 0.07, flameY + 0.02, bz - 0.06], 0.12, 0.78, 0.04, -0.03, 2.4), "flower", fireGroup);
    for (let s = 0; s < 4; s++) {
      const sy = flameY + 1.05 + s * 0.22;
      const sx = bx + ((s % 2) * 2 - 1) * 0.07;
      const sz = bz + (((s + 1) % 2) * 2 - 1) * 0.06;
      add(new OctahedronGeometry(0.044 - s * 0.004, 0).translate(sx, sy, sz), "flower", fireGroup);
    }

    // Column-mounted torch (đuốc gắn cột cái) on the front central pillars.
    const torchPos = gatePoint(signU * centralU, base + 3.32, colV + 0.08);
    const [tx, ty, tz] = torchPos;
    hrTorches.push(point(tx, ty, tz));
    hrFires.push({ position: point(tx, ty + 0.12, tz), width: 0.27, height: 0.62 });
    add(prism([0.38, 0.075, 0.075], [0, 0, 0]).rotateZ(-0.55).rotateY(-yaw)
      .translate(tx - dirV.x * 0.12, ty - 0.2, tz - dirV.z * 0.12), "wood");
    add(new CylinderGeometry(0.1, 0.06, 0.22, 5).translate(tx, ty, tz), "ink");
    add(buildFlameTongue([tx, ty + 0.1, tz], 0.13, 0.76, 0.03, 0, signU * 1.5), "flower", fireGroup);
    add(buildFlameTongue([tx + 0.04, ty + 0.12, tz - signU * 0.04], 0.09, 0.52, 0.02, -signU * 0.03, 0.9), "flower", fireGroup);
    for (let s = 0; s < 2; s++) {
      add(new OctahedronGeometry(0.035, 0)
        .translate(tx + (s - 0.5) * 0.05, ty + 0.86 + s * 0.18, tz), "flower", fireGroup);
    }

    // Warm PointLight casting real light onto the wooden pillars and crossbeams.
    const light = new PointLight(
      new Color(PALETTE.sunGold).lerp(new Color(PALETTE.flower), 0.42).getHex(),
      2.35,
      7.5,
      1.7,
    );
    light.name = `workshop-fire-light-${signU < 0 ? "left" : "right"}`;
    light.position.copy(point(bx + dirV.x * 0.06, base + 2.05, bz + dirV.z * 0.06));
    light.castShadow = false;
    group.add(light);
    lights.push(light);
  }

  // 4. WORKBENCH & TOOLS BESIDE THE GATE (Bàn thợ bên cạnh cổng — preserves exact interactable contract).
  // Positioned beside the gate (outside column rows), NOT inside the walkway.
  cluster = "bench-tools";
  const benchX = -4.75;
  const benchY = highest([-5.2, -4.3, -1.8, 1.8]) + 0.94;
  for (let i = 0; i < 3; i++) box("wood", [0.29, 0.13, 2.9 - (i % 2) * 0.035], [benchX + (i - 1) * 0.3, benchY, 0]);
  for (const x of [-5.08, -4.42]) for (const z of [-1.3, 1.3]) upright(x, z, benchY - 0.06, 0.115);
  for (const x of [-5.08, -4.42]) beamBox([0.07, 0.13, 2.45], [x, benchY - 0.25, 0]);
  collider([0.92, benchY + 0.07 - ground(benchX, 0), 2.9], [benchX, (benchY + 0.07 + ground(benchX, 0)) / 2, 0]);
  box("paper", [0.5, 0.014, 0.72], [-4.75, benchY + 0.075, -0.4]);
  beamBox([0.055, 0.045, 0.48], [-4.91, benchY + 0.105, 0.65]);
  box("ink", [0.27, 0.11, 0.1], [-4.91, benchY + 0.135, 0.88]);
  box("ink", [0.27, 0.025, 0.035], [-4.75, benchY + 0.083, -0.4]);
  box("ink", [0.035, 0.025, 0.3], [-4.87, benchY + 0.083, -0.265]);
  beamBox([0.38, 0.24, 0.44], [benchX, benchY + 0.19, 1.25]);
  box("ink", [0.4, 0.025, 0.46], [benchX, benchY + 0.3225, 1.25]);
  beamBox([0.05, 0.06, 0.16], [benchX, benchY + 0.365, 1.25]);
  for (const dx of [-0.07, 0, 0.07]) {
    add(new TorusGeometry(0.1, 0.025, 4, 8).rotateY(Math.PI / 2)
      .translate(benchX + dx, benchY + 0.195, -1.1), "wood");
  }
  add(new OctahedronGeometry(0.06, 0).translate(-4.54, benchY + 0.2, 1.25), "flower");

  // 5. OUTDOOR CRATES & ROPE COIL beside the northern bay.
  cluster = "outdoor-crates-rope";
  for (const [x, size] of [[-6.6, 0.72], [-5.65, 0.58]] as const) {
    const z = 4.05;
    const y = highest([x - size / 2, x + size / 2, z - size / 2, z + size / 2]);
    crate(x, y, z, size);
    collider([size + 0.025, size + 0.045, size], [x, y + (size + 0.045) / 2, z]);
  }
  const ropeX = -4.55, ropeZ = 4.05;
  const ropeY = highest([ropeX - 0.325, ropeX + 0.325, ropeZ - 0.325, ropeZ + 0.325]);
  for (let i = 0; i < 3; i++) {
    add(new TorusGeometry(0.28, 0.045, 4, 8).rotateX(Math.PI / 2)
      .translate(ropeX, ropeY + 0.045 + i * 0.07, ropeZ), "wood");
  }
  collider([0.65, 0.23, 0.65], [ropeX, ropeY + 0.115, ropeZ]);
  add(new OctahedronGeometry(0.06, 0).translate(ropeX + 0.28, ropeY + 0.17, ropeZ), "flower");

  // 7. ROOF MOSS & GROUNDED FERNS around the pillars.
  cluster = "moss-sprig-ground";
  for (const tier of roofTiers) {
    if (tier.moss) add(tier.moss, "moss");
  }
  for (const [x, z, scale] of [[-6.85, 2.55, 0.4], [-6.45, -1.85, 0.34]]) {
    const parts = [
      createFern().scale(scale!, scale!, scale!).rotateY(seedPhase + x!).translate(x!, 0, z!),
      new IcosahedronGeometry(1, 0).scale(0.28, 0.065, 0.2).translate(x! - 0.1, 0.07, z!),
    ];
    for (const part of parts) {
      const positions = part.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, positions.getY(i) + ground(positions.getX(i), positions.getZ(i)));
      }
      add(part, "moss");
    }
  }

  // 8. STREAM STEPS on the riverward bank.
  cluster = "stream-steps";
  for (let i = 0; i < 3; i++) {
    const x = 3.15 + i * 0.67, z = 4.7;
    const bounds: Footprint = [x * side - 0.31, x * side + 0.31, z * side + offsetZ - 0.8, z * side + offsetZ + 0.8];
    if (!dryFootprint(context, bounds)) break;
    const height = 0.36 - i * 0.1;
    const y = highest([x - 0.31, x + 0.31, z - 0.8, z + 0.8]);
    const slab = createRockGeometry("slab", context.seed + i * 997, i === 2);
    const size = slab.boundingBox!.getSize(new Vector3());
    add(slab.scale(0.62 / size.x, (height + 0.04) / size.y, 1.6 / size.z)
      .translate(x, y - 0.04, z), "stone");
    collider([0.62, height, 1.6], [x, y + height / 2, z]);
  }

  const dressingEntries = new Map<Surface, HrPropSite[]>();
  const releases: (() => void)[] = [];
  const baseVertices = new Map<Surface, number>();
  for (const [surface, parts] of batches.get(group)!) {
    baseVertices.set(surface, parts.reduce((count, part) => count + part.getAttribute("position").count, 0));
  }
  for (const part of createWorkshopDressing(context, side, offsetZ)) {
    const parts = batches.get(group)!.get(part.surface) ?? [];
    batches.get(group)!.set(part.surface, parts);
    const entries = dressingEntries.get(part.surface) ?? [];
    const center = part.bounds.getCenter(new Vector3()), size = part.bounds.getSize(new Vector3());
    // Bounds already contain the authored rotation. Keep the exact approved footprint.
    entries.push({ asset: selectHrProp(part.asset, center.x, center.z), x: center.x, z: center.z,
      size: [size.x, size.y, size.z], yaw: 0, tint: 1 });
    dressingEntries.set(part.surface, entries);
    parts.push(part.geometry);
    const key = `dressing-${part.surface}`;
    trianglesByCluster[key] = (trianglesByCluster[key] ?? 0) + part.geometry.getAttribute("position").count / 3;
  }
  group.add(fireGroup);
  for (const [parent, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts, false)!;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      let material = materials.get(surface);
      if (!material) { material = materialFor(surface); materials.set(surface, material); }
      const mesh = new Mesh(geometry, material);
      // P2 already recognizes this stone batch and the explicit bark opt-in.
      mesh.name = surface === "stone" ? "rock-stack-stones" : `workshop-${surface}${parent === fireGroup ? "-fire" : ""}`;
      if (surface === "wood") mesh.userData.photoSurface = "bark";
      mesh.userData.workshopBaseVertices = parent === group ? baseVertices.get(surface) ?? 0 : geometry.getAttribute("position").count;
      const entries = dressingEntries.get(surface);
      if (parent === group) {
        if (entries) {
          const retained = geometry.clone();
          const count = baseVertices.get(surface) ?? 0;
          // Workshop batches are non-indexed; retain every structural vertex.
          for (const name of Object.keys(retained.attributes)) {
            const attribute = retained.getAttribute(name);
            retained.setAttribute(name, new Float32BufferAttribute(Array.from(attribute.array).slice(0, count * attribute.itemSize), attribute.itemSize));
          }
          retained.computeBoundingBox(); retained.computeBoundingSphere();
          releases.push(bindHrProps(mesh, entries, context.heightAt, retained).dispose);
        } else {
          releases.push(bindWorkshopBatch(mesh, () => {}));
        }
      }
      parts.forEach(part => part.dispose());
      if (surface === "wood" || surface === "stone") releases.push(bindHrStructure(mesh, surface === "wood"));
      mesh.castShadow = surface !== "flower";
      mesh.receiveShadow = surface !== "flower";
      parent.add(mesh);
    }
  }

  let hrFire: ReturnType<typeof createHrFire> | undefined;
  const embers = new Set<MeshStandardMaterial>();
  const structure = group.children.find((child): child is Mesh => child instanceof Mesh && child.name === "workshop-wood");
  if (structure) {
    const release = bindSetpieces(structure, {
      file: "workshop",
      place(asset, add) {
        const turn = side === 1 ? 0 : Math.PI;
        for (const [name, sites, yawOffset] of [["brazier", hrBraziers, 0], ["torch", hrTorches, -yaw]] as const) {
          for (const at of sites) {
            const model = asset.piece(name);
            model.position.copy(at); model.rotation.y = yawOffset + turn;
            model.traverse(child => {
              if (child instanceof Mesh && (child.material as MeshStandardMaterial).name === "setpiece-embers") {
                embers.add(child.material as MeshStandardMaterial); child.castShadow = false;
              }
            });
            add(model);
          }
        }
        hrFire = createHrFire(hrFires, seedPhase);
        add(hrFire.group);
      },
      // The faceted tongues and octahedron sparks remain the Low / software fire.
      onToggle(active) { fireGroup.visible = !active; },
    });
    releases.push(() => { release(); hrFire?.dispose(); hrFire = undefined; embers.clear(); fireGroup.visible = true; });
  }

  let elapsed = 0, disposed = false;
  const baseFirePos = fireGroup.position.clone();
  return {
    zoneId: "workshop", group, colliders,
    interactable: {
      position: point(benchX, benchY, 0),
      label: { vi: "Bàn thợ cạnh suối", en: "Workbench by the stream" },
    },
    update(dt, reducedMotion) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.1);
      const pulse = Math.sin(elapsed * 9.5) * 0.11 + Math.cos(elapsed * 14.3) * 0.05;
      fireGroup.scale.set(
        1 + Math.cos(elapsed * 8.1) * 0.06,
        1 + pulse,
        1 + Math.sin(elapsed * 7.4) * 0.06,
      );
      fireGroup.position.set(
        baseFirePos.x + Math.sin(elapsed * 6.8) * 0.018 * side,
        baseFirePos.y + pulse * 0.06,
        baseFirePos.z + Math.cos(elapsed * 5.9) * 0.018,
      );
      fireGroup.rotation.z = Math.sin(elapsed * 5.4) * 0.025;
      hrFire?.setTime(elapsed);
      embers.forEach(material => { material.emissiveIntensity = 2.4 + pulse * 6 + Math.sin(elapsed * 3.1) * 0.5; });
      lights.forEach((light, index) => {
        const phase = elapsed * 10.2 + index * 1.9;
        light.intensity = 2.35 + Math.sin(phase) * 0.32 + Math.cos(phase * 1.6) * 0.16;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Restore render hooks before the deferred batch restores its fallback.
      releases.reverse().forEach(release => release());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
};
