import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group,
  IcosahedronGeometry, Mesh, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createFern } from "../foliage/ground";
import { createFirstLightTree } from "../foliage/first-light-grove";
import { createPropMaterial } from "../props/materials";
import { createRockGeometry } from "../props/rocks";
import { createStumpGeometry } from "../props/wood";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Surface = "wood" | "cut" | "moss" | "node" | "vine" | "ink" | "flower";
type Part = {
  geometry: BufferGeometry; surface: Surface; level?: boolean; solid?: boolean;
  collision?: BufferGeometry;
  ends?: { point: Vector3; radius: number }[];
};
type Placement = { side: number; z: number };
const STUMP_SCALE = 1.6;
const STUMP_X = 6.4;
const CUT_HEIGHT = 1.28 * STUMP_SCALE;
const INTERACT_X = 4.7;
const INTERACT_HEIGHT = 1.15;
const BANK_SETBACK = 3;
const STUMP_RADIUS = 1.65 * 1.045 * STUMP_SCALE;
const MAX_GRADE = 0.4;
// Buttress roots stand well above the grass, then disappear into the soil.
const ROOT_RADIUS = 0.58;
const ROOT_STEPS = 12;
const SOIL_DEPTH = 0.05;

/** Separate selected faces without overlays, so creases cannot flicker over the wood. */
function inkFaces(part: BufferGeometry, dark: (triangle: number) => boolean, level = false): Part[] {
  const positions = part.getAttribute("position");
  const colors = part.getAttribute("color");
  const wood: number[] = [], ink: number[] = [];
  const woodColors: number[] = [], inkColors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const target = dark(Math.floor(i / 3)) ? ink : wood;
    target.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    if (colors) (target === wood ? woodColors : inkColors).push(colors.getX(i), colors.getY(i), colors.getZ(i));
  }
  part.dispose();
  return ([[wood, "wood"], [ink, "ink"]] as const).map(([vertices, surface]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    if (colors) geometry.setAttribute("color", new Float32BufferAttribute(surface === "wood" ? woodColors : inkColors, 3));
    return { geometry, surface, level, solid: true };
  });
}

function geometry(positions: number[], indices: number[]): BufferGeometry {
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const result = indexed.toNonIndexed();
  indexed.dispose();
  return result;
}

/** Preserve the original box footprints, including their terrain support samples. */
function collisionStump(phase: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const radii = [1.65, 1.55, 1.42, 1.32];
  const heights = [0, 0.18, 1.16, 1.28];
  for (let ring = 0; ring < 4; ring++) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const r = radii[ring]! * (1 + Math.sin(a * 3 + phase) * 0.045);
      positions.push((Math.cos(a) * r + ring * 0.018) * STUMP_SCALE,
        heights[ring]! * STUMP_SCALE, Math.sin(a) * r * STUMP_SCALE);
      if (ring < 3) {
        const p = ring * 12 + i, q = ring * 12 + (i + 1) % 12;
        indices.push(p, p + 12, q, q, p + 12, q + 12);
      }
    }
  }
  return geometry(positions, indices);
}

/** Enlarge the kit's buttresses and end grain, folding six V fissures into its bark.
 * The cap's pigment rings remain part of the surface, with no coplanar overlays.
 */
