import {
  BufferGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh,
  Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { CROWN_BASE, createPineCrown, createTreeTrunk } from "../foliage/shapes";
import { createRampMaterial } from "../materials/ramp";
import {
  PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Surface = "weathered" | "future" | "ink" | "needles" | "mound" | "flower";
interface Part {
  geometry: BufferGeometry;
  surface: Surface;
  x: number;
  z: number;
  solid: boolean;
  /** First triangles form the dark, rough foot of a boulder. */
  inkVertices?: number;
}

const MOUND = { x: 8.8, radiusX: 5.8, radiusZ: 9, columns: 16, rows: 24, height: 0.8 };
function moundVertexHeight(x: number, z: number) {
  const r2 = ((x - MOUND.x) / MOUND.radiusX) ** 2 + (z / MOUND.radiusZ) ** 2;
  return MOUND.height * Math.max(0, 1 - r2) ** 2;
}

/** Sample the actual triangle surface so stone feet meet the mesh, even between grid vertices. */
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

function mound() {
  const positions: number[] = [], indices: number[] = [];
  for (let iz = 0; iz <= MOUND.rows; iz++) {
    for (let ix = 0; ix <= MOUND.columns; ix++) {
      const x = MOUND.x - MOUND.radiusX + ix * 2 * MOUND.radiusX / MOUND.columns;
      const z = -MOUND.radiusZ + iz * 2 * MOUND.radiusZ / MOUND.rows;
      positions.push(x, moundVertexHeight(x, z), z);
      if (ix < MOUND.columns && iz < MOUND.rows) {
        const a = iz * (MOUND.columns + 1) + ix, c = a + MOUND.columns + 1;
        indices.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Unequal six-sided rings form a bulky fractured rock, with an off-centre chamfered summit. */
function stone(width: number, depth: number, height: number, lean: number, random: () => number, future = false) {
  const rings: Vector3[][] = [];
  const rim = Array.from({ length: 6 }, () => 0.84 + random() * 0.16);
  const top = Array.from({ length: 6 }, () => 0.86 + random() * 0.14);
  const peak = Math.max(...top);
  const cx = rim.reduce((sum, radius, i) => sum + Math.cos(i * Math.PI / 3 + 0.18) * depth * 0.5 * radius, 0) / 6;
  const cz = rim.reduce((sum, radius, i) => sum + Math.sin(i * Math.PI / 3 + 0.18) * width * 0.5 * radius, 0) / 6;
  for (const [level, scale] of [[0, 0.86], [0.13, 1], [0.72, 0.85], [1, 0.56]] as const) {
    rings.push(rim.map((radius, i) => {
      const angle = i * Math.PI / 3 + 0.18;
      const y = height * level * (level === 1 && !future ? top[i]! / peak : 1);
      return new Vector3((Math.cos(angle) * depth * 0.5 * radius - cx) * scale, y,
        (Math.sin(angle) * width * 0.5 * radius - cz) * scale + y * Math.tan(lean));
    }));
  }
  const positions: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3) => positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  // Dark foot first (12 side + 4 bottom triangles), so it can be batched with the ink trunk.
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    triangle(rings[0]![i]!, rings[1]![i]!, rings[0]![j]!);
    triangle(rings[0]![j]!, rings[1]![i]!, rings[1]![j]!);
  }
  for (let i = 1; i < 5; i++) triangle(rings[0]![0]!, rings[0]![i]!, rings[0]![i + 1]!);
  for (let ring = 1; ring < 3; ring++) {
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      triangle(rings[ring]![i]!, rings[ring + 1]![i]!, rings[ring]![j]!);
      triangle(rings[ring]![j]!, rings[ring + 1]![i]!, rings[ring + 1]![j]!);
    }
  }
  for (let i = 1; i < 5; i++) triangle(rings[3]![0]!, rings[3]![i + 1]!, rings[3]![i]!);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Neutral pigment multiplies the palette material, as in the existing procedural props. */
function wash(geometry: BufferGeometry) {
  const vertices = geometry.getAttribute("position");
  const colors: number[] = [];
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
      base: "ink", mix: "paper", amount: 0.45, saturation: 1, brightness: 1,
    }), ramp),
    future: createRampMaterial(paletteColor({
      base: "mist", mix: "paper", amount: 0.88, saturation: 1, brightness: 1,
    }), ramp),
    ink: createRampMaterial(paletteColor({
      base: "ink", mix: "forestDeep", amount: 0.3, saturation: 1, brightness: 1,
    }), ramp),
    needles: createRampMaterial(paletteColor(WORLD_DIRECTION.foliage.crown), ramp),
    mound: createRampMaterial(paletteColor({
      base: "forestLight", mix: "paper", amount: 0.35, saturation: 1, brightness: 1,
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
  return parts.every(part => {
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox!;
    const size = bounds.getSize(new Vector3());
    const stepsX = Math.ceil(size.x / 0.05), stepsZ = Math.ceil(size.z / 0.05);
    for (let ix = 0; ix <= stepsX; ix++) {
      for (let iz = 0; iz <= stepsZ; iz++) {
        const x = side * (part.x + bounds.min.x + size.x * ix / Math.max(1, stepsX));
        const z = part.z + offsetZ + bounds.min.z + size.z * iz / Math.max(1, stepsZ);
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
    parts.push({
      geometry: stone(width, depth, height, lean, random, future),
      surface: future ? "future" : "weathered", inkVertices: 16 * 3,
      x, z, solid: true,
    });
  }
  parts.push({
    geometry: createTreeTrunk().scale(1, 4.2, 1).translate(0, 2.1, 0),
    surface: "ink", x: 15, z: 2.7, solid: true,
  }, {
    geometry: createPineCrown(context.seed).translate(0, 2.1 - CROWN_BASE, 0),
    surface: "needles", x: 15, z: 2.7, solid: false,
  }, {
    geometry: mound(), surface: "mound", x: 0, z: 0, solid: false,
  });
  for (const [x, z] of [[4.15, -1.1], [5.15, 1.4]] as const) parts.push({
    geometry: new IcosahedronGeometry(0.065, 0).translate(0, 0.065, 0),
    surface: "flower", x, z, solid: false,
  });

  // Move the whole composition together to the flattest dry shoulder, keeping the target near the road.
  const placement = [0, -4, 4, -8, 8, -12, 12, -16, 16]
    .flatMap(offsetZ => [1, -1].map(side => ({ side, offsetZ, slope: slopeAtSite(context, side, offsetZ) })))
    .sort((a, b) => a.slope - b.slope)
    .find(({ side, offsetZ }) => fits(parts, context, side, offsetZ));
  if (!placement) {
    parts.forEach(part => part.geometry.dispose());
    throw new RangeError("Milestones needs a dry, clear hillside within the zone radius.");
  }
  const { side, offsetZ } = placement;
  const group = new Group();
  group.name = "milestones-hillside";
  const colliders: ZoneCollider[] = [];
  const batches: Record<Surface, BufferGeometry[]> = { weathered: [], future: [], ink: [], needles: [], mound: [], flower: [] };
  const surfaces = materials();
  let middle = new Vector3();
  for (const [index, part] of parts.entries()) {
    const geometry = part.geometry;
    const vertices = geometry.getAttribute("position");
    // Mirror the entire composition, including the mound, onto the dry bank.
    for (let i = 0; i < vertices.count; i++) {
      const localX = part.x + vertices.getX(i), localZ = part.z + vertices.getZ(i);
      const x = side * localX, z = localZ + offsetZ;
      const flatCap = part.surface === "future" && Math.abs(vertices.getY(i) - stones[index]![4]) < 1e-6;
      const ground = context.heightAt(x, z) + (part.surface === "mound" ? 0
        : flatCap ? moundHeight(part.x, part.z) : moundHeight(localX, localZ));
      vertices.setXYZ(i, x, vertices.getY(i) + ground, z);
    }
    if (!geometry.hasAttribute("color")) wash(geometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (part.solid) colliders.push({ center: bounds.getCenter(new Vector3()), size: bounds.getSize(new Vector3()) });
    if (index === 0) middle = bounds.getCenter(new Vector3());
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
    if (part.inkVertices) {
      for (const [start, end, surface] of [
        [0, part.inkVertices, "ink"], [part.inkVertices, flat.getAttribute("position").count, part.surface],
      ] as const) {
        const piece = new BufferGeometry();
        for (const [name, attribute] of Object.entries(flat.attributes)) {
          piece.setAttribute(name, new Float32BufferAttribute(
            attribute.array.slice(start * attribute.itemSize, end * attribute.itemSize), attribute.itemSize,
          ));
        }
        batches[surface].push(piece);
      }
      flat.dispose();
    } else batches[part.surface].push(flat);
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
