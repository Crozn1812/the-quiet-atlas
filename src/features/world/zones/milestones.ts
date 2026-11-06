import {
  Box3, BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh,
  Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { TRUNK_HEIGHT } from "../foliage/colliders";
import { createPineCrownV2 } from "../foliage/pine";
import { createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial, RAMP_PRESETS } from "../materials/ramp";
import { createRockGeometry } from "../props/rocks";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Surface = "weathered" | "future" | "ink" | "needles" | "flower";
interface Part {
  geometry: BufferGeometry;
  surface: Surface;
  x: number;
  z: number;
  solid: boolean;
  /** Preserve the previous collision/interaction centres while grounding the visible stone. */
  collisionGeometry?: BufferGeometry;
  collisionCapHeight?: number;
}

// The removed mound survives only as a reference for the existing collider centres.
const MOUND = { x: 8.8, radiusX: 5.8, radiusZ: 9, columns: 12, rows: 18, height: 0.8 };
function moundVertexHeight(x: number, z: number) {
  const r2 = ((x - MOUND.x) / MOUND.radiusX) ** 2 + (z / MOUND.radiusZ) ** 2;
  return MOUND.height * Math.max(0, 1 - r2) ** 2;
}

/** Sample the former triangle surface solely to retain collider/target placement. */
function moundHeight(x: number, z: number) {
  const dx = 2 * MOUND.radiusX / MOUND.columns, dz = 2 * MOUND.radiusZ / MOUND.rows;
  const u = (x - (MOUND.x - MOUND.radiusX)) / dx, v = (z + MOUND.radiusZ) / dz;
  if (u < 0 || u >= MOUND.columns || v < 0 || v >= MOUND.rows) return 0;
  const ix = Math.floor(u), iz = Math.floor(v), tx = u - ix, tz = v - iz;
  const x0 = MOUND.x - MOUND.radiusX + ix * dx, z0 = -MOUND.radiusZ + iz * dz;
  const a = moundVertexHeight(x0, z0), b = moundVertexHeight(x0 + dx, z0);
  const c = moundVertexHeight(x0, z0 + dz), d = moundVertexHeight(x0 + dx, z0 + dz);
  return tx + tz <= 1 ? a + tx * (b - a) + tz * (c - a)
    : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
}

function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Stand the kit's layered slab on edge: its broad cut faces the road (-X).
 * Refine only the broad faces so lichen can form small islands. The kit still
 * owns the bevels and strata; deform its six corners before refining the faces.
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
      const scale = scales[corner]!;
      // One chipped shoulder and unequal corner radii break the machined hexagon.
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
      // A shallow, off-centre swell bends the refined cut instead of leaving a flat cap.
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
    if (!future && Math.abs(normal.x) > 0.99) {
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

/** Author palette pigment before terrain draping, divided by the batch base. */
function weatherStone(geometry: BufferGeometry, height: number, width: number, seed: number, future = false) {
  const p = geometry.getAttribute("position"), c = geometry.getAttribute("color");
  const base = new Color(paletteColor({ base: "rock", mix: "rockDark", amount: future ? 0 : 0.24,
    saturation: 1, brightness: 1 }));
  const moss = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.32);
  const lichen = new Color(PALETTE.paper).lerp(new Color(PALETTE.rock), 0.32);
  const random = randomFor(seed);
  const islands = Array.from({ length: 5 }, () => ({
    y: height * (0.22 + random() * 0.65), z: width * (random() - 0.5) * 0.7,
    ry: height * (0.07 + random() * 0.09), rz: width * (0.08 + random() * 0.1),
  }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const pigment = new Color().fromBufferAttribute(c, i);
    if (future) pigment.lerp(new Color(PALETTE.sand), 0.2);
    const edge = 0.25 + 0.08 * Math.sin(z * 13 + seed) + 0.04 * Math.cos(x * 17);
    const mossAmount = Math.max(0, Math.min(1, (edge - y) / 0.18)) * (future ? 0.2 : 0.8);
    pigment.lerp(moss, mossAmount);
    if (!future && y > 0.2) {
      const spread = Math.min(...islands.map(patch => ((y - patch.y) / patch.ry) ** 2 + ((z - patch.z) / patch.rz) ** 2));
      const ragged = 0.18 * Math.sin(y * 31 + z * 23 + seed);
      pigment.lerp(lichen, Math.max(0, Math.min(0.85, (1.25 + ragged - spread) * 0.8)));
    }
    c.setXYZ(i, pigment.r / base.r, pigment.g / base.g, pigment.b / base.b);
  }
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
  const result = {
    weathered: createRampMaterial(paletteColor({
      base: "rock", mix: "rockDark", amount: 0.24, saturation: 1, brightness: 1,
    }), ramp),
    future: createRampMaterial(paletteColor({
      base: "rock", mix: "rockDark", amount: 0, saturation: 1, brightness: 1,
    }), ramp),
    ink: createRampMaterial(paletteColor({
      base: "rockDark", mix: "rockDark", amount: 0, saturation: 1, brightness: 1,
    }), ramp),
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
  // Reserve a dry approach from the road to the target, without scanning the removed overlay.
  footprints.push({ bounds: new Box3(new Vector3(3, 0, -1.2), new Vector3(5.3, 0, 1.2)), x: 0, z: 0 });
  return footprints.every(({ bounds, x: originX, z: originZ }) => {
    const size = bounds.getSize(new Vector3());
    // Lead perf (2026-11-06): 10 cm footprint sampling, edges included (5 cm cost 1.47 s per mount, now ~0.42 s; same placement).
    const stepsX = Math.ceil(size.x / 0.1), stepsZ = Math.ceil(size.z / 0.1);
    for (let ix = 0; ix <= stepsX; ix++) {
      for (let iz = 0; iz <= stepsZ; iz++) {
        const x = side * (originX + bounds.min.x + size.x * ix / Math.max(1, stepsX));
        const z = originZ + offsetZ + bounds.min.z + size.z * iz / Math.max(1, stepsZ);
        const y = context.heightAt(x, z);
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)
          || !Number.isFinite(y) || Math.hypot(x, y + bounds.max.y + MOUND.height, z) > ZONE_BUDGET.radius) return false;
      }
    }
    return true;
  });
}

/** Prefer a level shoulder behind the road's lip, rather than draping rocks down its steep face. */
function slopeAtSite(context: ZoneSceneContext, side: number, offsetZ: number) {
  let steepest = 0;
  // Cover the complete mound and the road-facing approach; use the same local terrain as the feet.
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
  // Numerically equal slopes keep the authored order, including on a uniform gentle incline.
  return Math.round(steepest * 1e6) / 1e6;
}

export const createMilestonesScene: ZoneSceneFactory = context => {
  const random = randomFor(context.seed);
  const parts: Part[] = [];
  // The large road-facing rock is followed by six irregularly spaced companions, not a memorial arc.
  const stones = [
    [4.7, 0, 2.2, 1.02, 2.4],
    [6.8, -3.1, 1.16, 0.83, 1.28], [9.5, -4.8, 1.32, 1.04, 1.52],
    [10.9, -1.4, 0.98, 0.86, 1.08], [7.4, 2.6, 1.28, 0.91, 1.41],
    [10.3, 4.2, 1.08, 0.96, 1.19], [11.5, 1.4, 1.36, 1.1, 1.56],
    [6.1, -7.1, 1.12, 0.88, 0.36], [8.2, 7.2, 1.25, 0.96, 0.43],
  ] as const;
  for (const [index, [x, z, width, depth, height]] of stones.entries()) {
    const future = index >= 7;
    const lean = (3 + random() * 5) * Math.PI / 180 * (index % 2 ? -1 : 1);
    const seed = (context.seed + Math.imul(index + 1, 2654435761)) >>> 0;
    const geometry = stone(width, depth, height, lean, seed, future);
    weatherStone(geometry, height, width, seed, future);
    parts.push({
      geometry, surface: future ? "future" : "weathered",
      collisionGeometry: stone(width, depth, height, lean, seed, future, false),
      collisionCapHeight: future ? height : undefined,
      x, z, solid: true,
    });
  }
  // Four loose chips settle into the target's foot beside the two small wildflowers.
  for (const [index, [x, z]] of ([[4.12, -0.72], [4.23, 0.68], [4.98, -0.99], [5.05, 0.85]] as const).entries()) {
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
  // V2's bark/needle pigments are retained in the shared batch, including the root sleeve.
  crown.deleteAttribute("surface");
  parts.push({
    geometry: createTreeTrunk().scale(1, 4.2, 1).translate(0, 2.1, 0),
    surface: "ink", x: 15, z: 2.7, solid: true,
  }, {
    geometry: crown,
    surface: "needles", x: 15, z: 2.7, solid: false,
  });
  for (const [x, z] of [[4.15, -1.1], [5.15, 1.4]] as const) parts.push({
    geometry: new IcosahedronGeometry(0.065, 0).translate(0, 0.065, 0),
    surface: "flower", x, z, solid: false,
  });

  // Arrival faces local +Z. Prefer a dry shoulder ahead of the signpost so the
  // complete kit stays in the default camera, then choose the gentlest slope.
  // A rise/run above 0.5 remains a last resort rather than winning on visibility.
  // Retain upstream sites only as a fallback for constrained custom terrain.
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
  // Nonindexed kit faces repeat contact coordinates; sample expensive terrain only once per point.
  const groundSamples = new Map<number, Map<number, number>>();
  const groundAt = (x: number, z: number) => {
    let row = groundSamples.get(x);
    if (!row) { row = new Map(); groundSamples.set(x, row); }
    let y = row.get(z);
    if (y === undefined) { y = context.heightAt(x, z); row.set(z, y); }
    return y;
  };
  let middle = new Vector3();
  for (const [index, part] of parts.entries()) {
    const geometry = part.geometry;
    const vertices = geometry.getAttribute("position");
    const collisionBounds = new Box3();
    if (part.collisionGeometry) {
      const reference = part.collisionGeometry.getAttribute("position");
      for (let i = 0; i < reference.count; i++) {
        const localX = part.x + reference.getX(i), localZ = part.z + reference.getZ(i);
        const x = side * localX, z = localZ + offsetZ;
        const flatCap = part.collisionCapHeight !== undefined && Math.abs(reference.getY(i) - part.collisionCapHeight) < 1e-6;
        collisionBounds.expandByPoint(new Vector3(x, reference.getY(i) + groundAt(x, z)
          + (flatCap ? moundHeight(part.x, part.z) : moundHeight(localX, localZ)), z));
      }
      part.collisionGeometry.dispose();
    }
    // Mirror the entire composition onto the dry bank; feet now meet the terrain itself.
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
      // Extend symmetrically to enclose the grounded silhouette without moving a collider centre.
      const size = new Vector3().subVectors(bounds.max, center).max(new Vector3().subVectors(center, bounds.min)).multiplyScalar(2);
      colliders.push({ center, size });
      if (index === 0) middle = center.clone();
    }
    // A consistent nonindexed layout allows the existing indexed pine shapes to share the batch path.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute("uv");
    if (side < 0) {
      // Reflection reverses winding; restore outward faces without making materials double-sided.
      for (const attribute of Object.values(flat.attributes)) {
        for (let i = 0; i < attribute.count; i += 3) {
          for (let component = 0; component < attribute.itemSize; component++) {
            const a = (i + 1) * attribute.itemSize + component, b = (i + 2) * attribute.itemSize + component;
            [attribute.array[a], attribute.array[b]] = [attribute.array[b]!, attribute.array[a]!];
          }
        }
      }
      const normals = flat.getAttribute("normal");
      for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
    }
    batches[part.surface].push(flat);
    if (flat !== geometry) geometry.dispose();
  }
  for (const surface of Object.keys(batches) as Surface[]) {
    const geometry = mergeGeometries(batches[surface], false)!;
    batches[surface].forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, surfaces[surface]);
    mesh.name = `milestones-${surface}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    zoneId: "milestones", group, colliders,
    interactable: { position: middle, label: { vi: "Cụm đá dấu mốc", en: "Milestone rocks" } },
    // Stone and the solitary pine are deliberately still, including in reduced-motion mode.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      Object.values(surfaces).forEach(material => material.dispose());
      group.clear();
    },
  };
};