function stumpParts(seed: number, phase: number): Part[] {
  const kit = createStumpGeometry(seed);
  const p = kit.getAttribute("position"), c = kit.getAttribute("color");
  const height = kit.boundingBox!.max.y;
  // Kit shoulder is at 30% height; its remaining stations belong to the cut rim.
  const shoulder = p.getY(1);
  const cutRadius = Math.hypot(p.getX(73) - 0.025, p.getZ(73) - 0.01);
  let footRadius = 0;
  for (let i = 0; i < 72; i++) {
    if (p.getY(i) === 0) footRadius = Math.max(footRadius, Math.hypot(p.getX(i), p.getZ(i)));
  }
  const map = (i: number): Vector3 => {
    const y = p.getY(i), upper = y > shoulder + 0.001;
    const cx = upper ? 0.025 : y > 0 ? 0.015 : 0;
    const cz = upper ? 0.01 : 0;
    const dx = p.getX(i) - cx, dz = p.getZ(i) - cz;
    // Keep the kit's flared, alternating foot; broaden the working tabletop.
    const scale = upper ? 2.1 / cutRadius
      : y > 0 ? 2.33 / Math.hypot(p.getX(1) - 0.015, p.getZ(1)) : 2.7 / footRadius;
    return new Vector3(dx * scale + (upper ? 0.0864 : 0),
      upper ? CUT_HEIGHT : y / height * CUT_HEIGHT - SOIL_DEPTH,
      dz * scale);
  };
  const bark: number[] = [], barkColors: number[] = [], cut: number[] = [], cutColors: number[] = [];
  const emit = (target: number[], colors: number[], points: Vector3[], color: Color) => {
    for (const point of points) { target.push(point.x, point.y, point.z); colors.push(color.r, color.g, color.b); }
  };
  // Kit sides are quads, six consecutive vertices each; bottom and cap follow.
  for (let i = 0; i < 48 * 3; i += 6) {
    const a = map(i), b = map(i + 1), d = map(i + 5), top = map(i + 2);
    const fissure = Math.floor(i / 6) % 2 === 0;
    const stops = fissure ? [0, 0.4, 0.5, 0.6, 1] : [0, 1];
    const edge = (t: number, high: boolean) => {
      const point = (high ? b : a).clone().lerp(high ? top : d, t);
      if (t === 0.5) {
        const inward = new Vector3(point.x - 0.04, 0, point.z).normalize();
        point.addScaledVector(inward, -0.11);
        point.x += Math.sin(phase + Math.floor(i / 6) % 12) * 0.025 * (point.y / CUT_HEIGHT * 2 - 1);
      }
      return point;
    };
    for (let j = 0; j < stops.length - 1; j++) {
      const l = stops[j]!, r = stops[j + 1]!;
      const color = new Color().fromBufferAttribute(c, i);
      if (l === 0.4 || l === 0.5) color.lerp(new Color(PALETTE.rockDark), 0.6);
      const upper = (t: number) => {
        const point = edge(t, true);
        if (i >= 72) {
          point.addScaledVector(new Vector3(point.x - 0.0864, 0, point.z).normalize(), 0.07);
          point.y -= 0.09;
        }
        return point;
      };
      emit(bark, barkColors, [edge(l, false), upper(l), upper(r),
        edge(l, false), upper(r), edge(r, false)], color);
      if (i >= 72) emit(bark, barkColors, [upper(l), edge(l, true), edge(r, true),
        upper(l), edge(r, true), upper(r)], color);
    }
  }
  for (let i = 48 * 3; i < p.count; i += 3) {
    const isCut = i >= 60 * 3;
    const color = new Color().fromBufferAttribute(c, i);
    const ring = new Color(PALETTE.sand).lerp(new Color(PALETTE.dusk), 0.095);
    if (isCut && Math.abs(color.r - ring.r) + Math.abs(color.g - ring.g) + Math.abs(color.b - ring.b) < 1e-6) {
      color.set(PALETTE.sand).lerp(new Color(PALETTE.rockDark), 0.24);
    }
    emit(isCut ? cut : bark, isCut ? cutColors : barkColors,
      [map(i), map(i + 1), map(i + 2)], color);
  }
  kit.dispose();
  const make = (positions: number[], colors: number[]) => {
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    result.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return result;
  };
  const legacy = inkFaces(collisionStump(phase), triangle => triangle < 24, true);
  const result = inkFaces(make(bark, barkColors), triangle => triangle % 12 === 0, true);
  result.forEach((part, i) => { part.collision = legacy[i]!.geometry; });
  return result;
}

/** A broad half-section with an arched crest and a continuously buried underside. */
function root(points: Vector3[], radius: number, buried = true, raised = true, arch = 0.35): BufferGeometry {
  const curve = new CatmullRomCurve3(points);
  const positions: number[] = [], indices: number[] = [];
  const steps = ROOT_STEPS, sides = 8;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps, p = curve.getPoint(t), tangent = curve.getTangent(t);
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();
    const r = radius * (1 - t * 0.87);
    for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides;
      const lift = raised ? p.y + Math.sin(Math.PI * t) * radius * arch : 0;
      const y = buried ? Math.max(0, radius * 0.2 * (1 - t * 0.75)
        + Math.sin(a) * r * (raised ? 0.95 : 0.62) + lift * Math.max(0, Math.sin(a)))
        - (raised ? SOIL_DEPTH : 0) : p.y + (1 + Math.sin(a)) * r * 0.62;
      positions.push(p.x + normal.x * Math.cos(a) * r, y, p.z + normal.z * Math.cos(a) * r);
      if (step < steps) {
        const v = step * sides + i, w = step * sides + (i + 1) % sides;
        indices.push(v, w, v + sides, w, w + sides, v + sides);
      }
    }
  }
  // Closed ends; the broad start is buried in the stump.
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i + 1, i, steps * sides, steps * sides + i, steps * sides + i + 1);
  }
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i], indices[i + 1]] = [indices[i + 1]!, indices[i]!];
  }
  return geometry(positions, indices);
}

function rootParts(points: Vector3[], radius: number, oldRadius: number, arch = 0.35): Part[] {
  const parts = inkFaces(root(points, radius, true, true, arch),
    triangle => triangle < ROOT_STEPS * 16 && Math.floor(triangle / 2) % 8 === 3);
  const legacyPoints = points.map(p => p.clone().setY(0));
  const legacy = inkFaces(root(legacyPoints, oldRadius, true, false),
    triangle => triangle < ROOT_STEPS * 16 && Math.floor(triangle / 2) % 8 === 3);
  parts.forEach((part, i) => { part.collision = legacy[i]!.geometry; });
  parts[0]!.ends = [{ point: points[0]!, radius }, { point: points.at(-1)!, radius: radius * 0.13 }];
  // Moss follows the upper two flanks, sharing the existing green batch.
  const moss = root(points, radius, true, true, arch);
  const mp = moss.getAttribute("position"), crest: number[] = [];
  for (let i = 0; i < ROOT_STEPS * 48; i += 3) {
    const flank = Math.floor(i / 6) % 8;
    if (flank !== 1 && flank !== 2) continue;
    for (let j = 0; j < 3; j++) crest.push(mp.getX(i + j), mp.getY(i + j) + 0.012, mp.getZ(i + j));
  }
  moss.dispose();
  const cover = new BufferGeometry();
  cover.setAttribute("position", new Float32BufferAttribute(crest, 3));
  parts.push({ geometry: cover, surface: "moss" });
  return parts;
}

function makeParts(seed: number): Part[] {
  const phase = (Math.imul(seed ^ 0x5f3759df, 1664525) >>> 0) / 4294967296 * Math.PI * 2;
  const parts: Part[] = [
    ...stumpParts(seed, phase),
  ];
  // Begin beneath the enlarged rim so both S bends emerge beyond the stump.
  // The road-facing tips turn along the verge, a metre clear.
  const ends = [
    [-0.65, -3.5], [-0.7, 3.6], [1.5, 5], [4.6, 3.8],
    [5.9, 0.6], [4.4, -3.7], [1, -5.1],
  ] as const;
  const arms: Vector3[][] = [];
  ends.forEach(([x, z], i) => {
    const end = new Vector3(x, 0, z);
    const start = end.clone().normalize().multiplyScalar(2.2);
    const normal = new Vector3(-end.z, 0, end.x).normalize();
    const bend = (0.95 + Math.sin(phase + i * 1.7) * 0.07) * (i % 2 ? -1 : 1);
    const points = [start,
      start.clone().lerp(end, 0.3).addScaledVector(normal, bend),
      start.clone().lerp(end, 0.7).addScaledVector(normal, -bend * 0.72), end];
    arms.push(points);
    parts.push(...rootParts(points, ROOT_RADIUS - i % 3 * 0.045, 0.125 - i % 3 * 0.0075, i % 2 ? 0.2 : 0.8));
  });
  // Two cross-links turn the radial silhouette into a small connected network.
  for (const [a, b] of [[3, 4], [5, 6]] as const) {
    const from = arms[a]![3]!, to = arms[b]![3]!;
    parts.push(...rootParts([from, from.clone().lerp(to, 0.5).add(new Vector3(0.23, 0, 0.18)), to], 0.25, 0.09));
  }
  for (const index of [3, 4, 6]) {
    const p = arms[index]![3]!;
    const pebble = createRockGeometry("pebble", seed + index);
    const size = pebble.boundingBox!.getSize(new Vector3());
    const colors = pebble.getAttribute("color");
    const mist = new Color(PALETTE.mist), dark = new Color(PALETTE.rockDark);
    for (let i = 0; i < colors.count; i++) {
      const color = mist.clone().lerp(dark, 0.04 + (1 - colors.getX(i)) * 0.1);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    pebble.scale(0.5 / size.x, 0.18 / size.y, 0.42 / size.z)
      .rotateY(phase + index).translate(p.x, -SOIL_DEPTH, p.z);
    parts.push({ geometry: pebble, surface: "node", solid: true,
      collision: new IcosahedronGeometry(1, 0).scale(0.32, 0.1, 0.28)
        .rotateY(phase + index).translate(p.x, 0.12, p.z) });
  }
  // Only two narrow blue-green vines; there is no emission or animated data effect.
  for (const index of [3, 6]) {
    const points = arms[index]!.map((p, i) => p.clone().add(new Vector3(0.04,
      (ROOT_RADIUS - index % 3 * 0.045) * (0.2 * (1 - i / 3 * 0.75)
        + (1 - i / 3 * 0.87) * 0.95 + Math.sin(Math.PI * i / 3) * (index % 2 ? 0.2 : 0.8))
        - SOIL_DEPTH + 0.015, 0.03)));
    parts.push({ geometry: root(points, 0.025, false), surface: "vine" });
  }
  // Two tiny wildflowers at the near rim leave the end grain and its approach open.
  for (const [x, z] of [[-0.95, -0.45], [-0.88, -0.65]]) {
    parts.push({ geometry: new IcosahedronGeometry(0.075, 0).scale(1, 0.55, 1)
      .translate(x! * STUMP_SCALE, CUT_HEIGHT + 0.06, z! * STUMP_SCALE), surface: "flower", level: true });
  }
  for (const [x, z] of [[0.8, 0.7], [-0.8, -0.6]]) {
    parts.push({ geometry: new IcosahedronGeometry(1, 0).scale(0.46, 0.1, 0.31)
      .rotateY(phase).translate(x! * STUMP_SCALE, CUT_HEIGHT + 0.04, z! * STUMP_SCALE), surface: "moss", level: true });
  }
  return parts;
}

/** Sample the whole support and a three-metre buffer, rejecting banks in any direction.
 * A half-metre guard covers gaps between the half-metre grid samples.
 */
function awayFromBank(x: number, z: number, radius: number, context: ZoneSceneContext): boolean {
  if (context.underWater(x, z)) return false;
  const reach = radius + BANK_SETBACK + 0.5;
  for (let dx = -reach; dx <= reach; dx += 0.5) {
    for (let dz = -reach; dz <= reach; dz += 0.5) {
      if (Math.hypot(dx, dz) > reach) continue;
      const px = x + dx, pz = z + dz;
      const h = context.heightAt(px, pz);
      const gradeX = (context.heightAt(px + 0.25, pz) - context.heightAt(px - 0.25, pz)) / 0.5;
      const gradeZ = (context.heightAt(px, pz + 0.25) - context.heightAt(px, pz - 0.25)) / 0.5;
      if (!Number.isFinite(h) || !Number.isFinite(gradeX) || !Number.isFinite(gradeZ)
        || Math.hypot(gradeX, gradeZ) > MAX_GRADE || context.underWater(px, pz)) return false;
    }
  }
  return true;
}

/** Check whole conservative footprints, including the interiors of collider boxes. */
function fits(parts: Part[], placement: Placement, context: ZoneSceneContext): boolean {
  if (!awayFromBank(placement.side * STUMP_X, placement.z, STUMP_RADIUS, context)
    || !awayFromBank(placement.side * INTERACT_X, placement.z, 0, context)) return false;
  for (const { geometry, ends } of parts) {
    for (const { point, radius } of ends ?? []) {
      const x = placement.side * (STUMP_X + point.x), z = placement.z + point.z;
      if (Math.abs(x) - radius < PATH_CLEARANCE + 1) return false;
      // Check a conservative square around each end against curved path verges too.
      const margin = radius + 1;
      const steps = Math.ceil(margin * 2 / 0.2);
      for (let ix = 0; ix <= steps; ix++) {
        for (let iz = 0; iz <= steps; iz++) {
          if (context.onPath(x - margin + ix / steps * margin * 2,
            z - margin + iz / steps * margin * 2)) return false;
        }
      }
    }
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const xa = placement.side * (STUMP_X + box.min.x), xb = placement.side * (STUMP_X + box.max.x);
    const minX = Math.min(xa, xb), maxX = Math.max(xa, xb);
    const minZ = box.min.z + placement.z, maxZ = box.max.z + placement.z;
    const nx = Math.max(1, Math.ceil((maxX - minX) / 0.2));
    const nz = Math.max(1, Math.ceil((maxZ - minZ) / 0.2));
    for (let ix = 0; ix <= nx; ix++) {
      for (let iz = 0; iz <= nz; iz++) {
        const x = minX + (maxX - minX) * ix / nx, z = minZ + (maxZ - minZ) * iz / nz;
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)) return false;
        const h = context.heightAt(x, z);
        if (!Number.isFinite(h) || Math.hypot(x, Math.abs(h) + CUT_HEIGHT + 0.15, z) > ZONE_BUDGET.radius) return false;
      }
    }
  }
  return true;
}

export const createRootsScene: ZoneSceneFactory = context => {
  // Neighbouring candidates overlap; reuse pure terrain samples during this build only.
  const heights = new Map<string, number>();
  const sampleHeight = context.heightAt.bind(context);
  context = { ...context, heightAt(x, z) {
    const key = `${x},${z}`;
    let h = heights.get(key);
    if (h === undefined) { h = sampleHeight(x, z); heights.set(key, h); }
    return h;
  } };
  const parts = makeParts(context.seed);
  let placement: Placement | undefined;
  // The approach end offers a broad shoulder on the authored terrain. Prefer it
  // after the origin so repeated world mounts do not exhaust the bank-side sites.
  for (const z of [0, -20, -5, 5, -10, 10, -15, 15, 20]) {
    for (const side of [1, -1]) {
      const candidate = { side, z };
      if (fits(parts, candidate, context)) { placement = candidate; break; }
    }
    if (placement) break;
  }
  if (!placement) {
    parts.forEach(part => { part.geometry.dispose(); part.collision?.dispose(); });
    throw new RangeError("The Roots needs a dry, gentle verge three metres clear of the bank.");
  }
  const { side, z: offsetZ } = placement;
  // Independent soft details never participate in choosing the stump site or its colliders.
  // Two soft clusters at the rear foot; their foliage budget belongs to the shared kit.
  for (const [x, z, scale] of [[2.5, 1.3, 0.5], [2.35, -1.4, 0.42]]) {
    const fern = createFern().scale(scale!, scale!, scale!).rotateY(context.seed * 0.01 + x!)
      .translate(x!, -SOIL_DEPTH, z!);
    const flat = fern.toNonIndexed();
    fern.dispose();
    const details: Part[] = [
      { geometry: flat, surface: "moss" },
      { geometry: new IcosahedronGeometry(1, 0).scale(0.4, 0.075, 0.3)
        .translate(x! - 0.3, 0.025, z!), surface: "moss" },
    ];
    if (fits(details, placement, context)) parts.push(...details);
    else details.forEach(part => part.geometry.dispose());
  }
  const ground = context.heightAt(side * STUMP_X, offsetZ);
  const batches = new Map<Surface, BufferGeometry[]>();
  const colliders: ZoneCollider[] = [];
  for (const part of parts) {
    part.geometry.deleteAttribute("uv");
    const positions = part.geometry.getAttribute("position");
    const originalColors = part.geometry.getAttribute("color");
    const tint = part.surface === "wood"
      ? new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), 0.46).lerp(new Color(PALETTE.dusk), 0.08)
      : part.surface === "ink" ? new Color(PALETTE.rockDark).lerp(new Color(PALETTE.forestDeep), 0.35)
        : new Color(1, 1, 1);
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = side * (STUMP_X + positions.getX(i)), z = positions.getZ(i) + offsetZ;
      const y = positions.getY(i), terrain = context.heightAt(x, z);
      // The foot follows the hill, while the upper bevel and end grain stay level.
      const base = part.level ? terrain + (ground - terrain) * Math.max(0, Math.min(1, y / (1.16 * STUMP_SCALE))) : terrain;
      positions.setXYZ(i, x, y + base, z);
      const wash = 0.955 + Math.sin(x * 13 + z * 9 + y * 5) * 0.025;
      if (originalColors) colors.push(originalColors.getX(i) * wash, originalColors.getY(i) * wash, originalColors.getZ(i) * wash);
      else colors.push(tint.r * wash, tint.g * wash, tint.b * wash);
    }
    // Reflection changes winding; keep the visible faces outward on the left verge.
    if (side < 0) {
      for (let i = 0; i < positions.count; i += 3) {
        const first = new Vector3().fromBufferAttribute(positions, i);
        positions.setXYZ(i, positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
        positions.setXYZ(i + 1, first.x, first.y, first.z);
        for (let channel = 0; channel < 3; channel++) {
          const value = colors[i * 3 + channel]!;
          colors[i * 3 + channel] = colors[(i + 1) * 3 + channel]!;
          colors[(i + 1) * 3 + channel] = value;
        }
      }
    }
    part.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    if (part.solid) {
      // Physics retains the authored pre-r4 boxes independently of the richer silhouette.
      const collision = part.collision;
      if (collision) {
        const p = collision.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const x = side * (STUMP_X + p.getX(i)), z = p.getZ(i) + offsetZ;
          const y = p.getY(i), terrain = context.heightAt(x, z);
          const base = part.level ? terrain + (ground - terrain) * Math.min(1, y / (1.16 * STUMP_SCALE)) : terrain;
          p.setXYZ(i, x, y + base, z);
        }
        collision.computeBoundingBox();
      }
      const box = (collision ?? part.geometry).boundingBox!;
      colliders.push({ center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) });
      collision?.dispose();
    }
    const batch = batches.get(part.surface) ?? [];
    batch.push(part.geometry);
    batches.set(part.surface, batch);
  }
  const group = new Group();
  group.name = "roots";
  const ancientGeometry = createFirstLightTree(1);
  // Keep the tree inside the unchanged zone sphere even at offset sites.
  const treeOrigin = new Vector3(side * (STUMP_X + 0.0864), ground + CUT_HEIGHT - 0.28, offsetZ);
  const vertices = ancientGeometry.getAttribute("position");
  const vertex = new Vector3();
  let scale = 2.74;
  while (Array.from({ length: vertices.count }, (_, i) =>
    vertex.fromBufferAttribute(vertices, i).multiplyScalar(scale).add(treeOrigin).length())
    .some(radius => radius > ZONE_BUDGET.radius)) scale *= 0.95;
  ancientGeometry.scale(scale, scale, scale).translate(...treeOrigin.toArray());
  ancientGeometry.computeVertexNormals();
  const ancientMaterial = createPropMaterial("wood");
  ancientMaterial.color.setRGB(1, 1, 1);
  const ancientTree = new Mesh(ancientGeometry, ancientMaterial);
  ancientTree.name = "roots-ancient-tree";
  ancientTree.castShadow = true;
  group.add(ancientTree);
  for (const [surface, batch] of batches) {
    const merged = mergeGeometries(batch, false)!;
    batch.forEach(part => part.dispose());
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
    if (surface === "moss") material.color.set(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.6);
    if (surface === "vine") material.color.set(PALETTE.forestDeep);
    if (surface === "flower") material.color.set(PALETTE.flower);
    // Kit pigments are already in linear vertex colors; avoid a second material tint.
    if (["wood", "ink", "cut", "node"].includes(surface)) material.color.setRGB(1, 1, 1);
    const mesh = new Mesh(merged, material);
    mesh.name = `roots-${surface}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    zoneId: "roots", group, colliders,
    interactable: {
      position: new Vector3(side * INTERACT_X,
        context.heightAt(side * INTERACT_X, offsetZ) + INTERACT_HEIGHT, offsetZ),
      label: { en: "The ancient tree", vi: "Cây cổ thụ" },
    },
    // A still tableau: the thick roots and their tiny vines never move.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const child of group.children) {
        if (child instanceof Mesh) { child.geometry.dispose(); child.material.dispose(); }
      }
      group.clear();
    },
  };
};
